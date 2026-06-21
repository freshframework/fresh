import { test } from "vitest";
import assert from "node:assert/strict";

import type { FreshConfig, RouteEntry } from "./fs-routes.ts";
import {
  CLIENT_BOOT_SPECIFIER,
  ERROR_PAGE_VIRTUAL_ID,
  generateErrorPageModule,
  generateRouteModule,
  compareRouteSpecificity,
  generateRouterModule,
  generateServerEntrypoint,
  ROUTE_VIRTUAL_PREFIX,
  ROUTER_VIRTUAL_ID,
  routeId,
  SERVER_ENTRY_VIRTUAL_ID,
  toRou3Pattern,
} from "./codegen.ts";

// ---------- helpers ----------

function emptyCfg(): FreshConfig {
  return {
    islands: [],
    routes: new Map(),
    app: null,
    error: null,
    clientEntry: null,
    serverEntry: null,
  };
}

function route(partial: Partial<RouteEntry> & { handler: string }): RouteEntry {
  return {
    middlewares: [],
    layouts: [],
    ...partial,
  };
}

// ---------- routeId ----------

test("routeId strips the leading routes/ + extension", () => {
  assert.equal(routeId("routes/index.tsx"), "index");
  assert.equal(routeId("routes/blog/[slug].tsx"), "blog/[slug]");
  assert.equal(routeId("routes/admin/post/[slug].tsx"), "admin/post/[slug]");
  assert.equal(routeId("routes/files/[...path].ts"), "files/[...path]");
});

// ---------- toRou3Pattern ----------

test("toRou3Pattern converts trailing `*` (Hono catch-all) to `**` (rou3)", () => {
  assert.equal(toRou3Pattern("/"), "/");
  assert.equal(toRou3Pattern("/blog/:slug"), "/blog/:slug");
  assert.equal(toRou3Pattern("/files/*"), "/files/**");
  // Bare `*` only at the end of the pattern.
  assert.equal(toRou3Pattern("/a/*/b"), "/a/*/b");
  // Named catch-alls (`:name*`) are already rou3-native — pass through
  // unchanged so the matched tail surfaces under the declared name.
  assert.equal(toRou3Pattern("/files/:path*"), "/files/:path*");
  assert.equal(toRou3Pattern("/:rest*"), "/:rest*");
});

// ---------- generateServerEntrypoint ----------

test("generateServerEntrypoint exports a fetch handler that delegates to the router + error page", () => {
  const code = generateServerEntrypoint();
  assert.match(code, new RegExp(`from "${ROUTER_VIRTUAL_ID}"`));
  assert.match(code, /import errorPage from "fresh:internal\/error-page"/);
  assert.match(code, /import \{ NotFoundError \} from "fresh\/errors"/);
  assert.match(code, /export default \{/);
  assert.match(code, /fetch\(req\)/);
  assert.match(code, /match\(req\.method, url\.pathname\)/);
  // 404: throw NotFoundError → caught and routed through the error page.
  assert.match(code, /throw new NotFoundError\(\)/);
  // The matched data is the dynamic-import thunk → invoke + delegate to default.
  assert.match(code, /await matched\.data\(\)/);
  assert.match(code, /mod\.default\(event\)/);
  // try/catch dispatches to errorPage with `error` attached. Method is forced
  // to GET so a 405 on e.g. POST doesn't re-trigger inside the error page.
  assert.match(code, /errorPage\(\{ \.\.\.event, method: "GET", error \}\)/);
});

// ---------- generateRouterModule ----------

test("generateRouterModule emits a precompiled matcher with per-route dynamic imports", () => {
  const cfg = emptyCfg();
  cfg.routes.set("/", route({ handler: "routes/index.tsx" }));
  cfg.routes.set("/blog/:slug", route({ handler: "routes/blog/[slug].tsx" }));
  cfg.routes.set("/files/:path*", route({ handler: "routes/files/[...path].tsx" }));

  const code = generateRouterModule(cfg);

  // Plain matcher constant + named export. No runtime rou3 construction.
  assert.match(code, /const match\s*=/);
  assert.match(code, /export\s*\{\s*match\s*\}/);
  assert.doesNotMatch(code, /from "rou3"/);
  assert.doesNotMatch(code, /addRoute\(|createRouter\(/);

  // Each route's data serializes to `() => import("fresh:routes/<id>")`.
  assert.match(code, /\(\)\s*=>\s*import\("fresh:routes\/index"\)/);
  assert.match(code, /\(\)\s*=>\s*import\("fresh:routes\/blog\/\[slug\]"\)/);
  assert.match(code, /\(\)\s*=>\s*import\("fresh:routes\/files\/\[\.\.\.path\]"\)/);
});

test("generateRouterModule produces a matcher that actually resolves a known path", () => {
  const cfg = emptyCfg();
  cfg.routes.set("/", route({ handler: "routes/index.tsx" }));
  cfg.routes.set("/blog/:slug", route({ handler: "routes/blog/[slug].tsx" }));

  const code = generateRouterModule(cfg);
  // Strip the named export so the matcher comes back from the IIFE.
  const evalBody = code.replace(/export\s*\{\s*match\s*\}\s*;?/, "") + "\nreturn match;";
  const m = new Function(evalBody)() as (
    method: string | undefined,
    path: string,
  ) => { data: () => Promise<unknown>; params?: Record<string, string> } | undefined;

  const root = m(undefined, "/");
  assert.ok(root, "matcher should resolve `/`");
  assert.equal(typeof root!.data, "function");

  const slug = m(undefined, "/blog/hello");
  assert.ok(slug, "matcher should resolve `/blog/:slug`");
  assert.deepEqual(slug!.params, { slug: "hello" });

  assert.equal(m(undefined, "/nope"), undefined);
});

test("generateRouterModule: an index route is not shadowed by a sibling catch-all", () => {
  const cfg = emptyCfg();
  // Insertion order mirrors the directory walk, where `[...slug].tsx` (ASCII
  // `[`) precedes `index.tsx` — the order that used to make the catch-all win.
  cfg.routes.set("/docs/:slug*", route({ handler: "routes/docs/[...slug].tsx" }));
  cfg.routes.set("/docs", route({ handler: "routes/docs/index.tsx" }));
  // A root catch-all must likewise not shadow `/`.
  cfg.routes.set("/:rest*", route({ handler: "routes/[...rest].tsx" }));
  cfg.routes.set("/", route({ handler: "routes/index.tsx" }));

  const code = generateRouterModule(cfg);
  const evalBody = code.replace(/export\s*\{\s*match\s*\}\s*;?/, "") + "\nreturn match;";
  const m = new Function(evalBody)() as (
    method: string | undefined,
    path: string,
  ) => { data: () => Promise<unknown>; params?: Record<string, string> } | undefined;

  // The matched route's `data` is an `() => import("fresh:routes/<id>")` thunk;
  // read the id off its source rather than invoking it (the virtual isn't
  // importable in a unit test).
  const idOf = (r: { data: () => Promise<unknown> } | undefined): string | undefined => {
    const found = r?.data.toString().match(/fresh:routes\/(.+?)"/);
    return found?.[1];
  };

  // The static parent paths resolve to their index routes, not the catch-alls.
  assert.equal(idOf(m(undefined, "/docs")), "docs/index");
  assert.equal(idOf(m(undefined, "/")), "index");
  // Deeper paths still fall through to the catch-all.
  assert.equal(idOf(m(undefined, "/docs/intro")), "docs/[...slug]");
});

test("compareRouteSpecificity orders static before dynamic before catch-all", () => {
  // Static parent precedes its zero-length-matching catch-all sibling.
  assert.ok(compareRouteSpecificity("/docs", "/docs/:slug*") < 0);
  assert.ok(compareRouteSpecificity("/", "/:rest*") < 0);
  // Static beats dynamic beats catch-all at the same depth.
  assert.ok(compareRouteSpecificity("/a/b", "/a/:b") < 0);
  assert.ok(compareRouteSpecificity("/a/:b", "/a/:b*") < 0);
  // A deeper static prefix wins between two catch-alls.
  assert.ok(compareRouteSpecificity("/a/b/:y*", "/a/:x*") < 0);
  // Symmetry / stability.
  assert.equal(compareRouteSpecificity("/a/:b", "/a/:b"), 0);
  assert.ok(compareRouteSpecificity("/docs/:slug*", "/docs") > 0);
});

test("generateRouterModule surfaces named catch-all params under their declared name, not the anonymous `_`", () => {
  // Regression: `[...path]` used to flatten to `*` and rou3 named the
  // captured tail `_`; we now emit `:path*` so the param surfaces under
  // its declared name end-to-end.
  const cfg = emptyCfg();
  cfg.routes.set("/files/:path*", route({ handler: "routes/files/[...path].tsx" }));

  const code = generateRouterModule(cfg);
  const evalBody = code.replace(/export\s*\{\s*match\s*\}\s*;?/, "") + "\nreturn match;";
  const m = new Function(evalBody)() as (
    method: string | undefined,
    path: string,
  ) => { data: () => Promise<unknown>; params?: Record<string, string> } | undefined;

  const deep = m(undefined, "/files/a/b/c.txt");
  assert.ok(deep, "matcher should resolve `/files/:path*` for a multi-segment tail");
  assert.deepEqual(deep!.params, { path: "a/b/c.txt" });
  assert.equal((deep!.params as Record<string, string>)._, undefined, "no anonymous `_` carve-out");

  // Zero-segment tail (`:path*` allows it): matches `/files` itself,
  // with `path` left out of `params` entirely (rou3's `*` semantics).
  const empty = m(undefined, "/files");
  assert.ok(empty, "matcher should resolve `/files` (zero-segment tail)");
});

// ---------- generateRouteModule ----------

test("generateRouteModule wires the handler + ?assets=ssr + middleware + render config", () => {
  const r = route({
    handler: "routes/blog/[slug].tsx",
    middlewares: ["routes/_middleware.tsx"],
    layouts: ["routes/_layout.tsx"],
  });
  const code = generateRouteModule(r, "/project", {
    app: "routes/_app.tsx",
    clientEntry: "entry.client.ts",
    dev: false,
  });

  // freshHandler etc imported from the published `fresh/internal/server` entry.
  assert.match(code, /from "fresh\/internal\/server"/);

  // Handler is wildcard-imported (so validateHandler/validatePage can run) + its
  // `?assets=ssr` for CSS injection.
  assert.match(code, /import \* as __handler from "\/project\/routes\/blog\/\[slug\]\.tsx"/);
  assert.match(
    code,
    /import __handler_ssrAssets from "\/project\/routes\/blog\/\[slug\]\.tsx\?assets=ssr"/,
  );

  // Layouts: wildcard import + ?assets=ssr.
  assert.match(code, /import \* as __lay0 from "\/project\/routes\/_layout\.tsx"/);
  assert.match(code, /import __lay0_ssrAssets from "\/project\/routes\/_layout\.tsx\?assets=ssr"/);

  // _app: wildcard import (so the SSR bundle has a chunk for it) + ?assets=ssr.
  assert.match(code, /import \* as __app from "\/project\/routes\/_app\.tsx"/);
  assert.match(code, /import __app_ssrAssets from "\/project\/routes\/_app\.tsx\?assets=ssr"/);

  // Middleware: wildcard import.
  assert.match(code, /import \* as __mw0 from "\/project\/routes\/_middleware\.tsx"/);

  // Client entry's ?assets=client.
  assert.match(code, /import __clientAssets from "\/project\/entry\.client\.ts\?assets=client"/);

  // Render config — dev flag is honored.
  assert.match(code, /dev: false/);
  assert.match(code, /ssrAssets: \[__handler_ssrAssets, __lay0_ssrAssets, __app_ssrAssets\]/);
  assert.match(code, /clientAssets: __clientAssets/);
  // _app's default export is wired in so renderPage can use it as the shell.
  assert.match(code, /app: __app\.default/);

  // Island boot bundle is always imported + threaded into the render config.
  assert.match(code, /import __bootAssets from "fresh\/internal\/client\?assets=client"/);
  assert.match(code, /clientBootAssets: __bootAssets/);
  // Islands map (SSR-side URL resolution) is imported + threaded too.
  assert.match(code, /import __islandsMap from "fresh:internal\/islands"/);
  assert.match(code, /islands: __islandsMap/);

  // Default export wires freshHandler with handler/page/middlewares/layouts.
  assert.match(
    code,
    /export default freshHandler\(validateHandler\(__handler\), validatePage\(__handler\), \[validateMiddleware\(__mw0\)\], \[validateLayout\(__lay0\)\], __renderConfig\)/,
  );
});

test("generateRouteModule with no app/clientEntry/middlewares produces a minimal module", () => {
  const r = route({ handler: "routes/index.tsx" });
  const code = generateRouteModule(r, "/p", { dev: true });

  // dev=true honored.
  assert.match(code, /dev: true/);
  // No app/layout/middleware imports.
  assert.doesNotMatch(code, /__lay\d/);
  assert.doesNotMatch(code, /__mw\d/);
  assert.doesNotMatch(code, /__app/);
  // Client assets fall back to null.
  assert.match(code, /clientAssets: null/);
  // No _app → app falls back to null too.
  assert.match(code, /app: null/);
  // Boot bundle is still imported even on a minimal route.
  assert.match(code, /clientBootAssets: __bootAssets/);
  // Empty middleware + layout arrays in the freshHandler call.
  assert.match(
    code,
    /export default freshHandler\(validateHandler\(__handler\), validatePage\(__handler\), \[\], \[\], __renderConfig\)/,
  );
});

test("generateRouteModule with serverEntry imports the app and leads the chain with its middlewares", () => {
  const r = route({
    handler: "routes/index.tsx",
    middlewares: ["routes/_middleware.tsx"],
  });
  const code = generateRouteModule(r, "/project", {
    serverEntry: "entry.server.ts",
    dev: true,
  });

  // `getMiddleware` is pulled in from the internal server entry to read the
  // app's private list.
  assert.match(code, /import \{[^}]*\bgetMiddleware\b[^}]*\} from "fresh\/internal\/server"/);
  // The programmatic app is imported by its `app` named export, under a name
  // that can't collide with the `__app` (_app.tsx shell) import.
  assert.match(code, /import \{ app as __entryApp \} from "\/project\/entry\.server\.ts"/);
  // App middlewares are read via getMiddleware and spread first, ahead of the
  // file-based `_middleware`.
  assert.match(code, /\[\.\.\.getMiddleware\(__entryApp\), validateMiddleware\(__mw0\)\]/);
});

test("generateRouteModule without serverEntry pulls in no app import, spread, or getMiddleware", () => {
  const r = route({ handler: "routes/index.tsx" });
  const code = generateRouteModule(r, "/project", { dev: true });
  assert.doesNotMatch(code, /__entryApp/);
  assert.doesNotMatch(code, /getMiddleware/);
});

// ---------- generateErrorPageModule ----------

test("generateErrorPageModule without _error emits a minimal fallback handler", () => {
  const cfg = emptyCfg();
  const code = generateErrorPageModule(cfg, "/p");
  assert.match(code, /export default function/);
  // Status comes from `event.error.status`, defaulting to 500.
  assert.match(code, /event\.error && event\.error\.status\) \|\| 500/);
  assert.match(code, /"Internal Server Error"/);
  // No freshHandler import — pure fallback.
  assert.doesNotMatch(code, /freshHandler/);
});

test("generateErrorPageModule with _error wires the user's handler + page through freshHandler (no middlewares, no layouts)", () => {
  const cfg = emptyCfg();
  cfg.error = "routes/_error.tsx";
  const code = generateErrorPageModule(cfg, "/proj", {
    app: "routes/_app.tsx",
    dev: false,
  });

  assert.match(code, /from "fresh\/internal\/server"/);
  assert.match(code, /import \* as __error from "\/proj\/routes\/_error\.tsx"/);
  assert.match(code, /import __error_ssrAssets from "\/proj\/routes\/_error\.tsx\?assets=ssr"/);
  // `_app` is bundled (so the error page is wrapped in the app shell).
  assert.match(code, /import \* as __app from "\/proj\/routes\/_app\.tsx"/);
  assert.match(code, /app: __app\.default/);
  // Auto-handler defaults the response status to `error.status ?? 500`.
  assert.match(
    code,
    /GET: \(ctx\) => \(\{ data: undefined, status: \(ctx\.error && ctx\.error\.status\) \|\| 500 \}\)/,
  );
  // Middlewares + layouts intentionally empty for the error route.
  assert.match(
    code,
    /export default freshHandler\(__userHandler \?\? __autoHandler, validatePage\(__error\), \[\], \[\], __renderConfig\)/,
  );
});

// ---------- virtual ID constants ----------

test("virtual ID constants stay stable (consumers spell them by string)", () => {
  assert.equal(ROUTE_VIRTUAL_PREFIX, "fresh:routes/");
  assert.equal(ROUTER_VIRTUAL_ID, "fresh:internal/router");
  assert.equal(SERVER_ENTRY_VIRTUAL_ID, "fresh:internal/server-entrypoint");
  assert.equal(ERROR_PAGE_VIRTUAL_ID, "fresh:internal/error-page");
  // Boot is a real package specifier, not a virtual.
  assert.equal(CLIENT_BOOT_SPECIFIER, "fresh/internal/client");
});
