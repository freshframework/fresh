import type { Middleware } from "./mod.ts";
import { PARTIAL_SEARCH_PARAM } from "../constants.ts";

/**
 * Options for the {@linkcode cache} middleware.
 */
export interface CacheOptions {
  /**
   * Name of the {@linkcode Cache} instance to use with the
   * [Web Cache API](https://developer.mozilla.org/en-US/docs/Web/API/Cache).
   * @default "fresh"
   */
  cacheName?: string;
  /**
   * HTTP methods that should be cached.
   * @default ["GET"]
   */
  methods?: string[];
  /**
   * A function that determines whether a response should be cached.
   * By default, only responses with status 200 that have a `Cache-Control`
   * header containing `public` are cached.
   */
  shouldCache?: (req: Request, res: Response) => boolean;
}

interface CacheControl {
  public: boolean;
  noStore: boolean;
  maxAge: number;
  staleWhileRevalidate: number;
}

function parseCacheControl(header: string | null): CacheControl {
  const cc: CacheControl = {
    public: false,
    noStore: false,
    maxAge: 0,
    staleWhileRevalidate: 0,
  };
  if (header === null) return cc;

  const directives = header.split(",");
  for (let i = 0; i < directives.length; i++) {
    const part = directives[i].trim().toLowerCase();
    if (part === "public") {
      cc.public = true;
    } else if (part === "no-store" || part === "private") {
      cc.noStore = true;
    } else if (part.startsWith("max-age=")) {
      cc.maxAge = parseInt(part.slice(8), 10) || 0;
    } else if (part.startsWith("stale-while-revalidate=")) {
      cc.staleWhileRevalidate = parseInt(part.slice(23), 10) || 0;
    }
  }
  return cc;
}

const CACHED_AT_HEADER = "X-Fresh-Cached-At";

function isCacheableResponse(req: Request, res: Response): boolean {
  if (res.status !== 200) return false;

  const cc = parseCacheControl(res.headers.get("Cache-Control"));
  if (!cc.public || cc.noStore || cc.maxAge <= 0) return false;

  // Don't cache responses that set cookies
  if (res.headers.has("Set-Cookie")) return false;

  // Don't cache partial requests
  const url = new URL(req.url);
  if (url.searchParams.has(PARTIAL_SEARCH_PARAM)) return false;

  return true;
}

/**
 * Fresh middleware for server-side response caching using the
 * [Web Cache API](https://developer.mozilla.org/en-US/docs/Web/API/Cache).
 *
 * Routes opt into caching by setting standard `Cache-Control` headers on their
 * responses. Only responses with `public` and a positive `max-age` are cached.
 *
 * Supports `stale-while-revalidate` for ISR-like behavior: stale responses
 * are served immediately while a fresh response is generated in the background.
 *
 * ```ts
 * import { App, cache } from "fresh";
 *
 * const app = new App()
 *   .use(cache())
 *   .get("/", (ctx) => {
 *     return new Response("hello", {
 *       headers: {
 *         "Cache-Control": "public, max-age=60, stale-while-revalidate=300",
 *       },
 *     });
 *   });
 * ```
 */
export function cache<State>(options?: CacheOptions): Middleware<State> {
  const cacheName = options?.cacheName ?? "fresh";
  const methods = new Set(options?.methods ?? ["GET"]);
  const shouldCache = options?.shouldCache ?? isCacheableResponse;

  return async function freshCache(ctx) {
    const { req } = ctx;

    // Only cache configured methods
    if (!methods.has(req.method)) {
      return ctx.next();
    }

    // Don't cache partial requests
    if (ctx.url.searchParams.has(PARTIAL_SEARCH_PARAM)) {
      return ctx.next();
    }

    const store = await caches.open(cacheName);
    const cached = await store.match(req);

    if (cached !== undefined) {
      const cachedAtStr = cached.headers.get(CACHED_AT_HEADER);
      if (cachedAtStr !== null) {
        const cachedAt = parseInt(cachedAtStr, 10);
        const ageSeconds = (Date.now() - cachedAt) / 1000;
        const cc = parseCacheControl(cached.headers.get("Cache-Control"));

        // If no max-age was set the entry was stored via a custom
        // shouldCache — treat it as permanently fresh.
        if (cc.maxAge <= 0 || ageSeconds < cc.maxAge) {
          return cached;
        }

        if (
          cc.staleWhileRevalidate > 0 &&
          ageSeconds < cc.maxAge + cc.staleWhileRevalidate
        ) {
          // Stale but within SWR window — serve stale and revalidate
          revalidate(ctx.req.clone(), ctx.next, store, shouldCache);
          return cached;
        }

        // Expired — discard cached response
        await cached.body?.cancel();
      }
    }

    // Cache miss or expired — get fresh response
    const res = await ctx.next();

    if (shouldCache(req, res)) {
      const toCache = res.clone();
      const headers = new Headers(toCache.headers);
      headers.set(CACHED_AT_HEADER, String(Date.now()));
      const cachedResponse = new Response(toCache.body, {
        status: toCache.status,
        statusText: toCache.statusText,
        headers,
      });
      await store.put(req, cachedResponse);
    }

    return res;
  };
}

function revalidate(
  req: Request,
  next: () => Promise<Response>,
  store: Cache,
  shouldCache: (req: Request, res: Response) => boolean,
): void {
  // Fire-and-forget background revalidation
  queueMicrotask(async () => {
    try {
      const res = await next();
      if (shouldCache(req, res)) {
        const headers = new Headers(res.headers);
        headers.set(CACHED_AT_HEADER, String(Date.now()));
        const cachedResponse = new Response(res.body, {
          status: res.status,
          statusText: res.statusText,
          headers,
        });
        await store.put(req, cachedResponse);
      }
    } catch {
      // Revalidation failures are silent — the stale response was already
      // served, so there's nothing to do.
    }
  });
}
