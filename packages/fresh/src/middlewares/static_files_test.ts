import { staticFiles } from "./static_files.ts";
import { FakeServer, serveMiddleware } from "../test_utils.ts";
import type { BuildCache, StaticFile } from "../build_cache.ts";
import { expect } from "@std/expect";
import { ASSET_CACHE_BUST_KEY } from "../constants.ts";
import { BUILD_ID } from "@fresh/build-id";
import type { Command } from "../commands.ts";
import type { ServerIslandRegistry } from "../context.ts";
import {
  getContentType,
  systemPathToUrlEncoded,
} from "../dev/dev_build_cache.ts";
import { App, setBuildCache } from "../app.ts";

class MockBuildCache implements BuildCache {
  root = "";
  buildId = "MockId";
  files = new Map<string, StaticFile>();
  islandRegistry: ServerIslandRegistry = new Map();
  clientEntry = "";
  features = { errorOverlay: false };

  constructor(
    files: Record<
      string,
      { hash: string | null; content: string; immutable?: boolean }
    >,
  ) {
    const encoder = new TextEncoder();
    for (const [pathname, info] of Object.entries(files)) {
      const text = encoder.encode(info.content);

      const normalized = pathname.startsWith("/") ? pathname : "/" + pathname;
      this.files.set(normalized, {
        hash: info.hash,
        size: text.byteLength,
        readable: text,
        contentType: getContentType(normalized),
        close: () => {},
        immutable: info.immutable,
      });
    }
  }

  getEntryAssets(): string[] {
    return [];
  }

  // deno-lint-ignore no-explicit-any
  getFsRoutes(): Command<any>[] {
    return [];
  }

  // deno-lint-ignore require-await
  async readFile(pathname: string): Promise<StaticFile | null> {
    return this.files.get(pathname) ?? null;
  }
}

Deno.test("static files - 200", async () => {
  const buildCache = new MockBuildCache({
    "foo.css": { content: "body {}", hash: null },
  });
  const server = serveMiddleware(
    staticFiles(),
    { buildCache },
  );

  const res = await server.get("/foo.css");
  const content = await res.text();
  expect(res.status).toEqual(200);
  expect(res.headers.get("Content-Type")).toEqual("text/css; charset=UTF-8");
  expect(res.headers.get("Content-Length")).toEqual("7");
  expect(res.headers.get("Cache-Control")).toEqual(
    "no-cache, no-store, max-age=0, must-revalidate",
  );
  expect(content).toEqual("body {}");
});

Deno.test("static files - HEAD 200", async () => {
  const buildCache = new MockBuildCache({
    "foo.css": { content: "body {}", hash: null },
  });
  const server = serveMiddleware(
    staticFiles(),
    { buildCache },
  );

  const res = await server.head("/foo.css");
  const content = await res.text();
  expect(res.status).toEqual(200);
  expect(res.headers.get("Content-Type")).toEqual("text/css; charset=UTF-8");
  expect(res.headers.get("Content-Length")).toEqual("7");
  expect(content).toEqual("");
});

Deno.test("static files - etag in production", async () => {
  const buildCache = new MockBuildCache({
    "foo.css": { content: "body {}", hash: "123" },
  });
  const server = serveMiddleware(
    staticFiles(),
    {
      buildCache,
      config: {
        root: "",
        basePath: "",
        mode: "production",
        trustProxy: false,
      },
    },
  );

  const cacheUrl = `/foo.css?${ASSET_CACHE_BUST_KEY}=${BUILD_ID}`;
  let res = await server.get(cacheUrl);
  await res.body?.cancel();
  expect(res.headers.get("Etag")).toEqual('W/"123"');

  let headers = new Headers();
  headers.append("If-None-Match", "123");
  res = await server.get(cacheUrl, { headers });
  await res.body?.cancel();
  expect(res.status).toEqual(304);

  headers = new Headers();
  headers.append("If-None-Match", 'W/"123"');
  res = await server.get(cacheUrl, { headers });
  await res.body?.cancel();
  expect(res.status).toEqual(304);
});

Deno.test("static files - no etag in development", async () => {
  const buildCache = new MockBuildCache({
    "foo.css": { content: "body {}", hash: "123" },
  });
  const server = serveMiddleware(
    staticFiles(),
    {
      buildCache,
      config: {
        root: "",
        basePath: "",
        mode: "development",
        trustProxy: false,
      },
    },
  );

  const cacheUrl = `/foo.css`;
  let res = await server.get(cacheUrl);
  await res.body?.cancel();
  expect(res.headers.get("Etag")).toBeNull();

  // Even if client sends If-None-Match in dev mode, always return 200
  const headers = new Headers();
  headers.append("If-None-Match", "123");
  res = await server.get(cacheUrl, { headers });
  await res.body?.cancel();
  expect(res.status).toEqual(200);
});

Deno.test("static files - 404 on missing favicon.ico", async () => {
  const buildCache = new MockBuildCache({});
  const server = serveMiddleware(
    staticFiles(),
    { buildCache },
  );
  const res = await server.get("favicon.ico");
  await res.body?.cancel();
  expect(res.status).toEqual(404);
});

Deno.test("static files - 405 on wrong HTTP method", async () => {
  const buildCache = new MockBuildCache({
    "foo.css": { content: "body {}", hash: null },
  });
  const server = serveMiddleware(
    staticFiles(),
    { buildCache },
  );

  for (const method of ["post", "patch", "put", "delete"]) {
    // deno-lint-ignore no-explicit-any
    const res = await (server as any)[method]("/foo.css");
    await res.body?.cancel();
    expect(res.status).toEqual(405);
  }
});

Deno.test("static files - disables caching in development", async () => {
  const buildCache = new MockBuildCache({
    "foo.css": { content: "body {}", hash: null },
  });
  const server = serveMiddleware(
    staticFiles(),
    {
      buildCache,
      config: {
        root: "",
        basePath: "",
        mode: "development",
        trustProxy: false,
      },
    },
  );

  const res = await server.get("/foo.css");
  await res.body?.cancel();
  expect(res.status).toEqual(200);
  expect(res.headers.get("Cache-Control")).toEqual(
    "no-cache, no-store, max-age=0, must-revalidate",
  );
});

Deno.test("static files - enables caching in production", async () => {
  const buildCache = new MockBuildCache({
    "foo.css": { content: "body {}", hash: null },
  });
  const server = serveMiddleware(
    staticFiles(),
    {
      buildCache,
      config: {
        root: "",
        basePath: "",
        mode: "production",
        trustProxy: false,
      },
    },
  );

  const res = await server.get(`/foo.css?${ASSET_CACHE_BUST_KEY}=${BUILD_ID}`);
  await res.body?.cancel();
  expect(res.status).toEqual(200);
  expect(res.headers.get("Cache-Control")).toEqual(
    "public, max-age=31536000, immutable",
  );
});

Deno.test("static files - content-addressed static file uses content hash as cache key", async () => {
  const contentHash = "abc123contentHash";
  const buildCache = new MockBuildCache({
    "/large.wasm": {
      content: "\x00asm",
      hash: contentHash,
      immutable: true,
    },
  });
  const server = serveMiddleware(
    staticFiles(),
    {
      buildCache,
      config: {
        root: "",
        basePath: "",
        mode: "production",
        trustProxy: false,
      },
    },
  );

  // Content hash is accepted as a valid cache key → immutable cache
  let res = await server.get(
    `/large.wasm?${ASSET_CACHE_BUST_KEY}=${contentHash}`,
  );
  await res.body?.cancel();
  expect(res.status).toEqual(200);
  expect(res.headers.get("Cache-Control")).toEqual(
    "public, max-age=31536000, immutable",
  );

  // BUILD_ID is also accepted (e.g. from client-side asset() call)
  res = await server.get(
    `/large.wasm?${ASSET_CACHE_BUST_KEY}=${BUILD_ID}`,
  );
  await res.body?.cancel();
  expect(res.status).toEqual(200);
  expect(res.headers.get("Cache-Control")).toEqual(
    "public, max-age=31536000, immutable",
  );

  // Stale cache key still redirects
  res = await server.get(
    `/large.wasm?${ASSET_CACHE_BUST_KEY}=stale-key`,
  );
  await res.body?.cancel();
  expect(res.status).toEqual(307);
});

Deno.test("static files - immutable caching for content-addressed chunks", async () => {
  const buildCache = new MockBuildCache({
    "/_fresh/js/c/chunk-abc123.js": {
      content: "console.log('shared')",
      hash: "abc123",
    },
    "/_fresh/js/c/module-def456.wasm": {
      content: "\x00asm",
      hash: "def456",
    },
  });
  const server = serveMiddleware(
    staticFiles(),
    {
      buildCache,
      config: {
        root: "",
        basePath: "",
        mode: "production",
        trustProxy: false,
      },
    },
  );

  // Content-addressed chunks get immutable caching without __frsh_c
  let res = await server.get("/_fresh/js/c/chunk-abc123.js");
  await res.body?.cancel();
  expect(res.status).toEqual(200);
  expect(res.headers.get("Cache-Control")).toEqual(
    "public, max-age=31536000, immutable",
  );

  // WASM assets also get immutable caching
  res = await server.get("/_fresh/js/c/module-def456.wasm");
  await res.body?.cancel();
  expect(res.status).toEqual(200);
  expect(res.headers.get("Cache-Control")).toEqual(
    "public, max-age=31536000, immutable",
  );
});

Deno.test("static files - encoded pathname", async () => {
  // Build cache stores URL-encoded paths (matching what prepareStaticFile produces)
  const fileKeys = ["C#.svg", "西安市.png", "인천.avif"];
  const entries = Object.fromEntries(
    fileKeys.map((key) => [
      systemPathToUrlEncoded(key),
      { content: "body {}", hash: null },
    ]),
  );

  const buildCache = new MockBuildCache(entries);
  const server = serveMiddleware(
    staticFiles(),
    { buildCache },
  );

  for (
    const path of [
      "C%23.svg",
      "%E8%A5%BF%E5%AE%89%E5%B8%82.png",
      "%EC%9D%B8%EC%B2%9C.avif",
    ]
  ) {
    const res = await server.get("/" + path);
    await res.body?.cancel();
    expect(res.status).toEqual(200);
  }
});

Deno.test("static files - fallthrough", async () => {
  const buildCache = new MockBuildCache({
    "foo.css": { content: "body {}", hash: null },
  });

  let called: string[] = [];
  const app = new App<{ text: string }>()
    .use((ctx) => {
      ctx.state.text = "it";
      called.push("before");
      return ctx.next();
    })
    .use(staticFiles())
    .use((ctx) => {
      ctx.state.text += " works";
      called.push("after");
      return ctx.next();
    })
    .get("/", (ctx) => new Response(ctx.state.text));

  setBuildCache(app, buildCache, "production");

  const server = new FakeServer(app.handler());

  let res = await server.get("foo.css");
  let text = await res.text();
  expect(text).toEqual("body {}");
  expect(called).toEqual(["before"]);

  called = [];

  res = await server.get("/");
  text = await res.text();
  expect(text).toEqual("it works");
  expect(called).toEqual(["before", "after"]);
});

Deno.test("static files - comma in pathname", async () => {
  const key = systemPathToUrlEncoded("foo,bar.css");

  const buildCache = new MockBuildCache({
    [key]: {
      content: "body {}",
      hash: null,
    },
  });

  const server = serveMiddleware(
    staticFiles(),
    { buildCache },
  );

  // Browser/request path usually keeps the comma unencoded
  let res = await server.get("/foo,bar.css");
  await res.body?.cancel();
  expect(res.status).toEqual(200);

  // Encoded form should also resolve
  res = await server.get("/foo%2Cbar.css");
  await res.body?.cancel();
  expect(res.status).toEqual(200);
});
