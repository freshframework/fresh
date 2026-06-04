import type { App } from "../app.ts";
import type { DevBuildCache } from "./dev_build_cache.ts";
import type { FsRouteFile } from "../fs_routes.ts";
import type { RouteConfig } from "../types.ts";
import { CommandType } from "../commands.ts";

/**
 * Prerender routes marked with `config.prerender` and add the resulting
 * HTML to the build cache as static files.
 */
export async function prerenderRoutes<State>(
  app: App<State>,
  buildCache: DevBuildCache<State>,
  fsRoutes: FsRouteFile<State>[],
): Promise<number> {
  const paths = await collectPrerenderPaths(fsRoutes);
  if (paths.length === 0) return 0;

  const handler = app.handler();
  const encoder = new TextEncoder();

  for (const pathname of paths) {
    const url = new URL(pathname, "http://localhost");
    const req = new Request(url);
    const res = await handler(req, {
      remoteAddr: { hostname: "127.0.0.1", port: 0, transport: "tcp" },
      completed: Promise.resolve(),
    });

    if (res.status !== 200) {
      // deno-lint-ignore no-console
      console.warn(
        `Prerender: ${pathname} returned status ${res.status}, skipping`,
      );
      await res.body?.cancel();
      continue;
    }

    const html = encoder.encode(await res.text());
    await buildCache.addProcessedFile(
      pathname,
      html,
      null,
      "text/html; charset=UTF-8",
    );
  }

  return paths.length;
}

async function collectPrerenderPaths<State>(
  fsRoutes: FsRouteFile<State>[],
): Promise<string[]> {
  const paths: string[] = [];

  for (const file of fsRoutes) {
    if (file.type !== CommandType.Route) continue;

    const mod = typeof file.mod === "function" ? await file.mod() : file.mod;
    const config = mod.config as RouteConfig | undefined;
    if (!config?.prerender) continue;

    if (typeof config.prerender === "function") {
      const paramsList = await config.prerender();
      for (const params of paramsList) {
        paths.push(substituteParams(file.routePattern, params));
      }
    } else {
      // prerender: true — route must not have dynamic segments
      if (file.routePattern.includes(":")) {
        // deno-lint-ignore no-console
        console.warn(
          `Prerender: route "${file.routePattern}" has dynamic segments but ` +
            `prerender is set to true (not a function). Skipping. ` +
            `Use prerender: () => [...] to enumerate paths.`,
        );
        continue;
      }
      paths.push(file.routePattern);
    }
  }

  return paths;
}

function substituteParams(
  pattern: string,
  params: Record<string, string>,
): string {
  let result = pattern;
  for (const [key, value] of Object.entries(params)) {
    // Handle catch-all :slug*
    result = result.replace(`:${key}*`, value);
    // Handle regular :param
    result = result.replace(`:${key}`, value);
  }
  return result;
}
