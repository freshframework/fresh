import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, expect, test } from "vitest";
import { createServer, type ViteDevServer } from "vite";

// Integration tests drive the real Fresh server (Vite + Nitro + the fresh
// plugin) over `fetch` — exercising routing → middleware → handler → render →
// partial responses end-to-end, without a browser. The dev server is started
// in-process on a random port (the fixture pins 8765, which we override so we
// don't collide with the Playwright e2e server).

const fixtureRoot = fileURLToPath(new URL("../fixture", import.meta.url));
let server: ViteDevServer;
let base: string;

// Same-origin `fetch()` headers a real partial navigation sends.
const partialHeaders = {
  "Fresh-Partial": "true",
  "sec-fetch-dest": "empty",
  "sec-fetch-mode": "same-origin",
  "sec-fetch-site": "same-origin",
};

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

test("GET / renders a full SSR document", async () => {
  const res = await fetch(`${base}/`);
  expect(res.status).toBe(200);
  expect(res.headers.get("content-type")).toContain("text/html");
  const html = await res.text();
  expect(html).toContain("<!DOCTYPE html>");
});

test("a route with <Partial> renders boundary markers + the boot script on a full load", async () => {
  const html = await (await fetch(`${base}/partials`)).text();
  expect(html).toContain("<!DOCTYPE html>");
  expect(html).toContain("f-client-nav");
  expect(html).toMatch(/<!--fresh-partial:replace:main-->/);
  expect(html).toMatch(/<script type="module"/); // island boot
});

test("a partial request returns only the region fragment + Vary, no document shell", async () => {
  const res = await fetch(`${base}/partials/about`, { headers: partialHeaders });
  expect(res.status).toBe(200);
  expect(res.headers.get("content-type")).toContain("text/html");
  expect(res.headers.get("vary")).toContain("Fresh-Partial");
  const body = await res.text();
  expect(body).not.toContain("<!DOCTYPE html>");
  expect(body).not.toContain("<html");
  expect(body).toMatch(/^<!--fresh-partial:replace:main-->/);
  expect(body).toContain("About"); // the panel
});

test("the same URL without the header renders the full document", async () => {
  const html = await (await fetch(`${base}/partials/about`)).text();
  expect(html).toContain("<!DOCTYPE html>");
  expect(html).toContain("f-client-nav"); // the layout shell is present
});

test("a partial request with a top-level Sec-Fetch-Dest is refused (full document)", async () => {
  const html = await (
    await fetch(`${base}/partials/about`, {
      headers: { "Fresh-Partial": "true", "sec-fetch-dest": "document" },
    })
  ).text();
  // Not treated as a partial → full page, not a bare fragment.
  expect(html).toContain("<!DOCTYPE html>");
});

test("ctx.runtime surfaces the deployment target (Node under dev) and waitUntil is callable", async () => {
  const res = await fetch(`${base}/runtime`);
  expect(res.status).toBe(200);
  const body = await res.json();
  // The real srvx-backed dev server runs on Node, so the per-target context is
  // present and identifies the host. (Cloudflare/Deno fields would populate
  // under those presets.)
  expect(body.hasRuntime).toBe(true);
  expect(body.runtimeName).toBe("node");
  expect(body.waitUntilCallable).toBe(true);
});

test("a programmatic entry.server.ts app.use() middleware runs for every route", async () => {
  // The fixture's `entry.server.ts` registers an `app.use(...)` that tags every
  // response with `x-app-middleware: ran`. Proves the app-level middleware is
  // wired into the chain end-to-end, ahead of route rendering.
  const home = await fetch(`${base}/`);
  expect(home.headers.get("x-app-middleware")).toBe("ran");
  expect(home.status).toBe(200);

  // It runs on other routes too, not just `/`.
  const other = await fetch(`${base}/runtime`);
  expect(other.headers.get("x-app-middleware")).toBe("ran");
});

test("a POST form route reads the body and renders the result", async () => {
  const body = new URLSearchParams({ name: "ada" });
  const res = await fetch(`${base}/partials/form`, {
    method: "POST",
    headers: { ...partialHeaders, "content-type": "application/x-www-form-urlencoded" },
    body,
  });
  expect(res.status).toBe(200);
  expect(await res.text()).toContain("hi ada");
});

test("JSX island props (slots): rendered inline with markers; unrendered into a template", async () => {
  const res = await fetch(`${base}/slots`);
  expect(res.status).toBe(200);
  const html = await res.text();
  // The `children` slot was rendered by the island → its DOM sits inline,
  // bracketed by a slot marker.
  expect(html).toMatch(/<!--fresh-slot:\d+--><p data-testid="children-content"/);
  // The `extra` slot wasn't rendered → emitted into a keyed <template> so the
  // client can still graft it later.
  expect(html).toMatch(
    /<template data-fresh-slot="\d+"><p data-testid="extra-content">extra slot content<\/p><\/template>/,
  );
  // The props ride across as `slot(...)` calls (the slot helper is imported),
  // not as structurally-serialized VNodes.
  expect(html).toMatch(/\bslot as _\d+_\d+\b/);
});

test("a nested island is rendered inline — only the outer is marked + serialized", async () => {
  const res = await fetch(`${base}/nested`);
  // Renders at all: the inner island takes a non-serializable closure prop, so
  // the old behaviour (marking + serializing nested islands) would have thrown.
  expect(res.status).toBe(200);
  const html = await res.text();
  // The outer island is marked; the inner one rode along inline, so there is no
  // second island marker.
  expect(html).toContain("<!--fresh-island:0-->");
  expect(html).not.toContain("<!--fresh-island:1-->");
  // Both still rendered server-side.
  expect(html).toContain("value:0");
  expect(html).toContain("inner:0");
});
