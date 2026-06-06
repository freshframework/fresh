// deno-lint-ignore-file require-await
import { cache } from "./cache.ts";
import { expect } from "@std/expect";
import { serveMiddleware } from "../test_utils.ts";

const TEST_CACHE = "fresh-test-cache";

async function clearCache() {
  await caches.delete(TEST_CACHE);
}

function cacheableResponse(body: string, headers?: HeadersInit): Response {
  return new Response(body, {
    headers: {
      "Cache-Control": "public, max-age=60",
      ...Object.fromEntries(
        headers instanceof Headers
          ? headers.entries()
          : Array.isArray(headers)
          ? headers
          : Object.entries(headers ?? {}),
      ),
    },
  });
}

Deno.test("cache - miss then hit", async () => {
  await clearCache();
  let callCount = 0;

  const middleware = cache({ cacheName: TEST_CACHE });
  const server = serveMiddleware(middleware, {
    next: async () => {
      callCount++;
      return cacheableResponse("hello");
    },
  });

  // First request — cache miss
  const res1 = await server.get("/test");
  expect(await res1.text()).toBe("hello");
  expect(callCount).toBe(1);

  // Second request — cache hit
  const res2 = await server.get("/test");
  expect(await res2.text()).toBe("hello");
  expect(callCount).toBe(1);

  await clearCache();
});

Deno.test("cache - skips non-GET methods", async () => {
  await clearCache();
  let callCount = 0;

  const middleware = cache({ cacheName: TEST_CACHE });
  const server = serveMiddleware(middleware, {
    next: async () => {
      callCount++;
      return cacheableResponse("ok");
    },
  });

  await server.post("/test", "body");
  await server.post("/test", "body");
  expect(callCount).toBe(2);

  await clearCache();
});

Deno.test("cache - skips responses without Cache-Control", async () => {
  await clearCache();
  let callCount = 0;

  const middleware = cache({ cacheName: TEST_CACHE });
  const server = serveMiddleware(middleware, {
    next: async () => {
      callCount++;
      return new Response("no cache headers");
    },
  });

  await server.get("/test");
  await server.get("/test");
  expect(callCount).toBe(2);

  await clearCache();
});

Deno.test("cache - skips private responses", async () => {
  await clearCache();
  let callCount = 0;

  const middleware = cache({ cacheName: TEST_CACHE });
  const server = serveMiddleware(middleware, {
    next: async () => {
      callCount++;
      return new Response("private", {
        headers: { "Cache-Control": "private, max-age=60" },
      });
    },
  });

  await server.get("/test");
  await server.get("/test");
  expect(callCount).toBe(2);

  await clearCache();
});

Deno.test("cache - skips no-store responses", async () => {
  await clearCache();
  let callCount = 0;

  const middleware = cache({ cacheName: TEST_CACHE });
  const server = serveMiddleware(middleware, {
    next: async () => {
      callCount++;
      return new Response("no-store", {
        headers: { "Cache-Control": "public, no-store, max-age=60" },
      });
    },
  });

  await server.get("/test");
  await server.get("/test");
  expect(callCount).toBe(2);

  await clearCache();
});

Deno.test("cache - skips responses with Set-Cookie", async () => {
  await clearCache();
  let callCount = 0;

  const middleware = cache({ cacheName: TEST_CACHE });
  const server = serveMiddleware(middleware, {
    next: async () => {
      callCount++;
      return cacheableResponse("cookie", {
        "Set-Cookie": "session=abc",
      });
    },
  });

  await server.get("/test");
  await server.get("/test");
  expect(callCount).toBe(2);

  await clearCache();
});

Deno.test("cache - skips non-200 responses", async () => {
  await clearCache();
  let callCount = 0;

  const middleware = cache({ cacheName: TEST_CACHE });
  const server = serveMiddleware(middleware, {
    next: async () => {
      callCount++;
      return new Response("not found", {
        status: 404,
        headers: { "Cache-Control": "public, max-age=60" },
      });
    },
  });

  await server.get("/test");
  await server.get("/test");
  expect(callCount).toBe(2);

  await clearCache();
});

Deno.test("cache - skips partial requests", async () => {
  await clearCache();
  let callCount = 0;

  const middleware = cache({ cacheName: TEST_CACHE });
  const server = serveMiddleware(middleware, {
    next: async () => {
      callCount++;
      return cacheableResponse("partial");
    },
  });

  await server.get("/test?fresh-partial");
  await server.get("/test?fresh-partial");
  expect(callCount).toBe(2);

  await clearCache();
});

Deno.test("cache - different paths are cached separately", async () => {
  await clearCache();
  let callCount = 0;

  const middleware = cache({ cacheName: TEST_CACHE });
  const server = serveMiddleware(middleware, {
    next: async () => {
      callCount++;
      return cacheableResponse(`response-${callCount}`);
    },
  });

  const res1 = await server.get("/a");
  expect(await res1.text()).toBe("response-1");

  const res2 = await server.get("/b");
  expect(await res2.text()).toBe("response-2");

  // Both should be cached independently
  const res3 = await server.get("/a");
  expect(await res3.text()).toBe("response-1");

  const res4 = await server.get("/b");
  expect(await res4.text()).toBe("response-2");

  expect(callCount).toBe(2);

  await clearCache();
});

Deno.test("cache - expired entry triggers re-fetch", async () => {
  await clearCache();
  let callCount = 0;

  const middleware = cache({ cacheName: TEST_CACHE });
  const server = serveMiddleware(middleware, {
    next: async () => {
      callCount++;
      return cacheableResponse(`v${callCount}`);
    },
  });

  // Prime the cache
  const prime = await server.get("/test");
  await prime.body?.cancel();
  expect(callCount).toBe(1);

  // Manually insert an expired entry
  const store = await caches.open(TEST_CACHE);
  const expiredResponse = new Response("stale", {
    headers: {
      "Cache-Control": "public, max-age=60",
      "X-Fresh-Cached-At": String(Date.now() - 120_000), // 2 min ago
    },
  });
  await store.put(new Request("http://localhost/expired"), expiredResponse);

  // Request should re-fetch since max-age=60 and it was cached 120s ago
  const res = await server.get("/expired");
  expect(await res.text()).toBe("v2");
  expect(callCount).toBe(2);

  await clearCache();
});

Deno.test("cache - stale-while-revalidate serves stale and revalidates", async () => {
  await clearCache();
  let callCount = 0;

  const middleware = cache({ cacheName: TEST_CACHE });
  const server = serveMiddleware(middleware, {
    next: async () => {
      callCount++;
      return new Response(`v${callCount}`, {
        headers: {
          "Cache-Control": "public, max-age=10, stale-while-revalidate=300",
        },
      });
    },
  });

  // Prime the cache
  await server.get("/swr");
  expect(callCount).toBe(1);

  // Insert a stale-but-within-SWR entry (15s old, max-age=10, swr=300)
  const store = await caches.open(TEST_CACHE);
  const staleResponse = new Response("stale-content", {
    headers: {
      "Cache-Control": "public, max-age=10, stale-while-revalidate=300",
      "X-Fresh-Cached-At": String(Date.now() - 15_000),
    },
  });
  await store.put(new Request("http://localhost/swr"), staleResponse);

  // Should serve the stale content immediately
  const res = await server.get("/swr");
  expect(await res.text()).toBe("stale-content");

  // Background revalidation should have fired
  // Give it a moment to complete
  await new Promise((r) => setTimeout(r, 100));

  // Now the cache should have the fresh content
  const res2 = await server.get("/swr");
  expect(await res2.text()).toBe("v2");
  expect(callCount).toBe(2);

  await clearCache();
});

Deno.test("cache - custom shouldCache function", async () => {
  await clearCache();
  let callCount = 0;

  const middleware = cache({
    cacheName: TEST_CACHE,
    shouldCache: (_req, res) => res.headers.get("X-Cache-Me") === "yes",
  });
  const server = serveMiddleware(middleware, {
    next: async () => {
      callCount++;
      return new Response("custom", {
        headers: { "X-Cache-Me": "yes" },
      });
    },
  });

  const res1 = await server.get("/test");
  await res1.body?.cancel();
  const res2 = await server.get("/test");
  await res2.body?.cancel();
  expect(callCount).toBe(1);

  await clearCache();
});

Deno.test("cache - custom methods", async () => {
  await clearCache();
  let callCount = 0;

  const middleware = cache({
    cacheName: TEST_CACHE,
    methods: ["GET", "HEAD"],
  });
  const server = serveMiddleware(middleware, {
    next: async () => {
      callCount++;
      return cacheableResponse("ok");
    },
  });

  const res1 = await server.get("/test");
  await res1.body?.cancel();
  const res2 = await server.get("/test");
  await res2.body?.cancel();
  expect(callCount).toBe(1);

  await clearCache();
});
