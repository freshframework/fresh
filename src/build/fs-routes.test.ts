import { test } from "vitest";
import assert from "node:assert/strict";
import * as fsp from "node:fs/promises";

import {
  buildFreshConfig,
  buildPattern,
  createMemFs,
  createNodeFs,
  type FreshConfig,
  hasRouteExt,
  segmentToPattern,
  stripExt,
} from "./fs-routes.ts";

// ---------- pure helpers ----------

test("hasRouteExt accepts ts/tsx/js/jsx and rejects others", () => {
  assert.equal(hasRouteExt("foo.tsx"), true);
  assert.equal(hasRouteExt("foo.ts"), true);
  assert.equal(hasRouteExt("foo.jsx"), true);
  assert.equal(hasRouteExt("foo.js"), true);
  assert.equal(hasRouteExt("foo.md"), false);
  assert.equal(hasRouteExt("foo.css"), false);
  assert.equal(hasRouteExt("foo"), false);
});

test("stripExt removes route extensions", () => {
  assert.equal(stripExt("index.tsx"), "index");
  assert.equal(stripExt("[slug].ts"), "[slug]");
  assert.equal(stripExt("_app.jsx"), "_app");
  assert.equal(stripExt("noext"), "noext");
});

test("segmentToPattern maps dynamic + catch-all + groups", () => {
  assert.equal(segmentToPattern("about"), "about");
  assert.equal(segmentToPattern("[slug]"), ":slug");
  assert.equal(segmentToPattern("[id]"), ":id");
  // Named catch-all encodes the name so `ctx.params.<name>` is populated
  // — rou3's `:name*` is exactly that (named-greedy match).
  assert.equal(segmentToPattern("[...rest]"), ":rest*");
  assert.equal(segmentToPattern("[...path]"), ":path*");
  assert.equal(segmentToPattern("(marketing)"), null);
  assert.equal(segmentToPattern("(group)"), null);
});

test("buildPattern handles index, nesting, params, catch-alls, groups", () => {
  assert.equal(buildPattern([], "index"), "/");
  assert.equal(buildPattern([], "about"), "/about");
  assert.equal(buildPattern(["blog"], "index"), "/blog");
  assert.equal(buildPattern(["blog"], "[slug]"), "/blog/:slug");
  assert.equal(buildPattern(["admin", "post"], "[slug]"), "/admin/post/:slug");
  assert.equal(buildPattern([], "[...rest]"), "/:rest*");
  assert.equal(buildPattern(["files"], "[...path]"), "/files/:path*");
  assert.equal(buildPattern(["(marketing)"], "index"), "/");
  assert.equal(buildPattern(["(marketing)", "blog"], "[slug]"), "/blog/:slug");
});

// ---------- in-memory FS ----------

test("createMemFs reports dirs and files, supports exists", async () => {
  const fs = createMemFs(["routes/index.tsx", "routes/blog/index.tsx", "routes/blog/[slug].tsx"]);
  assert.equal(await fs.exists("routes"), true);
  assert.equal(await fs.exists("routes/blog"), true);
  assert.equal(await fs.exists("routes/blog/[slug].tsx"), true);
  assert.equal(await fs.exists("routes/nope"), false);

  const top = await fs.readDir("routes");
  const names = top.map((e) => e.name).sort();
  assert.deepEqual(names, ["blog", "index.tsx"]);
  const blogDir = top.find((e) => e.name === "blog")!;
  assert.equal(blogDir.isDirectory, true);
  assert.equal(blogDir.isFile, false);
});

test("createMemFs throws when readDir hits a missing path", async () => {
  const fs = createMemFs(["routes/index.tsx"]);
  await assert.rejects(() => fs.readDir("does/not/exist"));
});

// ---------- buildFreshConfig ----------

test("empty FS yields empty config", async () => {
  const fs = createMemFs([]);
  const cfg = await buildFreshConfig(fs);
  assert.deepEqual<FreshConfig>(cfg, {
    islands: [],
    routes: new Map(),
    app: null,
    error: null,
    clientEntry: null,
    serverEntry: null,
  });
});

test("missing routes/ and islands/ are tolerated", async () => {
  const fs = createMemFs(["readme.md"]);
  const cfg = await buildFreshConfig(fs);
  assert.deepEqual<FreshConfig>(cfg, {
    islands: [],
    routes: new Map(),
    app: null,
    error: null,
    clientEntry: null,
    serverEntry: null,
  });
});

test("islands are gathered recursively, sorted, and only route-ext files", async () => {
  const fs = createMemFs([
    "islands/Counter.tsx",
    "islands/Button.tsx",
    "islands/forms/Input.tsx",
    "islands/README.md",
  ]);
  const cfg = await buildFreshConfig(fs);
  assert.deepEqual(cfg.islands, [
    { path: "islands/Button.tsx" },
    { path: "islands/Counter.tsx" },
    { path: "islands/forms/Input.tsx" },
  ]);
});

test("co-located (_islands) directories contribute to islands[] (recursively)", async () => {
  const fs = createMemFs([
    "islands/Counter.tsx",
    "routes/(_islands)/Header.tsx",
    "routes/admin/(_islands)/Sidebar.tsx",
    "routes/admin/(_islands)/widgets/Chart.tsx",
    "routes/admin/index.tsx",
    "routes/index.tsx",
  ]);
  const cfg = await buildFreshConfig(fs);
  assert.deepEqual(cfg.islands, [
    { path: "islands/Counter.tsx" },
    { path: "routes/(_islands)/Header.tsx" },
    { path: "routes/admin/(_islands)/Sidebar.tsx" },
    { path: "routes/admin/(_islands)/widgets/Chart.tsx" },
  ]);
});

test("the (_islands) group folder is dropped from routing and its files are not routes", async () => {
  const fs = createMemFs([
    "routes/blog/(_islands)/Like.tsx",
    "routes/blog/(_islands)/[slug].tsx", // looks dynamic, still an island
    "routes/blog/index.tsx",
    "routes/index.tsx",
  ]);
  const cfg = await buildFreshConfig(fs);
  // `(_islands)` is dropped from routing entirely — only the real routes remain.
  assert.deepEqual([...cfg.routes.keys()].sort(), ["/", "/blog"]);
  assert.deepEqual(cfg.islands.map((i) => i.path).sort(), [
    "routes/blog/(_islands)/Like.tsx",
    "routes/blog/(_islands)/[slug].tsx",
  ]);
});

test("a bare _islands/ folder is NOT an island folder — its files become routes", async () => {
  // Only the parenthesized `(_islands)` form is co-located islands; a plain
  // `_islands/` directory is treated as a normal (literal) route segment.
  const fs = createMemFs(["routes/_islands/Header.tsx", "routes/index.tsx"]);
  const cfg = await buildFreshConfig(fs);
  assert.deepEqual([...cfg.routes.keys()].sort(), ["/", "/_islands/Header"]);
  assert.deepEqual(cfg.islands, []);
});

test("(_islands) works without a top-level islands/ directory", async () => {
  const fs = createMemFs(["routes/(_islands)/Counter.tsx", "routes/index.tsx"]);
  const cfg = await buildFreshConfig(fs);
  assert.deepEqual(cfg.islands, [{ path: "routes/(_islands)/Counter.tsx" }]);
});

test("flat routes produce simple hono patterns", async () => {
  const fs = createMemFs(["routes/index.tsx", "routes/about.tsx"]);
  const cfg = await buildFreshConfig(fs);
  assert.deepEqual([...cfg.routes.keys()].sort(), ["/", "/about"]);
  assert.deepEqual(cfg.routes.get("/"), {
    handler: "routes/index.tsx",
    middlewares: [],
    layouts: [],
  });
  assert.deepEqual(cfg.routes.get("/about"), {
    handler: "routes/about.tsx",
    middlewares: [],
    layouts: [],
  });
});

test("dynamic + catch-all segments become :param / :name*", async () => {
  const fs = createMemFs(["routes/blog/[slug].tsx", "routes/files/[...path].tsx"]);
  const cfg = await buildFreshConfig(fs);
  const keys = [...cfg.routes.keys()].sort();
  // The catch-all surfaces under its declared name (`path`), not the
  // anonymous `_` rou3 falls back to for `**`.
  assert.deepEqual(keys, ["/blog/:slug", "/files/:path*"]);
});

test("entry.server is detected at the project root", async () => {
  const fs = createMemFs(["entry.server.ts", "routes/index.tsx"]);
  const cfg = await buildFreshConfig(fs);
  assert.equal(cfg.serverEntry, "entry.server.ts");
});

test("entry.server is null when absent, and a non-root copy is ignored", async () => {
  const fs = createMemFs(["routes/entry.server.ts", "routes/index.tsx"]);
  const cfg = await buildFreshConfig(fs);
  assert.equal(cfg.serverEntry, null);
});

test("_app is recorded only at the routes root", async () => {
  const fs = createMemFs([
    "routes/_app.tsx",
    "routes/admin/_app.tsx", // ignored, not at root
    "routes/admin/index.tsx",
  ]);
  const cfg = await buildFreshConfig(fs);
  assert.equal(cfg.app, "routes/_app.tsx");
});

test("layouts and middlewares accumulate down the tree", async () => {
  const fs = createMemFs([
    "routes/_middleware.tsx",
    "routes/_layout.tsx",
    "routes/admin/_middleware.tsx",
    "routes/admin/_layout.tsx",
    "routes/admin/post/[slug].tsx",
    "routes/admin/users.tsx",
    "routes/index.tsx",
  ]);
  const cfg = await buildFreshConfig(fs);

  assert.deepEqual(cfg.routes.get("/"), {
    handler: "routes/index.tsx",
    middlewares: ["routes/_middleware.tsx"],
    layouts: ["routes/_layout.tsx"],
  });

  assert.deepEqual(cfg.routes.get("/admin/users"), {
    handler: "routes/admin/users.tsx",
    middlewares: ["routes/_middleware.tsx", "routes/admin/_middleware.tsx"],
    layouts: ["routes/_layout.tsx", "routes/admin/_layout.tsx"],
  });

  assert.deepEqual(cfg.routes.get("/admin/post/:slug"), {
    handler: "routes/admin/post/[slug].tsx",
    middlewares: ["routes/_middleware.tsx", "routes/admin/_middleware.tsx"],
    layouts: ["routes/_layout.tsx", "routes/admin/_layout.tsx"],
  });
});

test("_error is recorded only at the routes root", async () => {
  const fs = createMemFs([
    "routes/_error.tsx",
    "routes/admin/_error.tsx", // ignored, not at root
    "routes/admin/index.tsx",
    "routes/index.tsx",
  ]);
  const cfg = await buildFreshConfig(fs);
  assert.equal(cfg.error, "routes/_error.tsx");
  // _error doesn't appear in per-route entries anymore
  assert.deepEqual(cfg.routes.get("/"), {
    handler: "routes/index.tsx",
    middlewares: [],
    layouts: [],
  });
});

test("non-route files in routes/ are ignored", async () => {
  const fs = createMemFs(["routes/index.tsx", "routes/styles.css", "routes/notes.md"]);
  const cfg = await buildFreshConfig(fs);
  assert.deepEqual([...cfg.routes.keys()], ["/"]);
});

test("route groups don't appear in pattern but still inherit specials", async () => {
  const fs = createMemFs([
    "routes/(marketing)/_layout.tsx",
    "routes/(marketing)/_middleware.tsx",
    "routes/(marketing)/about.tsx",
    "routes/(marketing)/index.tsx",
  ]);
  const cfg = await buildFreshConfig(fs);
  assert.deepEqual([...cfg.routes.keys()].sort(), ["/", "/about"]);
  assert.deepEqual(cfg.routes.get("/about"), {
    handler: "routes/(marketing)/about.tsx",
    middlewares: ["routes/(marketing)/_middleware.tsx"],
    layouts: ["routes/(marketing)/_layout.tsx"],
  });
});

test("siblings don't see each other's specials", async () => {
  const fs = createMemFs(["routes/a/_middleware.tsx", "routes/a/index.tsx", "routes/b/index.tsx"]);
  const cfg = await buildFreshConfig(fs);
  assert.deepEqual(cfg.routes.get("/a")!.middlewares, ["routes/a/_middleware.tsx"]);
  assert.deepEqual(cfg.routes.get("/b")!.middlewares, []);
});

test("chain arrays are independent copies per route", async () => {
  const fs = createMemFs(["routes/_middleware.tsx", "routes/a.tsx", "routes/b.tsx"]);
  const cfg = await buildFreshConfig(fs);
  assert.notEqual(cfg.routes.get("/a")!.middlewares, cfg.routes.get("/b")!.middlewares);
  cfg.routes.get("/a")!.middlewares.push("tampered");
  assert.deepEqual(cfg.routes.get("/b")!.middlewares, ["routes/_middleware.tsx"]);
});

test("rootDir argument scopes the search", async () => {
  const fs = createMemFs(["project/routes/index.tsx", "project/islands/Counter.tsx"]);
  const cfg = await buildFreshConfig(fs, "project");
  assert.equal(cfg.routes.get("/")!.handler, "project/routes/index.tsx");
  assert.deepEqual(cfg.islands, [{ path: "project/islands/Counter.tsx" }]);
});

// ---------- end-to-end against the real example/ tree ----------

test("matches the on-disk example/ project", async () => {
  const fs = createNodeFs(fsp);
  const cfg = await buildFreshConfig(fs, "example");

  assert.equal(cfg.app, "example/routes/_app.tsx");
  assert.equal(cfg.error, "example/routes/_error.tsx");
  assert.deepEqual(cfg.islands, [
    { path: "example/islands/Clicks.tsx" },
    { path: "example/islands/Counter.tsx" },
    { path: "example/islands/double.tsx" },
    { path: "example/islands/KeptCounter.tsx" },
    { path: "example/islands/Wrapper.tsx" },
  ]);

  assert.deepEqual([...cfg.routes.keys()].sort(), [
    "/",
    "/about",
    "/admin/post/:slug",
    "/admin/posts",
    "/admin/users",
    "/blog",
    "/blog/:slug",
    "/partials",
    "/partials/about",
    "/partials/form",
    "/partials/kept-a",
    "/partials/kept-b",
    "/partials/time",
  ]);

  // Nested layout: the partials section's `_layout.tsx` stacks under the root.
  assert.deepEqual(cfg.routes.get("/partials/time"), {
    handler: "example/routes/partials/time.tsx",
    middlewares: ["example/routes/_middleware.tsx"],
    layouts: ["example/routes/_layout.tsx", "example/routes/partials/_layout.tsx"],
  });

  assert.deepEqual(cfg.routes.get("/admin/post/:slug"), {
    handler: "example/routes/admin/post/[slug].tsx",
    middlewares: ["example/routes/_middleware.tsx", "example/routes/admin/_middleware.tsx"],
    layouts: ["example/routes/_layout.tsx"],
  });

  assert.deepEqual(cfg.routes.get("/blog/:slug"), {
    handler: "example/routes/blog/[slug].tsx",
    middlewares: ["example/routes/_middleware.tsx"],
    layouts: ["example/routes/_layout.tsx"],
  });

  assert.equal(cfg.routes.get("/")!.handler, "example/routes/index.tsx");
});
