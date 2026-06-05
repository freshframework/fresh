import type { Plugin } from "vite";
import type {
  Loader,
  MediaType as DenoMediaType,
  RequestedModuleType as DenoRequestedModuleType,
} from "@deno/loader";
import * as path from "@std/path";
import * as babel from "@babel/core";
import { httpAbsolute } from "./patches/http_absolute.ts";
import { JS_REG, JSX_REG } from "../utils.ts";
import { builtinModules } from "node:module";

// @ts-ignore Workaround for https://github.com/denoland/deno/issues/30850
const { default: babelReact } = await import("@babel/preset-react");

const BUILTINS = new Set(builtinModules);
const NODE_BUILTIN_PREFIX = "\0fresh-node-builtin::";

type LoaderModule = typeof import("@deno/loader");

let MediaType: LoaderModule["MediaType"];
let RequestedModuleType: LoaderModule["RequestedModuleType"];
let ResolutionMode: LoaderModule["ResolutionMode"];
let Workspace: LoaderModule["Workspace"];

interface DenoState {
  type: DenoRequestedModuleType;
}

export function deno(): Plugin {
  let ssrLoader: Loader;
  let browserLoader: Loader;

  let isDev = false;

  return {
    name: "deno",
    sharedDuringBuild: true,
    // We must be first to be able to resolve before the
    // Vite's own`vite:resolve` plugin. It always treats bare
    // specifiers as external during SSR.
    enforce: "pre",
    config(_, env) {
      isDev = env.command === "serve";
    },
    async configResolved() {
      const loaderModule = await import("@deno/loader");
      MediaType = loaderModule.MediaType;
      RequestedModuleType = loaderModule.RequestedModuleType;
      ResolutionMode = loaderModule.ResolutionMode;
      Workspace = loaderModule.Workspace;

      // TODO: Pass conditions
      ssrLoader = await new Workspace({
        platform: "node",
        cachedOnly: true,
      }).createLoader();
      browserLoader = await new Workspace({
        platform: "browser",
        preserveJsx: true,
        cachedOnly: true,
      })
        .createLoader();
    },
    applyToEnvironment() {
      return true;
    },
    async resolveId(id, importer, options) {
      const builtin = id.startsWith("node:") ? id.slice("node:".length) : id;
      if (BUILTINS.has(builtin)) {
        id = id.startsWith("node:") ? id : `node:${id}`;
        if (this.environment.config.consumer === "server") {
          return NODE_BUILTIN_PREFIX + id;
        }
        // `node:` prefix is not included in builtins list.
        return {
          id,
          external: true,
        };
      }
      const loader = this.environment.config.consumer === "server"
        ? ssrLoader
        : browserLoader;

      const original = id;

      let isHttp = false;
      if (id.startsWith("deno-http::")) {
        isHttp = true;
        id = id.slice("deno-http::".length);
      }

      importer = isDenoSpecifier(importer)
        ? parseDenoSpecifier(importer).specifier
        : importer;

      if (id.startsWith("/") && importer && /^https?:\/\//g.test(importer)) {
        const url = new URL(importer);
        id = `${url.origin}${id}`;
      }

      // We still want to allow other plugins to participate in
      // resolution, with us being in front due to `enforce: "pre"`.
      // But we still want to ignore everything `vite:resolve` does
      // because we're kinda replacing that plugin here.
      const tmp = await this.resolve(id, importer, options);
      if (tmp && tmp.resolvedBy !== "vite:resolve") {
        if (tmp.external && !/^https?:\/\//.test(tmp.id)) {
          return tmp;
        }

        // A plugin namespaced it, we should not attempt to resolve it.
        if (tmp.id.startsWith("\0")) {
          return tmp;
        }

        id = tmp.id;
      }

      // Plugins may return lower cased drive letters on windows
      if (!isHttp && path.isAbsolute(id)) {
        id = path.toFileUrl(path.normalize(id))
          .href;
      }

      try {
        // Ensure we're passing a valid importer that Deno understands
        const denoImporter = importer && !importer.startsWith("\0")
          ? importer
          : undefined;

        // For bare specifiers from non-deno importers, try resolving
        // with the importer's file URL so workspace import maps work
        let denoImporterUrl = denoImporter;
        if (
          denoImporter && !denoImporter.startsWith("file://") &&
          !denoImporter.startsWith("http") &&
          path.isAbsolute(denoImporter)
        ) {
          denoImporterUrl = path.toFileUrl(denoImporter).href;
        }

        let resolved = await loader.resolve(
          id,
          denoImporterUrl,
          ResolutionMode.Import,
        );

        if (resolved.startsWith("node:")) {
          return {
            id: resolved,
            external: true,
          };
        }

        if (original === resolved) {
          return null;
        }

        const type = getDenoType(id, options.attributes.type ?? "default");
        if (
          type !== RequestedModuleType.Default ||
          /^(https?|jsr|npm):/.test(resolved)
        ) {
          return toDenoSpecifier(resolved, type);
        }

        if (resolved.startsWith("file://")) {
          resolved = path.fromFileUrl(resolved);
        }

        return {
          id: resolved,
          meta: {
            deno: {
              type,
            },
          },
        };
      } catch {
        // ignore
      }
    },
    async load(id) {
      if (id.startsWith(NODE_BUILTIN_PREFIX)) {
        return nodeBuiltinModule(id.slice(NODE_BUILTIN_PREFIX.length));
      }

      const loader = this.environment.config.consumer === "server"
        ? ssrLoader
        : browserLoader;

      if (isDenoSpecifier(id)) {
        const { type, specifier } = parseDenoSpecifier(id);

        const result = await loader.load(specifier, type);
        if (result.kind === "external") {
          return null;
        }

        const code = new TextDecoder().decode(result.code);

        const maybeJsx = babelTransform({
          ssr: this.environment.config.consumer === "server",
          media: result.mediaType,
          code,
          id: specifier,
          isDev,
        });
        if (maybeJsx !== null) {
          if (maybeJsx.map) {
            // Babel reads the loader's inline source map but inherits its
            // `sources` (relative path). Rewrite to the absolute specifier
            // with an empty `sourceRoot` so stack frames show the real URL
            // instead of the `\0deno::…` virtual ID and don't double the cwd.
            maybeJsx.map.sources = [specifier];
            maybeJsx.map.sourceRoot = "";
          }
          // Babel emits its own inline `//# sourceMappingURL=` comment via
          // `sourceMaps: "both"`. Rewrite that one too so V8 stack traces
          // (which read the inline map natively) point at the specifier.
          maybeJsx.code = rewriteInlineSourceMapSources(
            maybeJsx.code,
            specifier,
          );
          return maybeJsx;
        }

        // For non-JS media (JSON, CSS, …) the loaded code is not JavaScript,
        // so appending a `//# sourceMappingURL=` comment would corrupt it.
        // Those modules don't show up in JS stack traces, so leave them alone.
        if (!isJsMediaType(result.mediaType)) {
          return { code };
        }

        return rewriteLoadedSourceMap(code, specifier);
      }

      if (id.startsWith("\0")) {
        id = id.slice(1);
      }

      const meta = this.getModuleInfo(id)?.meta.deno as
        | DenoState
        | undefined
        | null;

      if (meta === null || meta === undefined) return;

      // Skip for non-js files like `.css`
      if (
        meta.type === RequestedModuleType.Default &&
        !JS_REG.test(id)
      ) {
        return;
      }

      const url = path.toFileUrl(id);

      const result = await loader.load(url.href, meta.type);
      if (result.kind === "external") {
        return null;
      }

      const code = new TextDecoder().decode(result.code);

      const maybeJsx = babelTransform({
        ssr: this.environment.config.consumer === "server",
        media: result.mediaType,
        id,
        code,
        isDev,
      });
      if (maybeJsx) {
        return maybeJsx;
      }

      return {
        code,
      };
    },
    transform: {
      filter: {
        id: JSX_REG,
      },
      async handler(_, id) {
        // This transform is a hack to be able to re-use Deno's precompile
        // jsx transform.
        if (this.environment.name === "client") {
          return;
        }

        let actualId = id;
        if (isDenoSpecifier(id)) {
          const { specifier } = parseDenoSpecifier(id);
          actualId = specifier;
        }
        actualId = actualId.replace("?commonjs-es-import", "");

        if (actualId.startsWith("\0")) {
          actualId = actualId.slice(1);
        }
        if (path.isAbsolute(actualId)) {
          actualId = path.toFileUrl(actualId).href;
        }

        const resolved = await ssrLoader.resolve(
          actualId,
          undefined,
          ResolutionMode.Import,
        );
        const result = await ssrLoader.load(
          resolved,
          RequestedModuleType.Default,
        );
        if (result.kind === "external") {
          return;
        }

        const code = new TextDecoder().decode(result.code);

        return {
          code,
        };
      },
    },
  };
}

function isJsMediaType(media: DenoMediaType): boolean {
  switch (media) {
    case MediaType.JavaScript:
    case MediaType.Jsx:
    case MediaType.Mjs:
    case MediaType.Cjs:
    case MediaType.TypeScript:
    case MediaType.Mts:
    case MediaType.Cts:
    case MediaType.Tsx:
      return true;

    case MediaType.Dts:
    case MediaType.Dmts:
    case MediaType.Dcts:
    case MediaType.Css:
    case MediaType.Json:
    case MediaType.Html:
    case MediaType.Sql:
    case MediaType.Wasm:
    case MediaType.SourceMap:
    case MediaType.Unknown:
      return false;
  }
  return false;
}

export type DenoSpecifier = string & { __deno: string };

function isDenoSpecifier(str: unknown): str is DenoSpecifier {
  return typeof str === "string" && str.startsWith("\0deno::");
}

function toDenoSpecifier(spec: string, type: DenoRequestedModuleType) {
  return `\0deno::${type}::${spec}`;
}

function parseDenoSpecifier(
  spec: DenoSpecifier,
): { type: DenoRequestedModuleType; specifier: string } {
  const match = spec.match(/^\0deno::([^:]+)::(.*)$/)!;

  let specifier = match[2];

  const specMatch = specifier.match(/^(\w+):\/([^/].*)$/);
  if (specMatch !== null) {
    const protocol = specMatch[1];

    let rest = specMatch[2];
    if (protocol === "file") {
      rest = "/" + rest;
    }

    specifier = `${protocol}://${rest}`;
  }

  if (path.isAbsolute(specifier)) {
    specifier = path.toFileUrl(specifier).href;
  }

  return { type: +match[1], specifier };
}

function getDenoType(id: string, type: string): DenoRequestedModuleType {
  switch (type) {
    case "json":
      return RequestedModuleType.Json;
    case "bytes":
      return RequestedModuleType.Bytes;
    case "text":
      return RequestedModuleType.Text;
    default:
      if (id.endsWith(".json")) {
        return RequestedModuleType.Json;
      }
      return RequestedModuleType.Default;
  }
}

async function nodeBuiltinModule(id: string) {
  const names = Object.keys(await import(id));
  return [
    `const mod = await Function("id", "return import(id)")(${
      JSON.stringify(id)
    });`,
    "const requireValue = mod.default ?? mod;",
    "export { requireValue as __require };",
    "export default requireValue;",
    ...names
      .filter((name) =>
        /^[$_\p{ID_Start}][$_\u200c\u200d\p{ID_Continue}]*$/u
          .test(name)
      )
      .filter((name) => name !== "default")
      .map((name) => `export const ${name} = mod[${JSON.stringify(name)}];`),
  ].join("\n");
}

// Builds a 1:1 (line-by-line, column 0) source map so that Vite/V8 can
// rewrite stack frames from `\0deno::{type}::{specifier}` virtual IDs back
// to the original specifier. Uses an absolute URL/path in `sources` combined
// with an empty `sourceRoot` to avoid Vite resolving sources relative to the
// cwd, which would produce doubled paths like
// `packages/fresh/src/packages/fresh/src/segments.ts`.
export function identitySourceMap(source: string, code: string) {
  const lineCount = code.split("\n").length;
  // VLQ "AAAA" → [genCol=0, srcIdx=0, srcLine=0, srcCol=0]
  // ";AACA"   → newline, then deltas [0, 0, +1, 0]
  let mappings = "AAAA";
  for (let i = 1; i < lineCount; i++) {
    mappings += ";AACA";
  }
  return {
    version: 3,
    sources: [source],
    sourcesContent: [code],
    names: [] as string[],
    mappings,
    sourceRoot: "",
  };
}

const INLINE_SOURCE_MAP_RE =
  /\n?\/\/# sourceMappingURL=data:application\/json(?:;charset=[^;]+)?;base64,([A-Za-z0-9+/=]+)\s*$/;

// `ssrLoader.load()` returns code with an inline `//# sourceMappingURL=` data
// URL whose `sources` array contains a path relative to the cwd. Without
// fixing this up, stack traces either leak the `\0deno::…` virtual module ID
// (when V8 falls back to the module ID) or display doubled cwd paths like
// `packages/fresh/src/packages/fresh/src/segments.ts` (the caveat described
// in denoland/fresh#3464).
//
// Rewrites the inline source map (if any) so `sources` is the absolute
// specifier with an empty `sourceRoot`. The inline comment itself is kept in
// place so that V8 picks it up natively for stack-trace translation. When the
// loader did not emit a source map, an identity map is appended so the
// virtual ID is still replaced in stack traces. The same map is also
// returned alongside the code so Rollup (production builds) sees consistent
// `sources` during source-map chaining.
export function rewriteLoadedSourceMap(code: string, source: string) {
  const match = code.match(INLINE_SOURCE_MAP_RE);
  if (match !== null) {
    try {
      const parsed = JSON.parse(atob(match[1]));
      parsed.sources = [source];
      parsed.sourceRoot = "";
      const start = match.index!;
      const reencoded = btoa(JSON.stringify(parsed));
      const newCode = code.slice(0, start) +
        `\n//# sourceMappingURL=data:application/json;base64,${reencoded}`;
      return { code: newCode, map: parsed };
    } catch {
      // fall through to identity map
    }
  }
  const map = identitySourceMap(source, code);
  const encoded = btoa(JSON.stringify(map));
  return {
    code:
      `${code}\n//# sourceMappingURL=data:application/json;base64,${encoded}`,
    map,
  };
}

// Rewrites just the `sources` of an existing inline `//# sourceMappingURL=`
// comment in JS code, without touching mappings or appending a new comment
// when none exists. Used after Babel has already produced its own source
// map and we only need to fix the specifier.
export function rewriteInlineSourceMapSources(
  code: string,
  source: string,
): string {
  const match = code.match(INLINE_SOURCE_MAP_RE);
  if (match === null) return code;
  try {
    const parsed = JSON.parse(atob(match[1]));
    parsed.sources = [source];
    parsed.sourceRoot = "";
    const reencoded = btoa(JSON.stringify(parsed));
    return code.slice(0, match.index!) +
      `\n//# sourceMappingURL=data:application/json;base64,${reencoded}`;
  } catch {
    return code;
  }
}

function babelTransform(
  options: {
    media: DenoMediaType;
    ssr: boolean;
    code: string;
    id: string;
    isDev: boolean;
  },
) {
  if (!isJsMediaType(options.media)) {
    return null;
  }

  const { ssr, code, id, isDev } = options;

  const presets: babel.PluginItem[] = [];
  if (
    !ssr && (id.endsWith(".tsx") || id.endsWith(".jsx"))
  ) {
    presets.push([babelReact, {
      runtime: "automatic",
      importSource: "preact",
      development: isDev,
      throwIfNamespace: false,
    }]);
  }

  const url = URL.canParse(id) ? new URL(id) : null;

  const result = babel.transformSync(code, {
    filename: id,
    babelrc: false,
    sourceMaps: "both",
    presets: presets,
    plugins: [httpAbsolute(url)],
    compact: false,
  });

  if (result !== null && result.code) {
    return {
      code: result.code,
      map: result.map,
    };
  }

  return null;
}
