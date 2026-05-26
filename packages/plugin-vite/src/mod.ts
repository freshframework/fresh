import type { Plugin } from "vite";
import {
  type FreshViteConfig,
  pathWithRoot,
  type ResolvedFreshViteConfig,
} from "./utils.ts";
import { deno } from "./plugins/deno.ts";

import prefresh from "@prefresh/vite";
import { serverEntryPlugin } from "./plugins/server_entry.ts";
import { clientEntryPlugin } from "./plugins/client_entry.ts";
import { devServer } from "./plugins/dev_server.ts";
import { buildIdPlugin } from "./plugins/build_id.ts";
import { clientSnapshot } from "./plugins/client_snapshot.ts";
import { serverSnapshot } from "./plugins/server_snapshot.ts";
import { patches } from "./plugins/patches.ts";
import process from "node:process";
import {
  specToName,
  TEST_FILE_PATTERN,
  UniqueNamer,
  UPDATE_INTERVAL,
  updateCheck,
} from "@fresh/core/internal-dev";
import { checkImports } from "./plugins/verify_imports.ts";
import { isBuiltin } from "node:module";
import { load as stdLoadEnv } from "@std/dotenv";
import path from "node:path";

export type { FreshViteConfig };
export type {
  ImportCheck,
  ImportCheckDiagnostic,
} from "./plugins/verify_imports.ts";

/**
 * Fresh framework support for Vite.
 *
 * This plugin uses the Environments feature of Vite to build
 * both the server and client code for Fresh applications.
 *
 * @param config Fresh config options
 * @returns Vite plugin with Fresh support
 *
 * @example Basic usage
 * ```ts vite.config.ts
 * import { defineConfig } from "vite";
 * import { fresh } from "@fresh/plugin-vite";
 *
 * export default defineConfig({
 *   plugins: [
 *     fresh({ serverEntry: "server.ts" })
 *   ],
 * });
 * ```
 */
export function fresh(config?: FreshViteConfig): Plugin[] {
  const rawStaticDir = config?.staticDir ?? "static";
  const fConfig: ResolvedFreshViteConfig = {
    serverEntry: config?.serverEntry ?? "main.ts",
    clientEntry: config?.clientEntry ?? "client.ts",
    islandsDir: config?.islandsDir ?? "islands",
    routeDir: config?.routeDir ?? "routes",
    staticDir: Array.isArray(rawStaticDir) ? rawStaticDir : [rawStaticDir],
    ignore: config?.ignore ?? [TEST_FILE_PATTERN],
    islandSpecifiers: new Map(),
    namer: new UniqueNamer(),
    checkImports: config?.checkImports ?? [],
  };

  fConfig.checkImports.push((id, env) => {
    if (env === "client") {
      if (isBuiltin(id)) {
        return {
          type: "error",
          message: "Node built-in modules cannot be imported in the browser.",
          description:
            "This is an error in your application code or in one of its dependencies.",
        };
      }
    }
  });

  let isDev = false;

  const plugins: Plugin[] = [
    {
      name: "fresh",
      sharedDuringBuild: true,
      config(config, env) {
        isDev = env.command === "serve";

        return {
          server: {
            watch: {
              // Ignore temp files, editor swap files, and Vite timestamp
              // files. On Linux, these short-lived files can trigger a
              // watchFs race condition in Deno where the watcher tries to
              // open a file that has already been deleted, crashing the
              // dev server with ENOENT.
              ignored: [
                "**/*.tmp.*",
                "**/*.timestamp-*",
                "**/*~",
                "**/.#*",
                "**/*.swp",
                "**/*.swo",
              ],
            },
          },
          esbuild: {
            jsx: "automatic",
            jsxImportSource: "preact",
            jsxDev: env.command === "serve",
          },
          resolve: {
            alias: {
              "react-dom/test-utils": "preact/test-utils",
              "react-dom": "preact/compat",
              react: "preact/compat",
            },
            // Disallow externals, because it leads to duplicate
            // modules with `preact` vs `npm:preact@*` in the server
            // environment.
            noExternal: true,
          },
          optimizeDeps: {
            // Optimize deps somehow leads to duplicate modules or them
            // being placed in the wrong chunks...
            noDiscovery: true,
          },

          publicDir: pathWithRoot(fConfig.staticDir[0], config.root),

          builder: {
            async buildApp(builder) {
              // Build client env first
              const clientEnv = builder.environments.client;
              if (clientEnv !== undefined) {
                await builder.build(clientEnv);
              }

              await Promise.all(
                Object.values(builder.environments).filter((env) =>
                  env !== clientEnv
                ).map((env) => builder.build(env)),
              );
            },
          },
          environments: {
            client: {
              build: {
                copyPublicDir: false,
                manifest: true,

                outDir: config.environments?.client?.build?.outDir ??
                  (config.build?.outDir
                    ? config.build.outDir + "/client"
                    : null) ??
                  "_fresh/client",
                rollupOptions: {
                  preserveEntrySignatures: "strict",
                  input: {
                    "client-entry": "fresh:client-entry",
                  },
                },
              },
            },
            ssr: {
              build: {
                manifest: true,
                emitAssets: true,
                copyPublicDir: false,

                outDir: config.environments?.ssr?.build?.outDir ??
                  (config.build?.outDir
                    ? config.build.outDir + "/server"
                    : null) ??
                  "_fresh/server",
                rollupOptions: {
                  onwarn(warning, handler) {
                    // Ignore "use client"; warnings
                    if (warning.code === "MODULE_LEVEL_DIRECTIVE") {
                      return;
                    }

                    // Ignore optional export errors
                    if (
                      warning.code === "MISSING_EXPORT" &&
                      warning.id?.startsWith("\0fresh-route::")
                    ) {
                      return;
                    }

                    // Ignore commonjs optional exports
                    if (
                      warning.code === "MISSING_EXPORT" &&
                      warning.message.includes("__require")
                    ) {
                      return;
                    }

                    // Ignore this warnings
                    if (warning.code === "THIS_IS_UNDEFINED") {
                      return;
                    }

                    // Ignore falsy source map errors
                    if (warning.code === "SOURCEMAP_ERROR") {
                      return;
                    }

                    return handler(warning);
                  },
                  input: {
                    "server-entry": "fresh:server_entry",
                  },
                },
              },
            },
          },
        };
      },
      async configResolved(vConfig) {
        // Run update check in background
        updateCheck(UPDATE_INTERVAL).catch(() => {});

        fConfig.islandsDir = pathWithRoot(fConfig.islandsDir, vConfig.root);
        fConfig.routeDir = pathWithRoot(fConfig.routeDir, vConfig.root);
        fConfig.staticDir = fConfig.staticDir.map((d) =>
          pathWithRoot(d, vConfig.root)
        );

        config?.islandSpecifiers?.map((spec) => {
          const specName = specToName(spec);
          const name = fConfig.namer.getUniqueName(specName);
          fConfig.islandSpecifiers.set(spec, name);
        });

        const envDir = pathWithRoot(
          vConfig.envDir || vConfig.root,
          vConfig.root,
        );

        await loadEnvFile(path.join(envDir, ".env"));
        await loadEnvFile(path.join(envDir, ".env.local"));
        const mode = isDev ? "development" : "production";
        await loadEnvFile(path.join(envDir, `.env.${mode}`));
        await loadEnvFile(path.join(envDir, `.env.${mode}.local`));
      },
    },
    serverEntryPlugin(fConfig),
    patches(),
    ...serverSnapshot(fConfig),
    clientEntryPlugin(fConfig),
    ...clientSnapshot(fConfig),
    buildIdPlugin(),
    ...devServer(fConfig),
    prefresh({
      include: [/\.[cm]?[tj]sx?$/],
      exclude: [/node_modules/, /[\\/]+deno[\\/]+npm[\\/]+/],
      parserPlugins: [
        "importMeta",
        "explicitResourceManagement",
        "topLevelAwait",
      ],
    }),
    checkImports({ checks: fConfig.checkImports }),
  ];

  if (typeof process.versions.deno === "string") {
    plugins.push(deno());
  }

  return plugins;
}

async function loadEnvFile(envPath: string) {
  try {
    await stdLoadEnv({ envPath, export: true });
  } catch {
    // Ignore
  }
}
