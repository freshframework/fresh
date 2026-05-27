import type { DevEnvironment, Plugin } from "vite";
import * as path from "@std/path";
import { contentType as getStdContentType } from "@std/media-types/content-type";
import { ASSET_CACHE_BUST_KEY, upgradeSourceMap } from "fresh/internal";
import { createRequest, sendResponse } from "@remix-run/node-fetch-server";
import { hashCode } from "../shared.ts";
import type { ResolvedFreshViteConfig } from "../utils.ts";

function getContentType(ext: string): string {
  return getStdContentType(ext) ?? "application/octet-stream";
}

export function devServer(freshConfig: ResolvedFreshViteConfig): Plugin[] {
  let publicDir = "";
  return [
    {
      name: "fresh:dev_server",
      sharedDuringBuild: true,
      configResolved(config) {
        publicDir = config.publicDir;
      },
      configureServer(server) {
        // Build the ignore pattern accounting for the configured base path.
        // Vite prefixes virtual module URLs with the base (e.g. /ui/@id/...),
        // so we need to match both /@ and /base/@.
        const base = server.config.base.replace(/\/$/, "");
        const IGNORE_URLS = new RegExp(
          `^(${base})?/(@(vite|fs|id)|\\.vite)/`,
        );

        // WebSocket upgrade requests don't flow through Connect middleware —
        // node:http dispatches them as `upgrade` events on the http.Server.
        // Vite's own HMR server identifies its connections via the
        // `sec-websocket-protocol` header (`vite-hmr`/`vite-ping`), so we
        // skip those and let Vite handle them. Everything else we route into
        // the Fresh handler with the raw socket + head stashed in
        // `upgradeSourceMap` so `ctx.upgrade()` can finish the handshake via
        // `Deno.upgradeWebSocket(req, { socket, head })`.
        server.httpServer?.on("upgrade", (nodeReq, nodeSocket, head) => {
          const protocolHeader = nodeReq.headers["sec-websocket-protocol"];
          if (
            typeof protocolHeader === "string" &&
            /\b(vite-hmr|vite-ping)\b/.test(protocolHeader)
          ) {
            return;
          }

          (async () => {
            try {
              const serverCfg = server.config.server;
              const protocol = serverCfg.https ? "https" : "http";
              const host = nodeReq.headers.host ?? "localhost";
              const url = new URL(
                nodeReq.url ?? "/",
                `${protocol}://${host}`,
              );

              const headers = new Headers();
              for (const [key, value] of Object.entries(nodeReq.headers)) {
                if (value === undefined || value === null) continue;
                if (Array.isArray(value)) {
                  for (const v of value) {
                    if (typeof v === "string") headers.append(key, v);
                  }
                } else if (typeof value === "string") {
                  headers.set(key, value);
                }
              }

              const req = new Request(url, {
                method: nodeReq.method ?? "GET",
                headers,
              });

              upgradeSourceMap.set(req, { socket: nodeSocket, head });

              const mod = await server.ssrLoadModule("fresh:server_entry");
              mod.setErrorInterceptor((err: unknown) => {
                if (err instanceof Error) server.ssrFixStacktrace(err);
              });

              await mod.default.fetch(req);
              // If the handler called ctx.upgrade(), the 101 has already been
              // written to nodeSocket and the WebSocket is live. If it didn't,
              // we have no usable channel left to report an error on — close
              // the socket so the client doesn't hang.
              if (!nodeSocket.destroyed && upgradeSourceMap.has(req)) {
                nodeSocket.destroy();
              }
              upgradeSourceMap.delete(req);
            } catch (err) {
              if (err instanceof Error) server.ssrFixStacktrace(err);
              // deno-lint-ignore no-console
              console.error("[fresh] WebSocket upgrade failed:", err);
              if (!nodeSocket.destroyed) nodeSocket.destroy();
            }
          })();
        });

        server.middlewares.use(async (nodeReq, nodeRes, next) => {
          const serverCfg = server.config.server;

          const protocol = serverCfg.https ? "https" : "http";
          const host = serverCfg.host ? serverCfg.host : "localhost";
          const port = serverCfg.port;
          const url = new URL(
            `${protocol}://${host}:${port}${nodeReq.url ?? "/"}`,
          );

          // Don't cache in dev
          url.searchParams.delete(ASSET_CACHE_BUST_KEY);

          // Check if it's a vite url or a node_modules asset (e.g. fonts
          // referenced from CSS in npm packages)
          if (
            IGNORE_URLS.test(url.pathname) ||
            url.pathname.startsWith("/node_modules/") ||
            server.environments.client.moduleGraph.urlToModuleMap.has(
              url.pathname,
            ) ||
            server.environments.ssr.moduleGraph.urlToModuleMap.has(
              url.pathname,
            ) ||
            url.pathname === "/.well-known/appspecific/com.chrome.devtools.json"
          ) {
            return next();
          }

          const decodedPathname = decodeURIComponent(url.pathname.slice(1));

          // Check if it's a static file first.
          // Vite handles publicDir (the first static dir) natively,
          // but we also need to check extra static dirs.
          const extraStaticDirs = freshConfig.staticDir.slice(1);
          const allStaticDirs = [publicDir, ...extraStaticDirs];
          let handledStatic = false;
          for (const dir of allStaticDirs) {
            const staticFilePath = path.join(dir, decodedPathname);
            try {
              const stat = await Deno.stat(staticFilePath);
              if (stat.isFile) {
                if (dir === publicDir) {
                  // Vite serves publicDir files natively
                  return next();
                }
                // Serve files from extra dirs manually
                const file = await Deno.open(staticFilePath, { read: true });
                const { ext } = path.parse(staticFilePath);
                const contentType = getContentType(ext);
                nodeRes.setHeader("Content-Type", contentType);
                // deno-lint-ignore no-explicit-any
                for await (const chunk of file.readable as any) {
                  nodeRes.write(chunk);
                }
                nodeRes.end();
                handledStatic = true;
                break;
              }
            } catch {
              // Ignore
            }
          }
          if (handledStatic) return;

          // Check if it's a static/index.html file
          for (const dir of allStaticDirs) {
            const staticFilePathIndex = path.join(
              dir,
              decodedPathname,
              "index.html",
            );
            try {
              const content = await Deno.readTextFile(staticFilePathIndex);
              nodeRes.setHeader("Content-Type", "text/html; charset=utf-8");
              nodeRes.end(content);
              return;
            } catch {
              // Ignore
            }
          }

          try {
            const mod = await server.ssrLoadModule("fresh:server_entry");
            const req = createRequest(nodeReq, nodeRes);
            mod.setErrorInterceptor((err: unknown) => {
              if (err instanceof Error) {
                server.ssrFixStacktrace(err);
              }
            });

            const res = (await mod.default.fetch(req)) as Response;

            // Collect css eagerly to avoid FOUC. This is a workaround for
            // Vite not supporting css natively. It's a bit hacky, but
            // gets the job done.
            if (
              url.pathname !== "/__inspect" &&
              res.headers.get("Content-Type")?.includes("text/html")
            ) {
              const clientEnv = server.environments.client;
              const collected = await collectCss(
                "fresh:client-entry",
                clientEnv,
              );

              // Also collect CSS from island modules. In dev mode,
              // island css is [] so RemainingHead can't inject them.
              // Walk all loaded modules that look like island entries
              // to pick up their CSS module imports.
              for (const mod of clientEnv.moduleGraph.idToModuleMap.values()) {
                if (mod.id?.includes("fresh-island::")) {
                  const islandCss = await collectCss(mod.id, clientEnv);
                  collected.push(...islandCss);
                }
              }

              let html = await res.text();

              const styles = collected.join("\n");
              html = html.replace("</head>", styles + "</head>");

              const newRes = new Response(html, {
                status: res.status,
                headers: res.headers,
              });
              await sendResponse(nodeRes, newRes);
              return;
            }

            await sendResponse(nodeRes, res);
          } catch (err) {
            if (err instanceof Error) {
              server.ssrFixStacktrace(err);
            }
            return next(err);
          }
        });
      },
    },
    {
      name: "fresh:server_hmr",
      applyToEnvironment(env) {
        return env.config.consumer === "server";
      },
      hotUpdate(options) {
        const clientMod = options.server.environments.client.moduleGraph
          .getModulesByFile(options.file);

        if (clientMod !== undefined) {
          // Vite can do HMR here
          return;
        }

        const ssrMod = options.server.environments.ssr.moduleGraph
          .getModulesByFile(options.file);
        if (ssrMod !== undefined) {
          // SSR-only module. Might still be a route.
          // TODO: Implement proper ssr hmr
          options.server.hot.send("fresh:reload");
        }
      },
    },
  ];
}

async function collectCss(
  id: string,
  env: DevEnvironment,
) {
  const seen = new Set<string>();
  const queue: string[] = [id];
  const out: string[] = [];

  let current: string | undefined;
  while ((current = queue.pop()) !== undefined) {
    if (seen.has(current)) continue;
    seen.add(current);

    let mod = env.moduleGraph.idToModuleMap.get(current);
    if (mod === undefined || mod.transformResult === null) {
      // During development assets are loaded lazily, so we need
      // to trigger processing manually.
      await env.fetchModule(current);
      mod = env.moduleGraph.idToModuleMap.get(current) ??
        env.moduleGraph.idToModuleMap.get(`\0${current}`);

      if (mod === undefined) continue;
    }

    if (
      (current.endsWith(".scss") ||
        current.endsWith(".css")) && mod.transformResult
    ) {
      // Since vite stores everything as a JS file we need to
      // extract the CSS out of the JS
      const match = mod.transformResult.code.match(
        /__vite__css\s+=\s+("(?:\\\\|\\"|[^"])*")/,
      );

      if (match !== null) {
        const content = JSON.parse(match[1]);
        out.push(
          `<style type="text/css" vite-module-id="${
            hashCode(id)
          }">${content}</style>`,
        );
      }
    }

    mod.importedModules.forEach((m) => {
      if (m.id === null) return;
      queue.push(m.id);
    });
  }

  return out;
}
