import type { Plugin, ViteDevServer } from "vite";
import { pathWithRoot, type ResolvedFreshViteConfig } from "../utils.ts";
import { crawlFsItem, specToName } from "fresh/internal-dev";
import * as path from "@std/path";

export function clientSnapshot(options: ResolvedFreshViteConfig): Plugin[] {
  const modName = "fresh:client-snapshot";

  const islands = new Set<string>();
  let server: ViteDevServer | undefined;
  let isDev = false;

  const entryToIsland = new Map<string, string>();

  return [
    {
      name: "fresh:client-snapshot",
      sharedDuringBuild: true,
      applyToEnvironment(env) {
        return env.config.consumer === "client";
      },

      async config(cfg, env) {
        isDev = env.command === "serve";

        const cwd = Deno.cwd();

        const result = await crawlFsItem({
          islandDir: pathWithRoot(options.islandsDir, cfg.root ?? cwd),
          routeDir: pathWithRoot(options.routeDir, cfg.root ?? cwd),
          ignore: options.ignore,
        });

        const input: Record<string, string> = {};

        if (isDev) {
          input["client-snapshot"] = "fresh:client-snapshot";
        }

        for (let i = 0; i < result.islands.length; i++) {
          const filePath = result.islands[i];
          islands.add(filePath);

          if (!isDev) {
            const specName = specToName(filePath);
            const name = options.namer.getUniqueName(specName);

            entryToIsland.set(name, filePath);
            input[`fresh-island::${name}`] = `fresh-client-island::${name}`;
          }
        }

        return {
          environments: {
            client: {
              build: {
                rollupOptions: {
                  input,
                },
              },
            },
          },
        };
      },
      configResolved(cfg) {
        for (const [name, spec] of entryToIsland.entries()) {
          const full = pathWithRoot(spec, cfg.root);
          entryToIsland.set(name, full);
        }
      },
      options(opts) {
        options.islandSpecifiers.forEach((_name, spec) => {
          islands.add(spec);

          if (!isDev) {
            const specName = specToName(spec);
            const name = options.namer.getUniqueName(specName);
            entryToIsland.set(name, spec);

            // deno-lint-ignore no-explicit-any
            (opts.input as any)[`fresh-island::${name}`] =
              `fresh-client-island::${name}`;
          }
        });
      },
      configureServer(devServer) {
        server = devServer;

        server.watcher.on("add", (filePath) => {
          if (!isIslandPath(options, filePath)) return;

          islands.add(filePath);

          invalidateSnapshots(server!);
        });
        server.watcher.on("unlink", (filePath) => {
          if (!isIslandPath(options, filePath)) return;

          islands.delete(filePath);

          invalidateSnapshots(server!);
        });
      },
      resolveId: {
        filter: {
          id: /fresh:client-snapshot/,
        },
        handler(id) {
          if (id === modName) {
            return `\0${modName}`;
          }
        },
      },
      load: {
        filter: {
          id: /\0fresh:client-snapshot/,
        },
        handler() {
          const imports = Array.from(islands.keys()).map((file, i) => {
            return `export const mod_${i} = await import(${
              JSON.stringify(file)
            });`;
          }).join("\n");

          if (isDev && server !== undefined) {
            const mod = server.environments.ssr.moduleGraph.getModuleById(
              "\0fresh:server-snapshot",
            );
            if (mod) {
              server.environments.ssr.moduleGraph.invalidateModule(mod);
            }
          }

          return `${imports}
if (import.meta.hot) {
  import.meta.hot.accept(() => {
    console.log("accepting client-snapshot")
  });
}
`;
        },
      },
    },
    {
      name: "fresh:client-island",
      sharedDuringBuild: true,
      resolveId: {
        filter: {
          id: /^fresh-client-island::/,
        },
        async handler(id) {
          const name = id.slice("fresh-client-island::".length);
          const full = entryToIsland.get(name);
          if (full !== undefined) {
            // Re-resolve through the plugin pipeline so deno-specifiers
            // (jsr:, https:) are handled correctly.
            const resolved = await this.resolve(full);
            return resolved ?? full;
          }
        },
      },
    },
  ];
}

/**
 * A `(_islands)` path segment marks a local island folder, the same
 * convention the initial route crawl uses.
 */
const LOCAL_ISLAND_REG = /[/\\]\(_islands\)[/\\]/;

export function isIslandPath(
  options: ResolvedFreshViteConfig,
  filePath: string,
): boolean {
  const relIsland = path.relative(options.islandsDir, filePath);
  if (!relIsland.startsWith("..")) return true;

  const relRoutes = path.relative(options.routeDir, filePath);
  if (relRoutes.startsWith("..")) return false;

  // Leading separator so that a `(_islands)` folder sitting directly in the
  // route dir matches too.
  return LOCAL_ISLAND_REG.test(`${path.SEPARATOR}${relRoutes}`);
}

function invalidateSnapshots(server: ViteDevServer) {
  const client = server.environments.client.moduleGraph.getModuleById(
    "\0fresh:client-snapshot",
  );
  if (client !== undefined) {
    server.environments.client.moduleGraph.invalidateModule(client);
  }

  const ssr = server.environments.ssr.moduleGraph.getModuleById(
    "\0fresh:server-snapshot",
  );
  if (ssr !== undefined) {
    server.environments.ssr.moduleGraph.invalidateModule(ssr);
  }
}
