import type { Middleware } from "./mod.ts";
import { ASSET_CACHE_BUST_KEY } from "../constants.ts";
import { BUILD_ID } from "@fresh/build-id";
import { tracer } from "../otel.ts";
import { getBuildCache } from "../context.ts";

/** Decode and re-encode each path segment so that characters like commas
 *  are percent-encoded consistently with how `prepareStaticFile` stores
 *  entries in the build cache. */
function normalizePathname(pathname: string): string {
  return "/" +
    pathname.split("/").filter(Boolean).map(encodeURIComponent).join("/");
}

/**
 * Fresh middleware to serve static files from the `static/` directory.
 * ```ts
 * // Enable Fresh static file serving
 * app.use(staticFiles());
 * ```
 */
export function staticFiles<T>(): Middleware<T> {
  return async function freshServeStaticFiles(ctx) {
    const { req, url, config } = ctx;

    const buildCache = getBuildCache(ctx);
    if (buildCache === null) return await ctx.next();

    let pathname = url.pathname;
    if (config.basePath) {
      pathname = pathname !== config.basePath
        ? pathname.slice(config.basePath.length)
        : "/";
    }

    try {
      pathname = normalizePathname(decodeURIComponent(pathname));
    } catch (_e: unknown) {
      if (!(_e instanceof URIError)) throw _e;
      return await ctx.next();
    }

    // Fast path bail out
    const startTime = performance.now() + performance.timeOrigin;
    const file = await buildCache.readFile(pathname);
    if (pathname === "/" || file === null) {
      // Optimization: Prevent long responses for favicon.ico requests
      if (pathname === "/favicon.ico") {
        return new Response(null, { status: 404 });
      }
      return await ctx.next();
    }

    if (req.method !== "GET" && req.method !== "HEAD") {
      file.close();
      return new Response("Method Not Allowed", { status: 405 });
    }

    const span = tracer.startSpan("static file", {
      attributes: { "fresh.span_type": "static_file" },
      startTime,
    });

    try {
      const cacheKey = url.searchParams.get(ASSET_CACHE_BUST_KEY);
      if (
        cacheKey !== null && BUILD_ID !== cacheKey &&
        // Accept the file's content hash as a valid cache key for
        // content-addressed static files.
        file.hash !== cacheKey
      ) {
        url.searchParams.delete(ASSET_CACHE_BUST_KEY);
        const location = url.pathname + url.search;
        file.close();
        span.setAttribute("fresh.cache", "invalid_bust_key");
        span.setAttribute("fresh.cache_key", cacheKey);
        return new Response(null, {
          status: 307,
          headers: {
            location,
          },
        });
      }

      const etag = file.hash;
      const headers = new Headers({
        "Content-Type": file.contentType,
        vary: "If-None-Match",
      });

      // In development mode, skip ETag validation to prevent serving stale
      // cached assets when switching between different apps on the same port
      if (ctx.config.mode !== "development") {
        const ifNoneMatch = req.headers.get("If-None-Match");
        if (
          ifNoneMatch !== null &&
          (ifNoneMatch === etag || ifNoneMatch === `W/"${etag}"`)
        ) {
          file.close();
          span.setAttribute("fresh.cache", "not_modified");
          return new Response(null, { status: 304, headers });
        } else if (etag !== null) {
          headers.set("Etag", `W/"${etag}"`);
        }
      }

      if (
        ctx.config.mode !== "development" &&
        (BUILD_ID === cacheKey ||
          url.pathname.startsWith(
            `${ctx.config.basePath}/_fresh/js/${BUILD_ID}/`,
          ) ||
          // Content-hashed chunks/assets under /_fresh/js/c/ are
          // immutable by filename — no BUILD_ID needed.
          url.pathname.startsWith(
            `${ctx.config.basePath}/_fresh/js/c/`,
          ) ||
          file.immutable)
      ) {
        span.setAttribute("fresh.cache", "immutable");
        headers.append("Cache-Control", "public, max-age=31536000, immutable");
      } else {
        span.setAttribute("fresh.cache", "no_cache");
        headers.append(
          "Cache-Control",
          "no-cache, no-store, max-age=0, must-revalidate",
        );
      }

      headers.set("Content-Length", String(file.size));
      if (req.method === "HEAD") {
        file.close();
        return new Response(null, { status: 200, headers });
      }

      // Errors in TS 5.9.2, not sure why
      // deno-lint-ignore no-explicit-any
      return new Response(file.readable as any, { headers });
    } finally {
      span.end();
    }
  };
}
