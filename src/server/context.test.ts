import { test } from "vitest";
import assert from "node:assert/strict";

import { createHandlerContext, createMiddlewareContext, redirect } from "./context.ts";

// ---------- createMiddlewareContext ----------

test("createMiddlewareContext defaults params and state to empty objects", () => {
  const next = () => Promise.resolve(new Response("ok"));
  const ctx = createMiddlewareContext(undefined, next);
  assert.deepEqual(ctx.params, {});
  assert.deepEqual(ctx.state, {});
  assert.equal(ctx.next, next);
  assert.equal(ctx.req, undefined);
  // No request → no parsed url either.
  assert.equal(ctx.url, undefined);
  assert.equal(ctx.redirect, redirect);
});

test("createMiddlewareContext accepts init to seed params + state and parses url from req", () => {
  const next = () => Promise.resolve(new Response("ok"));
  const req = new Request("https://example.com/foo?q=1");
  const ctx = createMiddlewareContext(req, next, {
    params: { slug: "hi" },
    state: { user: "alice" },
  });
  assert.equal(ctx.req, req);
  assert.deepEqual(ctx.params, { slug: "hi" });
  assert.deepEqual(ctx.state, { user: "alice" });
  assert.ok(ctx.url instanceof URL);
  assert.equal(ctx.url!.href, "https://example.com/foo?q=1");
  assert.equal(ctx.url!.pathname, "/foo");
  assert.equal(ctx.url!.searchParams.get("q"), "1");
});

test("createMiddlewareContext surfaces the srvx runtime + waitUntil off the request", () => {
  const next = () => Promise.resolve(new Response("ok"));
  const seen: Promise<unknown>[] = [];
  const req = Object.assign(new Request("https://example.com/"), {
    runtime: { name: "cloudflare", cloudflare: { env: { KV: "binding" } } },
    waitUntil: (p: Promise<unknown>) => seen.push(p),
  });
  const ctx = createMiddlewareContext(req, next);
  assert.deepEqual(ctx.runtime, {
    name: "cloudflare",
    cloudflare: { env: { KV: "binding" } },
  });
  const work = Promise.resolve();
  ctx.waitUntil(work);
  assert.deepEqual(seen, [work]);
});

test("runtime is undefined and waitUntil is a safe no-op when the host provides neither", () => {
  const next = () => Promise.resolve(new Response("ok"));
  const req = new Request("https://example.com/");
  const ctx = createMiddlewareContext(req, next);
  assert.equal(ctx.runtime, undefined);
  // No host waitUntil → calling it must not throw.
  assert.doesNotThrow(() => ctx.waitUntil(Promise.resolve()));
});

// ---------- isPartial detection (Fresh-Partial header + Sec-Fetch-* matrix) ----------

/** Build a request carrying the partial header plus any extra Sec-Fetch-* headers. */
function partialReq(extra: Record<string, string> = {}): Request {
  return new Request("https://example.com/", {
    headers: { "Fresh-Partial": "true", ...extra },
  });
}

test("isPartial is false with no request and false without the Fresh-Partial header", () => {
  const next = () => Promise.resolve(new Response("ok"));
  assert.equal(createMiddlewareContext(undefined, next).isPartial, false);
  const plain = new Request("https://example.com/");
  assert.equal(createMiddlewareContext(plain, next).isPartial, false);
});

test("isPartial trusts a bare Fresh-Partial header when no Sec-Fetch-* metadata is present", () => {
  // Older clients / non-secure contexts may omit Sec-Fetch-*; absent headers
  // fall back to trusting the partial header rather than refusing.
  const next = () => Promise.resolve(new Response("ok"));
  assert.equal(createMiddlewareContext(partialReq(), next).isPartial, true);
});

test("isPartial holds for same-origin fetch metadata (dest empty, site same-origin, mode cors/same-origin)", () => {
  const next = () => Promise.resolve(new Response("ok"));
  for (const mode of ["same-origin", "cors"]) {
    const ctx = createMiddlewareContext(
      partialReq({
        "sec-fetch-dest": "empty",
        "sec-fetch-site": "same-origin",
        "sec-fetch-mode": mode,
      }),
      next,
    );
    assert.equal(ctx.isPartial, true, `mode=${mode} should be treated as partial`);
  }
});

test("isPartial is refused when Sec-Fetch-Dest is a top-level navigation (document)", () => {
  const next = () => Promise.resolve(new Response("ok"));
  assert.equal(
    createMiddlewareContext(partialReq({ "sec-fetch-dest": "document" }), next).isPartial,
    false,
  );
});

test("isPartial is refused for a cross-site request", () => {
  const next = () => Promise.resolve(new Response("ok"));
  assert.equal(
    createMiddlewareContext(partialReq({ "sec-fetch-site": "cross-site" }), next).isPartial,
    false,
  );
});

test("isPartial is refused for a no-cors mode request", () => {
  const next = () => Promise.resolve(new Response("ok"));
  assert.equal(
    createMiddlewareContext(partialReq({ "sec-fetch-mode": "no-cors" }), next).isPartial,
    false,
  );
});

test("createHandlerContext derives isPartial from the request the same way the middleware ctx does", () => {
  const next = () => Promise.resolve(new Response("ok"));
  const req = partialReq({ "sec-fetch-dest": "empty", "sec-fetch-site": "same-origin" });
  const mwCtx = createMiddlewareContext(req, next);
  const handlerCtx = createHandlerContext(req, mwCtx);
  assert.equal(handlerCtx.isPartial, true);
  // And a plain request yields false on the handler ctx too.
  const plainReq = new Request("https://example.com/");
  assert.equal(
    createHandlerContext(plainReq, createMiddlewareContext(plainReq, next)).isPartial,
    false,
  );
});

// ---------- error field (populated only via the _error chain) ----------

test("ctx.error defaults to undefined and is seeded from init on the middleware ctx", () => {
  const next = () => Promise.resolve(new Response("ok"));
  assert.equal(createMiddlewareContext(undefined, next).error, undefined);
  const boom = new Error("boom");
  const ctx = createMiddlewareContext(undefined, next, { error: boom });
  assert.equal(ctx.error, boom);
});

test("createHandlerContext carries the error through from the middleware ctx", () => {
  const next = () => Promise.resolve(new Response("ok"));
  const req = new Request("https://example.com/");
  const boom = { status: 418, message: "teapot" };
  const mwCtx = createMiddlewareContext(req, next, { error: boom });
  const handlerCtx = createHandlerContext(req, mwCtx);
  assert.equal(handlerCtx.error, boom);
});

// ---------- createHandlerContext ----------

test("createHandlerContext copies req/params/state from the mw ctx, parses url, drops next", () => {
  const next = () => Promise.resolve(new Response("ok"));
  const req = new Request("https://example.com/posts/42");
  const mwCtx = createMiddlewareContext(req, next, {
    params: { id: "42" },
    state: { count: 3 },
  });
  const handlerCtx = createHandlerContext(req, mwCtx);
  assert.equal(handlerCtx.req, req);
  assert.deepEqual(handlerCtx.params, { id: "42" });
  assert.deepEqual(handlerCtx.state, { count: 3 });
  assert.equal((handlerCtx as { next?: unknown }).next, undefined);
  assert.equal(handlerCtx.url!.pathname, "/posts/42");
  assert.equal(handlerCtx.redirect, redirect);
});

test("createHandlerContext reads runtime/waitUntil off the request, not the mw ctx", () => {
  const next = () => Promise.resolve(new Response("ok"));
  const seen: Promise<unknown>[] = [];
  const req = Object.assign(new Request("https://example.com/posts/42"), {
    runtime: { name: "deno" },
    waitUntil: (p: Promise<unknown>) => seen.push(p),
  });
  const mwCtx = createMiddlewareContext(req, next, { params: { id: "42" } });
  const handlerCtx = createHandlerContext(req, mwCtx);
  assert.deepEqual(handlerCtx.runtime, { name: "deno" });
  const work = Promise.resolve();
  handlerCtx.waitUntil(work);
  assert.deepEqual(seen, [work]);
});

// ---------- redirect ----------

test("redirect defaults to status 302 with the given location", () => {
  const res = redirect("/dashboard");
  assert.equal(res.status, 302);
  assert.equal(res.headers.get("location"), "/dashboard");
  assert.equal(res.body, null);
});

test("redirect honors the explicit status (301/307/308)", () => {
  assert.equal(redirect("/x", 301).status, 301);
  assert.equal(redirect("/x", 307).status, 307);
  assert.equal(redirect("/x", 308).status, 308);
});

test("redirect collapses protocol-relative `//host` paths so they can't escape origin", () => {
  // `//evil.com/x` is a relative-scheme URL — the browser would follow it
  // cross-origin. Collapse the leading `//` to a single `/`.
  assert.equal(redirect("//evil.com/x").headers.get("location"), "/evil.com/x");
  assert.equal(redirect("///evil.com/x").headers.get("location"), "/evil.com/x");
});

test("redirect preserves query strings and hashes around the collapse", () => {
  assert.equal(redirect("//a/b?x=1&y=2").headers.get("location"), "/a/b?x=1&y=2");
  assert.equal(redirect("//a/b#frag").headers.get("location"), "/a/b#frag");
});

test("redirect leaves a single `/` alone (root-relative redirects work)", () => {
  assert.equal(redirect("/").headers.get("location"), "/");
});

test("redirect leaves absolute URLs alone", () => {
  // Absolute URLs (`https://...`) — out of the protocol-relative concern.
  assert.equal(
    redirect("https://example.com/login").headers.get("location"),
    "https://example.com/login",
  );
});

test("redirect is reachable through the middleware/handler contexts", () => {
  const req = new Request("https://example.com/");
  const next = () => Promise.resolve(new Response("ok"));
  const mwCtx = createMiddlewareContext(req, next);
  const handlerCtx = createHandlerContext(req, mwCtx);

  const a = mwCtx.redirect("/login");
  const b = handlerCtx.redirect("/login", 307);
  assert.equal(a.status, 302);
  assert.equal(a.headers.get("location"), "/login");
  assert.equal(b.status, 307);
  assert.equal(b.headers.get("location"), "/login");
});
