import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, expect, test } from "vitest";
import { createServer, type ViteDevServer } from "vite";

// Integration coverage for the routing → middleware → handler → error pipeline,
// driven over `fetch` against the real Fresh dev server (no browser). These
// exercise the `routes/check/**` subtree + the root `_error.tsx` in the fixture.

const fixtureRoot = fileURLToPath(new URL("../fixture", import.meta.url));
let server: ViteDevServer;
let base: string;

beforeAll(async () => {
  server = await createServer({
    root: fixtureRoot,
    server: { port: 0, strictPort: false },
    logLevel: "error",
  });
  await server.listen();
  base = server.resolvedUrls!.local[0].replace(/\/$/, "");
}, 60_000);

afterAll(async () => {
  await server?.close();
});

// ---------- routing shapes ----------

test("a dynamic segment is captured into ctx.params", async () => {
  const res = await fetch(`${base}/check/blog/hello-world`);
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ slug: "hello-world" });
});

test("a catch-all segment captures the remainder of the path", async () => {
  const res = await fetch(`${base}/check/files/a/b/c.txt`);
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ path: "a/b/c.txt" });
});

test("a route group folder is dropped from the URL but keeps the middleware chain", async () => {
  const res = await fetch(`${base}/check/grouped`);
  expect(res.status).toBe(200);
  // `(grp)` does not appear in the URL, and the `check/_middleware.tsx` still ran
  // (state.user seeded).
  expect(await res.json()).toEqual({ grouped: true, user: "ada" });
});

// ---------- middleware ----------

test("middleware seeds state for the handler and post-processes the response", async () => {
  const res = await fetch(`${base}/check`);
  expect(res.status).toBe(200);
  expect(res.headers.get("x-check-mw")).toBe("ran"); // post-processing
  expect(await res.json()).toEqual({ user: "ada" }); // state propagation
});

test("middleware can short-circuit without calling next()", async () => {
  const res = await fetch(`${base}/check?block=1`);
  expect(res.status).toBe(403);
  expect(await res.text()).toBe("blocked by middleware");
  // It returned before the post-processing step, so the header is absent.
  expect(res.headers.get("x-check-mw")).toBeNull();
});

test("a middleware in a dynamic folder receives the matched param in ctx.params", async () => {
  const res = await fetch(`${base}/check/items/widget-7`);
  expect(res.status).toBe(200);
  // `id` comes straight from the route handler's params; `item` is the same
  // value the dynamic-folder `_middleware.tsx` read off `ctx.params` and seeded.
  expect(await res.json()).toEqual({ id: "widget-7", item: "widget-7" });
});

// ---------- handler return semantics ----------

test("a single-function handler matches every method", async () => {
  expect(await (await fetch(`${base}/check/single`)).json()).toEqual({ method: "GET" });
  const del = await fetch(`${base}/check/single`, { method: "DELETE" });
  expect(await del.json()).toEqual({ method: "DELETE" });
});

test("a method map serves HEAD via the GET handler and 405s unknown methods", async () => {
  const head = await fetch(`${base}/check/methods`, { method: "HEAD" });
  expect(head.status).toBe(200); // HEAD → GET fallback

  const put = await fetch(`${base}/check/methods`, { method: "PUT" });
  expect(put.status).toBe(405); // MethodNotAllowedError → _error
});

test("a render-result carries an explicit status + custom headers through the page render", async () => {
  const res = await fetch(`${base}/check/custom`);
  expect(res.status).toBe(418);
  expect(res.headers.get("x-custom")).toBe("teapot");
  expect(res.headers.get("content-type")).toContain("text/html");
  expect(await res.text()).toContain("custom:true");
});

test("a route with no page serves its render-result as JSON", async () => {
  const res = await fetch(`${base}/check/json`);
  expect(res.status).toBe(200);
  expect(res.headers.get("content-type")).toContain("application/json");
  expect(await res.json()).toEqual({ shape: "json", n: 1 });
});

// ---------- error handling (_error) ----------

test("an unmatched path renders the _error page as a 404", async () => {
  const res = await fetch(`${base}/check/does-not-exist`);
  expect(res.status).toBe(404);
  const html = await res.text();
  expect(html).toContain('data-testid="error-page"');
  expect(html).toContain('data-testid="error-status">404<');
});

test("a thrown error renders the _error page as a 500 with the error attached", async () => {
  const res = await fetch(`${base}/check/boom`);
  expect(res.status).toBe(500);
  const html = await res.text();
  expect(html).toContain('data-testid="error-status">500<');
  expect(html).toContain("kaboom"); // props.error.message reached the page
});

test("a thrown HttpError carries its status to the _error page", async () => {
  const res = await fetch(`${base}/check/teapot`);
  expect(res.status).toBe(418);
  const html = await res.text();
  expect(html).toContain('data-testid="error-status">418<');
  expect(html).toContain("i am a teapot");
});
