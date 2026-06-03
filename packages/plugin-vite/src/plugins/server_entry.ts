import type { Manifest, Plugin } from "vite";
import {
  generateServerEntry,
  type PendingStaticFile,
  prepareStaticFile,
  writeCompiledEntry,
} from "fresh/internal-dev";
import { pathWithRoot, type ResolvedFreshViteConfig } from "../utils.ts";
import * as path from "@std/path";

export function serverEntryPlugin(
  options: ResolvedFreshViteConfig,
): Plugin {
  const modName = "fresh:server_entry";

  let serverEntry = "";
  let serverEntryFilename = "";
  let serverOutDir = "";
  let clientOutDir = "";
  let root = "";
  let basePath = "";

  let isDev = false;

  const getAssetPath = (id: string): string => {
    if (basePath === "/") {
      return `/${id}`;
    }
    // Ensure basePath ends with / and construct the path manually to avoid platform-specific path issues
    const normalizedBase = basePath.endsWith("/") ? basePath : basePath + "/";
    return normalizedBase + id;
  };

  return {
    name: "fresh:server_entry",
    sharedDuringBuild: true,
    applyToEnvironment(env) {
      return env.config.consumer === "server";
    },
    config(_, env) {
      isDev = env.command === "serve";
    },
    configResolved(config) {
      root = config.root;
      basePath = config.base || "/";
      if (basePath !== "/" && !basePath.endsWith("/")) {
        basePath += "/";
      }
      serverEntry = pathWithRoot(options.serverEntry, config.root);
      serverOutDir = pathWithRoot(
        config.environments.ssr.build.outDir,
        config.root,
      );
      clientOutDir = pathWithRoot(
        config.environments.client.build.outDir,
        config.root,
      );
    },
    resolveId: {
      filter: {
        id: /fresh:server_entry/,
      },
      handler(id) {
        if (id === modName) {
          return `\0${modName}`;
        }
      },
    },
    load: {
      filter: {
        id: /\0fresh:server_entry/,
      },
      handler() {
        let code = generateServerEntry({
          root: isDev ? path.relative(serverOutDir, root) : "..",
          serverEntry: path.toFileUrl(serverEntry).href,
          snapshotSpecifier: "fresh:server-snapshot",
        });

        code += `

export function registerStaticFile(prepared) {
  snapshot.staticFiles.set(prepared.name, {
    name: prepared.name,
    contentType: prepared.contentType,
    filePath: prepared.filePath,
    hash: prepared.hash ?? null,
    immutable: prepared.immutable,
  });
}
`;

        if (isDev) {
          code = `import "preact/debug";
import { setErrorInterceptor as internalErrorIntercept } from "fresh/internal";
${code}

export function setErrorInterceptor(fn) {
  internalErrorIntercept(app, fn);
  refreshHandler();
}
if (import.meta.hot) import.meta.hot.accept();`;
        }

        return code;
      },
    },
    async writeBundle(_options, bundle) {
      // Find server entry filename directly from bundle chunks.
      // This is more reliable than the manifest when rollupOptions
      // override output.entryFileNames.
      for (const chunk of Object.values(bundle)) {
        if (chunk.type === "chunk" && chunk.isEntry) {
          serverEntryFilename = chunk.fileName;
          break;
        }
      }

      const manifest = bundle[".vite/manifest.json"];

      const staticFiles: PendingStaticFile[] = [];
      if (
        manifest && manifest.type === "asset" &&
        typeof manifest.source === "string"
      ) {
        const json = JSON.parse(manifest.source) as Manifest;

        for (const item of Object.values(json)) {
          if (item.assets) {
            for (let i = 0; i < item.assets.length; i++) {
              const id = item.assets[i];

              staticFiles.push({
                filePath: path.join(serverOutDir, id),
                hash: null,
                pathname: getAssetPath(id),
                immutable: true,
              });
            }
          }

          if (item.css) {
            for (let i = 0; i < item.css.length; i++) {
              const id = item.css[i];

              staticFiles.push({
                filePath: path.join(serverOutDir, id),
                hash: null,
                pathname: getAssetPath(id),
                immutable: true,
              });
            }
          }
        }
      }

      const registered = await Promise.all(staticFiles.map(async (file) => {
        const prepared = await prepareStaticFile(file, serverOutDir);
        const rel = path.relative(serverOutDir, file.filePath);
        const target = path.join(clientOutDir, rel);
        await Deno.rename(file.filePath, target);

        prepared.filePath = path.join("client", prepared.filePath);

        return `registerStaticFile(${JSON.stringify(prepared)});`;
      }));

      const outDir = path.dirname(serverOutDir);
      await Deno.writeTextFile(
        path.join(outDir, "server.js"),
        `import server, { registerStaticFile } from "./server/${
          serverEntryFilename || "server-entry.mjs"
        }";

${registered.join("\n")}

export default {
  fetch: server.fetch
};
`,
      );

      await writeCompiledEntry(outDir);
    },
  };
}
