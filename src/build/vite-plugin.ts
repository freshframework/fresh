// Vite plugin that drives a Fresh-style project layout. Returns an array
// containing both this plugin and the official `nitro()` Vite plugin, so a
// consumer's `plugins: [fresh()]` wires up everything.
//
// SSR is a single-entry server environment whose entry is the virtual
// `fresh:internal/server-entrypoint`. That entry imports `fresh:internal/router`
// (a rou3-compiled matcher) and dynamic-imports the matched `fresh:routes/<id>`
// virtual on request. Nitro auto-detects the SSR env as a "service" and
// wires its renderer to it via `fetchViteEnv("ssr", req)`.
//
// Per-route `.fresh/types/<route>/$<file>.ts` typings + a `.fresh/tsconfig.json`
// with `rootDirs` are emitted on every scan.

import * as path from "node:path";
import * as fsp from "node:fs/promises";
import { nitro } from "nitro/vite";
import prefresh from "@prefresh/vite";
import type { Plugin, PluginOption, UserConfig } from "vite";
import { buildFreshConfig, createNodeFs, type FreshConfig, type FsLike } from "./fs-routes.ts";
import {
  CLIENT_BOOT_SPECIFIER,
  ERROR_PAGE_VIRTUAL_ID,
  generateErrorPageModule,
  generateRouteModule,
  generateRouterModule,
  generateServerEntrypoint,
  ROUTE_VIRTUAL_PREFIX,
  ROUTER_VIRTUAL_ID,
  routeId,
  SERVER_ENTRY_VIRTUAL_ID,
} from "./codegen.ts";
import {
  detectHandlersExport,
  detectStateExport,
  generateAppTypeFile,
  generateErrorTypeFile,
  generateLayoutTypeFile,
  generateMiddlewareTypeFile,
  generateRouteTypeFile,
  paramsFromFilePath,
} from "./types.ts";
import { freshTsconfigContent, freshTsconfigPath } from "./tsconfig.ts";
import { analyzeIslandSource, appendIslandMarkers, ISLAND_PATH_RE } from "./island-transform.ts";

export const ISLANDS_VIRTUAL_ID = "fresh:internal/islands";
const ISLANDS_RESOLVED = "\0" + ISLANDS_VIRTUAL_ID;
/**
 * Specifier the framework-shipped built-in computed factories
 * (`equals`, `test`, … from `fresh/signals`, and `setFromProp`, `setValue`,
 * `add`, `toggle` from `fresh/events`) stamp themselves with — the
 * bare package specifiers, resolved by Vite through `fresh`'s package
 * exports. The SSR islands map and the inline boot script's static
 * imports treat them the same way as any user island module.
 */
export const BUILTIN_SIGNALS_SPECIFIER = "fresh/signals";
export const BUILTIN_EVENTS_SPECIFIER = "fresh/events";
const DEFINE_RESOLVED = "\0fresh:internal/define";
const DEFINE_IMPORT_RE = /^\.\/\$[^/]+(?:\.ts)?$/;

const ROUTER_RESOLVED = "\0" + ROUTER_VIRTUAL_ID;
const SERVER_ENTRY_RESOLVED = "\0" + SERVER_ENTRY_VIRTUAL_ID;
const ROUTE_RESOLVED_PREFIX = "\0" + ROUTE_VIRTUAL_PREFIX;
const ERROR_PAGE_RESOLVED = "\0" + ERROR_PAGE_VIRTUAL_ID;

export type WriteFile = (path: string, content: string) => Promise<void>;

export interface FreshPluginOptions {
  /** Filesystem adapter override, mainly for tests. */
  fs?: FsLike;
  /**
   * Writer for generated files (`.fresh/types/...` and `.fresh/tsconfig.json`).
   * Defaults to `node:fs/promises` with a recursive mkdir.
   */
  writeFile?: WriteFile;
}

export function fresh(options: FreshPluginOptions = {}): PluginOption[] {
  const fs = options.fs ?? createNodeFs(fsp);
  const writeFile = options.writeFile ?? defaultWriteFile;
  let root: string | null = null;
  let isDev = true;
  let cached: FreshConfig | null = null;

  function requireRoot(): string {
    if (!root) {
      throw new Error("fresh plugin: vite root not yet known — config() must run first");
    }
    return root;
  }

  async function scan(): Promise<FreshConfig> {
    const r = requireRoot();
    cached = await buildFreshConfig(fs, r);
    await writeTypeFiles(cached, r, fs, writeFile);
    await writeFile(path.resolve(r, freshTsconfigPath()), freshTsconfigContent());
    return cached;
  }

  /**
   * Find the route whose handler maps to a given router-stable id.
   *
   * `buildFreshConfig` stores absolute handler paths; the router IDs are the
   * project-relative paths (with `routes/` + extension stripped), so we
   * project the absolute path back through `path.relative(root, …)` before
   * deriving the id to compare.
   */
  function findRouteById(cfg: FreshConfig, id: string, root: string) {
    for (const route of cfg.routes.values()) {
      const rel = path.relative(root, path.resolve(root, route.handler));
      if (routeId(rel) === id) return route;
    }
    return null;
  }

  const freshPlugin: Plugin = {
    name: "fresh",

    async config(userConfig, env) {
      const resolved = path.resolve(userConfig.root ?? process.cwd());
      root = resolved;
      isDev = env?.command !== "build";
      await scan();

      // SSR: single virtual entry. Nitro's `nitro:env.configEnvironment` sees
      // the string input and auto-registers the env as a service (consumer:
      // "server"), wiring its renderer through `fetchViteEnv("ssr", req)`.
      const out: UserConfig = {
        // Preact JSX via the automatic runtime. Declared here (not only in the
        // generated tsconfig) so Vite's oxc transform — and prefresh, which
        // reads `oxc.jsx` to derive its own JSX options — uses `jsx-runtime`
        // from `preact` rather than the classic `h` pragma. Without it prefresh
        // defaults to classic mode and SSR fails with "h is not defined".
        oxc: { jsx: { runtime: "automatic", importSource: "preact" } },
        environments: {
          client: {},
          ssr: {
            consumer: "server",
            build: {
              rolldownOptions: { input: SERVER_ENTRY_VIRTUAL_ID },
            },
          },
        },
      };

      // Client: islands + the optional `entry.client.*`. Vite's `?assets=client`
      // graph reads from the resulting manifest.
      const cfg = cached!;
      const clientInputs: Record<string, string> = {};
      for (const island of cfg.islands) {
        clientInputs[islandEntryName(island.path, resolved)] = path.resolve(resolved, island.path);
      }
      if (cfg.clientEntry) {
        clientInputs["entry.client"] = path.resolve(resolved, cfg.clientEntry);
      }
      // Always include the island hydration boot chunk. The script is a
      // no-op on pages without islands (state element absent). The entry
      // is the package's `fresh/internal/client` specifier — Vite resolves
      // it through node_modules and bundles it directly; no virtual
      // indirection.
      clientInputs["fresh.boot"] = CLIENT_BOOT_SPECIFIER;
      // Always include the framework-shipped factory chunks so the
      // client build manifest carries an addressable URL for each. The
      // SSR islands map resolves the bare `fresh/signals` / `fresh/events`
      // specifiers through these chunks; the inline boot script
      // statically imports them only on pages that actually reference
      // one of the framework-shipped factories.
      clientInputs["fresh.signals"] = BUILTIN_SIGNALS_SPECIFIER;
      clientInputs["fresh.events"] = BUILTIN_EVENTS_SPECIFIER;
      out.environments!.client = {
        build: {
          manifest: true,
          rolldownOptions: { input: clientInputs, preserveEntrySignatures: "allow-extension" },
        },
      };

      return out;
    },

    configResolved(resolved) {
      // Vite may have applied defaults / other plugin overrides — pick up the
      // final root in case it changed.
      root = path.resolve(resolved.root);
    },

    configureServer(server) {
      const r = requireRoot();
      const islandsDir = path.resolve(r, "islands");
      const routesDir = path.resolve(r, "routes");
      server.watcher.add([islandsDir, routesDir]);

      const within = (file: string) => isWithin(file, islandsDir) || isWithin(file, routesDir);

      // Content edits. For route/island sources, regenerate `.fresh/types/*` +
      // tsconfig first (cheap; `defaultWriteFile` skips unchanged files). Then,
      // for *any* changed file, full-reload only when it affects the
      // non-island server render graph. A change confined to islands — or to
      // shared modules reachable only through islands — is left to
      // Vite/prefresh HMR so island state is preserved. Crucially this is not
      // gated on islands/routes: a shared module (e.g. `components/Button.tsx`)
      // imported by a route must still trigger a reload.
      server.watcher.on("change", async (file) => {
        if (within(file)) await scan();
        // Stylesheets have built-in Vite HMR (in-place `<link>` swap, in-place
        // `<style>` text replacement) that we must not pre-empt with a reload.
        if (CSS_FILE_RE.test(file)) return;
        if (changeAffectsServerRender(server, file, requireRoot(), cached)) {
          server.ws.send({ type: "full-reload" });
        }
      });

      // Structural changes (a route/island file added or removed): the routes
      // and islands maps changed, so rescan, drop the cached islands virtual,
      // and full-reload to pull in the new structure.
      const onStructureChange = async (file: string) => {
        if (!within(file)) return;
        await scan();
        const mod = server.moduleGraph.getModuleById(ISLANDS_RESOLVED);
        if (mod) server.moduleGraph.invalidateModule(mod);
        server.ws.send({ type: "full-reload" });
      };
      server.watcher.on("add", onStructureChange);
      server.watcher.on("unlink", onStructureChange);
    },

    resolveId(id, importer) {
      if (id === ISLANDS_VIRTUAL_ID) return ISLANDS_RESOLVED;
      if (id === SERVER_ENTRY_VIRTUAL_ID) return SERVER_ENTRY_RESOLVED;
      if (id === ERROR_PAGE_VIRTUAL_ID) return ERROR_PAGE_RESOLVED;
      // Vite preserves query suffixes (`?assets=client`, `?assets=ssr`) on
      // import ids — strip them so we still resolve our virtuals, and
      // re-attach so downstream plugins (e.g. fullstack:assets-query) see
      // the same id they'd see for a real file.
      const qIdx = id.indexOf("?");
      if (qIdx > 0) {
        const base = id.slice(0, qIdx);
        const query = id.slice(qIdx);
        if (base === ISLANDS_VIRTUAL_ID) return ISLANDS_RESOLVED + query;
      }
      if (id === ROUTER_VIRTUAL_ID) return ROUTER_RESOLVED;
      if (id.startsWith(ROUTE_VIRTUAL_PREFIX)) {
        return "\0" + id;
      }
      // Route files import a typings sibling `./$<name>.ts` that only exists
      // under .fresh/types/ (resolved by TS via rootDirs). At runtime serve a
      // no-op `define` so Vite doesn't fail to load it.
      if (
        importer &&
        DEFINE_IMPORT_RE.test(id) &&
        root &&
        isWithin(importer, path.resolve(root, "routes"))
      ) {
        return DEFINE_RESOLVED;
      }
      return null;
    },

    async load(id) {
      if (id === DEFINE_RESOLVED) {
        // Identity helpers — matches the typings generated under .fresh/types.
        return [
          `export const handler = (h) => h;`,
          `export const page = (fn) => fn;`,
          `export const middleware = (fn) => fn;`,
          `export const app = (fn) => fn;`,
          `export const layout = (fn) => fn;`,
          "",
        ].join("\n");
      }
      if (id === ISLANDS_RESOLVED) {
        const r = requireRoot();
        const cfg = stripRoot(cached ?? (await scan()), r);
        return generateIslandsModule(cfg);
      }
      if (id === SERVER_ENTRY_RESOLVED) {
        return generateServerEntrypoint();
      }
      if (id === ERROR_PAGE_RESOLVED) {
        const r = requireRoot();
        const cfg = cached ?? (await scan());
        return generateErrorPageModule(cfg, r, {
          app: cfg.app,
          clientEntry: cfg.clientEntry,
          dev: isDev,
        });
      }
      if (id === ROUTER_RESOLVED) {
        const cfg = stripRoot(cached ?? (await scan()), requireRoot());
        return generateRouterModule(cfg);
      }
      if (id.startsWith(ROUTE_RESOLVED_PREFIX)) {
        const r = requireRoot();
        const cfg = cached ?? (await scan());
        const routeIdStr = id.slice(ROUTE_RESOLVED_PREFIX.length);
        const route = findRouteById(cfg, routeIdStr, r);
        if (!route) {
          throw new Error(`fresh: unknown route id "${routeIdStr}"`);
        }
        return generateRouteModule(route, r, {
          app: cfg.app,
          clientEntry: cfg.clientEntry,
          serverEntry: cfg.serverEntry,
          dev: isDev,
        });
      }
      return null;
    },

    // SSR-only island marker transform. Each exported function in an island
    // source file gets a `__FRESH_SERIALIZABLE_FUNCTION = { specifier, export }` property so
    // the SSR renderer can later detect hydration boundaries by inspecting
    // the rendered component itself. Only fires in the SSR environment so
    // the client bundle stays free of these markers.
    //
    // The id filter is broad (any `_?islands/` path); the handler verifies
    // against the live `cached.islands` set, so renames/adds/removes via the
    // watcher are picked up without restarting Vite.
    transform: {
      filter: { id: ISLAND_PATH_RE },
      handler(code, id) {
        if (this.environment?.name !== "ssr") return;
        if (!cached) return;
        const r = requireRoot();
        const island = cached.islands.find((i) => path.resolve(r, i.path) === id);
        if (!island) return;
        const { s, exports } = analyzeIslandSource(code, id);
        if (exports.length === 0) return;
        // Use the project-relative path so the specifier matches the keys in
        // `fresh:internal/islands` (also keyed by relative path).
        const specifier = path.relative(r, path.resolve(r, island.path)).split(path.sep).join("/");
        appendIslandMarkers(s, exports, specifier);
        return {
          code: s.toString(),
          map: s.generateMap({ hires: "boundary", source: id }),
        };
      },
    },
  };

  // Prefresh (Preact Fast Refresh). Self-gates to `serve` and self-skips the
  // SSR/nitro environments (it bails on the `ssr` transform flag), so it only
  // fast-refreshes client-side islands in dev. Kept *after* `freshPlugin` so
  // our `config` hook (which sets `oxc.jsx`) runs first — prefresh reads that
  // to derive its own JSX options. `prefresh()` resolves to a PluginOption;
  // Vite awaits promises in the plugin array (the cast smooths over a
  // nested-Promise type mismatch).
  return [
    freshPlugin,
    ...nitro({ experimental: { vite: { assetsImport: true } } }),
    prefresh() as unknown as PluginOption,
  ];
}

function stripRoot(cfg: FreshConfig, root: string): FreshConfig {
  const r = root.split(path.sep).join("/").replace(/\/+$/, "");
  const rel = (p: string | null): string | null => {
    if (p == null) return null;
    const pn = p.split(path.sep).join("/");
    return r && pn.startsWith(r + "/") ? pn.slice(r.length + 1) : pn;
  };
  const routes = new Map<string, FreshConfig["routes"] extends Map<string, infer V> ? V : never>();
  for (const [k, v] of cfg.routes) {
    routes.set(k, {
      handler: rel(v.handler)!,
      middlewares: v.middlewares.map((p) => rel(p)!),
      layouts: v.layouts.map((p) => rel(p)!),
    });
  }
  return {
    app: rel(cfg.app),
    error: rel(cfg.error),
    clientEntry: rel(cfg.clientEntry),
    serverEntry: rel(cfg.serverEntry),
    islands: cfg.islands.map((i) => ({ path: rel(i.path)! })),
    routes,
  };
}

function isWithin(file: string, dir: string): boolean {
  return file === dir || file.startsWith(dir + path.sep);
}

/** Stylesheet file extensions Vite's built-in CSS HMR handles natively. */
const CSS_FILE_RE = /\.(?:css|less|sass|scss|styl|stylus|pcss|postcss|sss)(?:$|\?)/i;

/**
 * Closest middleware to a layout: the middleware whose directory is the
 * deepest ancestor of (or matches) the layout's directory. Used to derive
 * the `State` type a layout sees.
 */
function closestMiddlewareFor(layoutPath: string, middlewares: Iterable<string>): string | null {
  const layoutDir = path.posix.dirname(layoutPath.split(path.sep).join("/"));
  let best: string | null = null;
  let bestLen = -1;
  for (const mw of middlewares) {
    const mwDir = path.posix.dirname(mw.split(path.sep).join("/"));
    const isAncestor = layoutDir === mwDir || layoutDir.startsWith(mwDir + "/");
    if (isAncestor && mwDir.length > bestLen) {
      best = mw;
      bestLen = mwDir.length;
    }
  }
  return best;
}

// Minimal slice of Vite's environment module graph that we walk.
interface ModuleNodeLike {
  id: string | null;
  file: string | null;
  importers: Set<ModuleNodeLike>;
}

/**
 * Decide whether a content change to `file` should trigger a browser
 * full-reload, based on the SSR module graph.
 *
 * A module is "client-only" when it's an island, or when every one of its
 * importers is client-only. Islands are the boundary where the client takes
 * over (prefresh/HMR re-renders them in place, preserving state), so changes
 * confined to islands — or to modules reachable *only* through islands —
 * don't need a reload. Anything reachable from a server-render root
 * (route / middleware / `_app` / layout → route virtual → router →
 * server-entrypoint) without crossing an island boundary does.
 *
 * Falls back to `true` (reload) when the SSR graph or the file's node isn't
 * available — a reload is never incorrect, just less optimal.
 */
function changeAffectsServerRender(
  // deno-lint-ignore no-explicit-any
  server: any,
  file: string,
  root: string,
  cfg: FreshConfig | null,
): boolean {
  const graph = server?.environments?.ssr?.moduleGraph;
  if (!graph?.getModulesByFile) return true;
  const nodes: Set<ModuleNodeLike> | undefined = graph.getModulesByFile(file);
  // Not part of the server graph at all → no server-render impact.
  if (!nodes || nodes.size === 0) return false;

  const islandPaths = new Set((cfg?.islands ?? []).map((i) => path.resolve(root, i.path)));
  const stripQuery = (id: string) => {
    const q = id.indexOf("?");
    return q < 0 ? id : id.slice(0, q);
  };
  const isIsland = (node: ModuleNodeLike) => {
    const p = node.file ?? (node.id ? stripQuery(node.id) : null);
    return p != null && islandPaths.has(p);
  };

  const memo = new Map<ModuleNodeLike, boolean>();
  const clientOnly = (node: ModuleNodeLike, stack: Set<ModuleNodeLike>): boolean => {
    const cached = memo.get(node);
    if (cached !== undefined) return cached;
    if (stack.has(node)) return true; // import cycle — treat as neutral
    if (isIsland(node)) {
      memo.set(node, true);
      return true;
    }
    if (node.importers.size === 0) {
      // A non-island module with no importers is a server-render root entry.
      memo.set(node, false);
      return false;
    }
    stack.add(node);
    let all = true;
    for (const imp of node.importers) {
      if (!clientOnly(imp, stack)) {
        all = false;
        break;
      }
    }
    stack.delete(node);
    memo.set(node, all);
    return all;
  };

  for (const node of nodes) {
    if (!clientOnly(node, new Set())) return true;
  }
  return false;
}

export function islandEntryName(relPath: string, root = ""): string {
  let rel = relPath;
  if (root) {
    const rootRel = path.relative(root, path.resolve(root, relPath));
    if (!rootRel.startsWith("..")) rel = rootRel;
  }
  return (
    "islands/" +
    rel
      .replace(/^islands\//, "")
      .replace(/\.(tsx|ts|jsx|js)$/, "")
      .replace(/[/\\]/g, "-")
  );
}

function toSpecifier(relPath: string): string {
  // Forward-slash, leading "/" — Vite serves modules from project root at this URL.
  const norm = relPath.split(path.sep).join("/");
  return "/" + norm.replace(/^\/+/, "");
}

export function generateIslandsModule(cfg: FreshConfig): string {
  // Each value is an async loader for the island's `?assets=client` descriptor
  // (`{ entry, js, css }`). This map is consumed **on the SSR side**: when an
  // island is rendered, the server resolves its client `entry` URL through
  // this map and injects that URL into the page state, so the client boot can
  // import it directly without needing the map itself.
  // The framework-shipped factory modules (`fresh/signals` for computed
  // built-ins, `fresh/events` for event-handler factories) ride this same
  // map under their bare package specifiers — they're just regular
  // factories that happen to live in the framework instead of a user
  // island file, so the SSR reducer can resolve them through the same
  // path. Vite resolves both specifiers through `fresh`'s package
  // exports, no virtual-module indirection.
  // Loaders unwrap `.default` here so the SSR consumer always sees a
  // flat descriptor (`{entry, js, css}`) — no need to handle two
  // shapes downstream.
  const loader = (spec: string) => `() => import(${JSON.stringify(spec)}).then((m) => m.default)`;
  const entries = [
    `  [${JSON.stringify(BUILTIN_SIGNALS_SPECIFIER)}, ${loader(
      BUILTIN_SIGNALS_SPECIFIER + "?assets=client",
    )}],`,
    `  [${JSON.stringify(BUILTIN_EVENTS_SPECIFIER)}, ${loader(
      BUILTIN_EVENTS_SPECIFIER + "?assets=client",
    )}],`,
    ...cfg.islands.map(
      (i) => `  [${JSON.stringify(i.path)}, ${loader(toSpecifier(i.path) + "?assets=client")}],`,
    ),
  ].join("\n");
  return `export default new Map([\n${entries}\n]);\n`;
}

const defaultWriteFile: WriteFile = async (p, content) => {
  // Skip the write when the on-disk content is already identical. Rewriting
  // unchanged files (especially `.fresh/tsconfig.json`) makes Vite's tsconfig
  // watcher fire and force a full page reload, which would clobber HMR /
  // prefresh fast-refresh on every scan.
  try {
    if ((await fsp.readFile(p, "utf8")) === content) return;
  } catch {
    // Missing file (ENOENT) or unreadable — fall through and write it.
  }
  await fsp.mkdir(path.dirname(p), { recursive: true });
  await fsp.writeFile(p, content, "utf8");
};

async function writeTypeFiles(
  cfg: FreshConfig,
  root: string,
  fs: FsLike,
  writeFile: WriteFile,
): Promise<void> {
  const rel = stripRoot(cfg, root);

  // Build the middleware tree: each middleware → its parent (or null at root).
  const middlewareParent = new Map<string, string | null>();
  for (const [, route] of rel.routes) {
    for (let i = 0; i < route.middlewares.length; i++) {
      const mw = route.middlewares[i];
      if (middlewareParent.has(mw)) continue;
      middlewareParent.set(mw, i > 0 ? route.middlewares[i - 1] : null);
    }
  }

  // `_app` typings (when present), so `import { app } from "./$_app"` resolves.
  if (rel.app) {
    const file = generateAppTypeFile(rel.app);
    await writeFile(path.resolve(root, file.path), file.content);
  }

  // Per-`_layout.tsx` typings. Each layout's `State` is pulled from the closest
  // middleware that's an ancestor of (or in the same directory as) the layout.
  const allLayouts = new Set<string>();
  for (const [, route] of rel.routes) {
    for (const layout of route.layouts) allLayouts.add(layout);
  }
  for (const layoutPath of allLayouts) {
    const closest = closestMiddlewareFor(layoutPath, middlewareParent.keys());
    const file = generateLayoutTypeFile(layoutPath, closest);
    await writeFile(path.resolve(root, file.path), file.content);
  }

  // `_error` typings (when present). `State` is the union of every middleware's
  // `State` plus `EmptyState` — the error route is reachable from any route
  // (including a 404 with no middleware chain).
  if (rel.error) {
    const file = generateErrorTypeFile(rel.error, [...middlewareParent.keys()]);
    await writeFile(path.resolve(root, file.path), file.content);
  }

  // Per-middleware typings. Read each source to detect `export interface State`
  // / `export type State` — when present, `OwnState` is pulled via
  // `import("./<basename>").State`; otherwise `OwnState = ParentState`.
  for (const [mw, parent] of middlewareParent) {
    const source = await fs.readFile(path.resolve(root, mw));
    const file = generateMiddlewareTypeFile(
      mw,
      parent,
      detectStateExport(source),
      paramsFromFilePath(mw),
    );
    await writeFile(path.resolve(root, file.path), file.content);
  }

  // Per-route handler typings. Closest middleware = last in the chain.
  for (const [, route] of rel.routes) {
    const closest =
      route.middlewares.length > 0 ? route.middlewares[route.middlewares.length - 1] : null;
    const source = await fs.readFile(path.resolve(root, route.handler));
    const file = generateRouteTypeFile(
      route.handler,
      paramsFromFilePath(route.handler),
      closest,
      detectHandlersExport(source),
    );
    await writeFile(path.resolve(root, file.path), file.content);
  }
}
