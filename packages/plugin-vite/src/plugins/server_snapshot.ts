import type {
  EnvironmentModuleNode,
  Manifest,
  Plugin,
  ViteDevServer,
} from "vite";
import {
  crawlFsItem,
  fsAdapter,
  type FsRouteFileNoMod,
  generateSnapshotServer,
  type IslandModChunk,
  pathToSpec,
  type PendingStaticFile,
  specToName,
  UniqueNamer,
} from "fresh/internal-dev";
import {
  JS_REG,
  pathWithRoot,
  type ResolvedFreshViteConfig,
} from "../utils.ts";
import * as path from "@std/path";
import { getBuildId } from "./build_id.ts";

export function serverSnapshot(options: ResolvedFreshViteConfig): Plugin[] {
  const modName = "fresh:server-snapshot";

  let isDev = false;
  let server: ViteDevServer | undefined;

  let clientOutDir = "";
  let serverOutDir = "";
  let root = "";

  const islands = new Map<string, { name: string; chunk: string | null }>();
  const islandsByFile = new Set<string>();
  const islandSpecByName = new Map<string, string>();
  const routeNamer = new UniqueNamer();
  const routeFileToName = new Map<string, string>();

  // deno-lint-ignore no-explicit-any
  const routes: Map<string, FsRouteFileNoMod<any>> = new Map();

  return [
    {
      name: "fresh:server-snapshot",
      sharedDuringBuild: true,
      applyToEnvironment(env) {
        return env.config.consumer === "server";
      },
      config(_, env) {
        isDev = env.command === "serve";
      },
      configResolved(config) {
        root = config.root;

        clientOutDir = pathWithRoot(
          config.environments.client.build.outDir,
          config.root,
        );
        serverOutDir = pathWithRoot(
          config.environments.ssr.build.outDir,
          config.root,
        );

        options.islandSpecifiers.forEach((name, spec) => {
          islands.set(spec, { name, chunk: null });
          islandSpecByName.set(name, spec);
          // islandsByFile.add(spec);
        });
      },
      configureServer(viteServer) {
        server = viteServer;

        viteServer.watcher.on("all", (ev, filePath) => {
          const { client, ssr } = viteServer.environments;

          // We can't just check if it's in the client module graph
          // because plugins like tailwindcss import _everything_.
          // Instead, we walk up the module graph to see if the file
          // is imported by an island or the client entry file.
          const mods = client.moduleGraph.getModulesByFile(filePath);
          if (mods !== undefined) {
            const seen = new Set<EnvironmentModuleNode>();
            const maybe = Array.from(mods);
            for (let i = 0; i < maybe.length; i++) {
              const mod = maybe[i];

              const isIslandFile = walkUp(
                mod,
                (m) => m.file !== null && islandsByFile.has(m.file),
                seen,
              );

              // No need to notify manually, vite takes care of this.
              if (isIslandFile) return;
            }
          }

          // Check for route files. We need to invalidate the snapshot if
          // they are removed or added.
          if (
            (ev === "add" || ev === "unlink") &&
            !/[\\/]+\(_[^)]+\)[\\/]+/.test(filePath)
          ) {
            const relRoutes = path.relative(options.routeDir, filePath);
            if (!relRoutes.startsWith("..")) {
              const mod = ssr.moduleGraph.getModuleById(`\0${modName}`);
              if (mod !== undefined) {
                // Clear state
                islands.clear();
                islandsByFile.clear();
                islandSpecByName.clear();

                ssr.moduleGraph.invalidateModule(mod);
              }
            }
          }

          // Finally, notify the client
          viteServer.ws.send("fresh:reload");
        });
      },
      resolveId: {
        filter: {
          id: /fresh:server-snapshot/,
        },
        handler(id) {
          if (id === modName) {
            return `\0${modName}`;
          }
        },
      },
      load: {
        filter: {
          id: /\0fresh:server-snapshot/,
        },

        async handler() {
          const result = await crawlFsItem({
            islandDir: options.islandsDir,
            routeDir: options.routeDir,
            ignore: options.ignore,
          });

          for (let i = 0; i < result.islands.length; i++) {
            const spec = result.islands[i];
            const specName = specToName(spec);
            const name = options.namer.getUniqueName(specName);

            islands.set(spec, { name, chunk: null });
            islandSpecByName.set(name, spec);
            islandsByFile.add(spec);
          }

          for (let i = 0; i < result.routes.length; i++) {
            const route = result.routes[i];
            const name = routeNamer.getUniqueName(route.id);

            routeFileToName.set(route.filePath, name);
            routes.set(name, route);
          }

          const staticFiles: PendingStaticFile[] = [];
          let islandMods: IslandModChunk[] = [];
          let clientEntry = "/@id/fresh:client-entry";
          let hmrClientEntry: string | undefined;
          let buildId = "";
          const entryAssets: string[] = [];

          if (isDev && server !== undefined) {
            // Set hmrClientEntry so the SSR runtime always emits a boot script
            // in dev, even when a page has zero islands. Without this, edits
            // to island-free routes never trigger a browser reload because the
            // `fresh:reload` WebSocket listener is never attached. The value
            // is used as a marker only — its presence is what matters, not
            // what it points to.
            hmrClientEntry = clientEntry;

            for (const id of islands.keys()) {
              const mod = server.environments.client.moduleGraph.getModuleById(
                id,
              );
              if (mod !== undefined) {
                const def = islands.get(id);
                if (def !== undefined) def.chunk = mod.url;
              }
            }

            islandMods = Array.from(islands.entries()).map(([id, def]) => {
              return {
                name: def.name,
                server: id,
                browser: def.chunk ?? `/@id/fresh-island::${def.name}`,
                css: [],
              };
            });
          } else {
            buildId = await getBuildId(false);
            const manifest = JSON.parse(
              await Deno.readTextFile(
                path.join(clientOutDir, ".vite", "manifest.json"),
              ),
            ) as Manifest;
            const resolvedIslandSpecs = new Map<string, string>();

            for (const spec of options.islandSpecifiers.keys()) {
              const resolved = await this.resolve(spec);

              if (resolved === null) continue;

              const id = resolved.id.startsWith("\0")
                ? resolved.id.slice(1)
                : resolved.id;

              resolvedIslandSpecs.set(id, spec);
            }

            const clientEntryName = "client-entry";

            for (const chunk of Object.values(manifest)) {
              if (chunk.name === clientEntryName) {
                clientEntry = pathToSpec(clientOutDir, chunk.file);
              }

              staticFiles.push({
                filePath: path.join(clientOutDir, chunk.file),
                pathname: chunk.file,
                hash: null,
                immutable: true,
              });

              if (chunk.css !== undefined) {
                for (let i = 0; i < chunk.css.length; i++) {
                  const id = chunk.css[i];

                  const pathname = `/${id}`;

                  staticFiles.push({
                    filePath: path.join(clientOutDir, id),
                    hash: null,
                    pathname,
                    immutable: true,
                  });

                  if (chunk.name === clientEntryName) {
                    entryAssets.push(pathname);
                  }
                }
              }

              if (chunk.name?.startsWith("fresh-island__")) {
                const name = chunk.name.slice("fresh-island__".length);
                let serverPath = path.join(root, chunk.src ?? chunk.file);
                const idx = chunk.src?.indexOf("deno::") ?? -1;

                if (idx > -1 && chunk.src) {
                  const src = chunk.src
                    .slice(idx)
                    .replace(
                      /(https?):\/([^/])/,
                      (_m, protocol, rest) => {
                        return `${protocol}://${rest}`;
                      },
                    );
                  serverPath = resolvedIslandSpecs.get(src)!;
                }

                let spec = pathToSpec(clientOutDir, chunk.file);

                if (spec.startsWith("./")) {
                  spec = spec.slice(1);
                }

                const chunkCss = chunk.css?.map((id) => `/${id}`) ?? [];
                islandMods.push({
                  name,
                  browser: spec,
                  server: serverPath,
                  css: chunkCss,
                });
              }
            }

            // Walk all static directories. First directory wins for
            // duplicate pathnames.
            const seenStaticPaths = new Set<string>();
            for (const dir of options.staticDir) {
              if (!(await fsAdapter.isDirectory(dir))) continue;

              const entries = await fsAdapter.walk(
                dir,
                {
                  followSymlinks: false,
                  includeDirs: false,
                  includeFiles: true,
                  skip: options.ignore,
                },
              );

              for await (const entry of entries) {
                const relative = path.relative(dir, entry.path);
                if (seenStaticPaths.has(relative)) continue;
                seenStaticPaths.add(relative);

                const filePath = path.join(clientOutDir, relative);

                try {
                  await Deno.mkdir(path.dirname(filePath), {
                    recursive: true,
                  });
                } catch (err) {
                  if (!(err instanceof Deno.errors.AlreadyExists)) {
                    throw err;
                  }
                }
                await Deno.copyFile(entry.path, filePath);

                staticFiles.push({
                  filePath,
                  hash: null,
                  pathname: relative,
                });

                if (path.basename(relative) === "index.html") {
                  const htmlRelative = path.relative(
                    dir,
                    path.dirname(entry.path),
                  );

                  if (!seenStaticPaths.has(htmlRelative)) {
                    seenStaticPaths.add(htmlRelative);
                    staticFiles.push({
                      filePath,
                      hash: null,
                      pathname: htmlRelative,
                    });
                  }
                }
              }
            }

            // Scan client output directory for any additional files generated
            // by Vite plugins (e.g., vite-plugin-pwa generates sw.js,
            // manifest.webmanifest) that aren't in the Vite manifest or
            // public directory.
            if (await fsAdapter.isDirectory(clientOutDir)) {
              // Normalize registered pathnames (strip leading /) for comparison
              const registeredPaths = new Set(
                staticFiles.map((f) =>
                  f.pathname.startsWith("/") ? f.pathname.slice(1) : f.pathname
                ),
              );

              const clientFiles = await fsAdapter.walk(
                clientOutDir,
                {
                  followSymlinks: false,
                  includeDirs: false,
                  includeFiles: true,
                },
              );

              for await (const entry of clientFiles) {
                const relative = path.relative(clientOutDir, entry.path)
                  .replaceAll("\\", "/");

                // Skip .vite directory and already-registered files
                if (
                  relative.startsWith(".vite/") ||
                  relative === ".vite" ||
                  registeredPaths.has(relative)
                ) {
                  continue;
                }

                staticFiles.push({
                  filePath: entry.path,
                  hash: null,
                  pathname: relative,
                });
              }
            }
          }

          const code = await generateSnapshotServer({
            outDir: path.join(clientOutDir, ".."),
            staticFiles,
            buildId,
            clientEntry,
            hmrClientEntry,
            entryAssets,
            fsRoutesFiles: result.routes,
            islands: islandMods,
            writeSpecifier: (file) => {
              const def = islands.get(file);
              if (def) {
                return `fresh-island::${def.name}`;
              }
              const routeDef = routeFileToName.get(file);
              if (routeDef !== undefined) {
                return `fresh-route::${routeDef}`;
              }
              return path.toFileUrl(file).href;
            },
          });

          return code;
        },
      },
      transform: {
        filter: {
          id: /\.(css|less|sass|scss)(\?.*)?$/,
        },
        handler(_code, id) {
          if (server) {
            const ssrGraph = server.environments.ssr.moduleGraph;
            const mod = ssrGraph.getModuleById(id);
            if (mod === undefined) return;

            const snapshot = ssrGraph.getModuleById("\0fresh:server-snapshot");
            if (snapshot === undefined) return;

            const queue: EnvironmentModuleNode[] = [mod];
            let item: EnvironmentModuleNode | undefined;
            while ((item = queue.pop()) !== undefined) {
              if (item.file !== null) {
                const normalized = path.normalize(item.file);
                const name = routeFileToName.get(normalized);

                if (name !== undefined) {
                  const route = routes.get(name);
                  if (route !== undefined) {
                    const mod = ssrGraph.getModuleById(id);
                    if (mod !== undefined) {
                      route.css.push(mod.url);
                    }

                    const routeMod = ssrGraph.getModuleById(
                      `\0fresh-route-css::${name}`,
                    );
                    if (routeMod !== undefined) {
                      ssrGraph.invalidateModule(routeMod);
                    }
                  }
                }
              }

              item.importers.forEach((importer) => queue.push(importer));
            }
          }
        },
      },
    },
    {
      name: "fresh:island-resolver",
      sharedDuringBuild: true,
      resolveId: {
        filter: {
          id: /^fresh-island::.*/,
        },
        async handler(id) {
          let name = id.slice("fresh-island::".length);

          if (JS_REG.test(name)) {
            name = name.slice(0, name.lastIndexOf("."));
          }

          const spec = islandSpecByName.get(name);
          if (spec !== undefined) {
            // Re-resolve through the plugin pipeline so deno-specifiers
            // (jsr:, https:) are handled correctly.
            const resolved = await this.resolve(spec);
            return resolved ?? spec;
          }
        },
      },
    },
    {
      name: "fresh:route-css",
      sharedDuringBuild: true,
      resolveId: {
        filter: {
          id: /^(\/@id\/)?fresh-route-css::/,
        },
        handler(id) {
          let name = id.startsWith("/@id/")
            ? id.slice("/@id/fresh-route-css::".length)
            : id.slice("fresh-route-css::".length);

          const idx = name.indexOf(".module.");
          if (idx > -1) {
            name = name.slice(0, idx);
          }

          return `\0fresh-route-css::${name}`;
        },
      },
      load: {
        filter: {
          id: /^\0fresh-route-css::/,
        },
        handler(id) {
          const name = id.slice("\0fresh-route-css::".length);

          const route = routes.get(name);
          if (route === undefined) return;

          if (!isDev) {
            return `export default ["__FRESH_CSS_PLACEHOLDER__"];`;
          }

          const imports = route.css.map((css) => `import "${css}";`).join("\n");
          return `${imports}
export default ${JSON.stringify(route.css)}
`;
        },
      },
    },
    {
      name: "fresh-route-css-build-ssr",
      sharedDuringBuild: true,
      applyToEnvironment(env) {
        return env.config.consumer === "server";
      },
      async writeBundle(_, bundle) {
        const asset = bundle[".vite/manifest.json"];
        if (asset.type === "asset") {
          const manifest = JSON.parse(asset.source as string) as Manifest;

          for (const info of Object.values(manifest)) {
            if (info.name?.startsWith("_fresh-route___")) {
              const filePath = path.join(serverOutDir, info.file);
              const content = await Deno.readTextFile(filePath);

              const replaced = content.replace(
                `["__FRESH_CSS_PLACEHOLDER__"]`,
                info.css
                  ? JSON.stringify(info.css.map((css) => `/${css}`))
                  : "null",
              );

              await Deno.writeTextFile(filePath, replaced);
            }
          }
        }
      },
    },
    {
      name: "fresh:route-resolver",
      sharedDuringBuild: true,
      resolveId: {
        filter: {
          id: /^fresh-route::/,
        },
        handler(id) {
          let name = id.slice("fresh-route::".length);

          if (JS_REG.test(name)) {
            name = name.slice(0, name.lastIndexOf("."));
          }

          return `\0fresh-route::${name}`;
        },
      },
      load: {
        filter: {
          id: /^\0fresh-route::.*/,
        },
        handler(id) {
          const name = id.slice("\0fresh-route::".length);

          const route = routes.get(name);
          if (route === undefined) return;

          const fileUrl = path.toFileUrl(route.filePath).href;
          const cssId = isDev
            ? `/@id/fresh-route-css::${name}.module.css`
            : `fresh-route-css::${name}.module.css`;

          // For some reason doing `export * from "foo"` is broken
          // in vite.
          const code = `import * as mod from "${fileUrl}";
import routeCss from "${cssId}";
export const css = routeCss;
export const config = mod.config;
export const handler = mod.handler;
export const handlers = mod.handlers;
export default mod.default;
`;

          return { code };
        },
      },
    },
  ];
}

function walkUp(
  mod: EnvironmentModuleNode,
  fn: (mod: EnvironmentModuleNode) => boolean,
  seen: Set<EnvironmentModuleNode>,
): boolean {
  if (seen.has(mod)) return false;

  if (fn(mod)) return true;

  const importers = Array.from(mod.importers);
  for (let i = 0; i < importers.length; i++) {
    const imp = importers[i];
    if (walkUp(imp, fn, seen)) return true;
  }

  return false;
}
