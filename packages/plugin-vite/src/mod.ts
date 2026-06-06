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
  let freshMode = "development";

  const plugins: Plugin[] = [
    {
      name: "fresh",
      sharedDuringBuild: true,
      async config(config, env) {
        isDev = env.command === "serve";
        freshMode = isDev ? "development" : "production";

        // Load env files early so define entries are available
        const root = config.root ? path.resolve(config.root) : Deno.cwd();
        const envDir = config.envDir ? path.resolve(root, config.envDir) : root;
        await loadEnvFile(path.join(envDir, ".env"));
        await loadEnvFile(path.join(envDir, ".env.local"));
        await loadEnvFile(path.join(envDir, `.env.${freshMode}`));
        await loadEnvFile(path.join(envDir, `.env.${freshMode}.local`));

        // Build define map for FRESH_PUBLIC_* env vars
        // Replaces the Babel inlineEnvVarsPlugin with Vite's native define
        const envDefine: Record<string, string> = {};
        for (const [key, value] of Object.entries(Deno.env.toObject())) {
          if (key.startsWith("FRESH_PUBLIC_")) {
            envDefine[`process.env.${key}`] = JSON.stringify(value);
            envDefine[`import.meta.env.${key}`] = JSON.stringify(value);
          }
        }

        return {
          define: envDefine,
          ssr: {
            // Bundle all deps in SSR so that resolve.alias
            // (react -> preact/compat) is applied consistently.
            // CJS packages are handled by the deno plugin's load
            // hook which wraps them in an ESM-compatible shim.
            noExternal: true,
          },
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
          },

          optimizeDeps: {
            // Disable dep optimizer because deno.ts handles all
            // module resolution. The optimizer causes duplicate
            // module instances when remote (JSR) islands resolve
            // deps to /@fs/ paths while the optimizer bundles to
            // /.vite/deps/. CJS packages in client-side islands
            // are handled by deno.ts's load hook.
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
      configResolved(vConfig) {
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
      },
    },
    // Lightweight replacement for Deno.env.get() calls with FRESH_PUBLIC_*
    // and NODE_ENV values. Replaces the Babel inlineEnvVarsPlugin for this
    // pattern which can't be handled by Vite's define (it's a call expression).
    {
      name: "fresh:deno-env",
      sharedDuringBuild: true,
      applyToEnvironment() {
        return true;
      },
      transform: {
        filter: {
          id: /\.([tj]sx?|[mc]?[tj]s)(\?.*)?$/,
        },
        handler(code) {
          if (!code.includes("Deno.env.get(")) return;

          const allEnv = Deno.env.toObject();
          let modified = false;
          const result = code.replace(
            /Deno\.env\.get\(\s*["']([^"']+)["']\s*\)/g,
            (match: string, name: string) => {
              if (name === "NODE_ENV") {
                modified = true;
                return JSON.stringify(freshMode);
              }
              if (name.startsWith("FRESH_PUBLIC_") && name in allEnv) {
                modified = true;
                return JSON.stringify(allEnv[name]);
              }
              return match;
            },
          );

          if (modified) return { code: result };
        },
      },
    } satisfies Plugin,
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
