import { test } from "vitest";
import assert from "node:assert/strict";

import { h, type VNode } from "preact";
import { renderPage, renderPartial, sliceTopLevelPartials, type RenderConfig } from "./render.ts";
import { Partial } from "../runtime/partial.ts";
import { Head } from "../runtime/head.ts";
import { createHandlerContext, createMiddlewareContext } from "./context.ts";

// ---------- fixtures (mirrors render.test.ts) --------------------------

/** Build an island-like component: a function tagged with `__FRESH_SERIALIZABLE_FUNCTION`. */
function island(
  marker: { specifier: string; export: string | null },
  // deno-lint-ignore no-explicit-any
  fn: (props: any) => VNode<any>,
) {
  (fn as unknown as { __FRESH_SERIALIZABLE_FUNCTION: unknown }).__FRESH_SERIALIZABLE_FUNCTION =
    marker;
  return fn;
}

interface ViteAssetsLike {
  entry?: string;
  js?: { href: string }[];
  css?: { href: string }[];
}

function islandsMap(urls: Record<string, string>): Map<string, () => Promise<ViteAssetsLike>> {
  const m = new Map<string, () => Promise<ViteAssetsLike>>();
  for (const [spec, url] of Object.entries(urls)) {
    m.set(spec, () => Promise.resolve({ entry: url }));
  }
  return m;
}

const bootCfg = (over: Partial<RenderConfig> = {}): RenderConfig => ({
  dev: false,
  ssrAssets: [],
  clientAssets: null,
  clientBootAssets: { entry: "/assets/boot.js", js: [], css: [] },
  ...over,
});

// ---------- <Partial> marker emission on a full page -------------------

test("<Partial> wraps its content in boundary markers on a full render", async () => {
  const pageVNode = h("div", null, h(Partial, { name: "main" }, h("p", null, "hello")));
  const html = await renderPage(pageVNode);
  assert.match(html, /<!--fresh-partial:replace:main--><p>hello<\/p><!--\/fresh-partial-->/);
});

test("<Partial> mode is encoded in the start marker", async () => {
  for (const mode of ["replace", "append", "prepend"] as const) {
    const html = await renderPage(
      h(Partial, { name: "feed", mode }, h("li", null, "item")) as VNode,
    );
    assert.match(html, new RegExp(`<!--fresh-partial:${mode}:feed-->`));
  }
});

test("duplicate <Partial> names throw", async () => {
  const pageVNode = h(
    "div",
    null,
    h(Partial, { name: "dup" }, "a"),
    h(Partial, { name: "dup" }, "b"),
  );
  await assert.rejects(renderPage(pageVNode), /Duplicate <Partial name="dup">/);
});

test("<Partial> with an empty name throws", async () => {
  await assert.rejects(
    renderPage(h(Partial, { name: "" }, "x") as VNode),
    /non-empty string `name`/,
  );
});

test("<Partial> with an invalid mode throws", async () => {
  await assert.rejects(
    // deno-lint-ignore no-explicit-any
    renderPage(h(Partial, { name: "x", mode: "swap" as any }, "y") as VNode),
    /invalid mode/,
  );
});

test("<Partial> inside an island throws", async () => {
  const Bad = island({ specifier: "islands/Bad.tsx", export: "Bad" }, () =>
    h(Partial, { name: "nope" }, "x"),
  );
  await assert.rejects(
    renderPage(h("div", null, h(Bad, {})), {
      renderConfig: bootCfg({ islands: islandsMap({ "islands/Bad.tsx": "/a.js" }) }),
    }),
    /cannot be used inside an island/,
  );
});

// ---------- sliceTopLevelPartials --------------------------------------

test("sliceTopLevelPartials extracts each top-level region inclusive of markers", () => {
  const html =
    `<div><!--fresh-partial:replace:a--><p>A</p><!--/fresh-partial--></div>` +
    `<!--fresh-partial:append:b--><span>B</span><!--/fresh-partial-->`;
  assert.deepEqual(sliceTopLevelPartials(html), [
    `<!--fresh-partial:replace:a--><p>A</p><!--/fresh-partial-->`,
    `<!--fresh-partial:append:b--><span>B</span><!--/fresh-partial-->`,
  ]);
});

test("sliceTopLevelPartials keeps nested partials inside their parent region", () => {
  const html =
    `<!--fresh-partial:replace:outer-->` +
    `<div><!--fresh-partial:replace:inner-->x<!--/fresh-partial--></div>` +
    `<!--/fresh-partial-->`;
  const regions = sliceTopLevelPartials(html);
  assert.equal(regions.length, 1);
  assert.match(regions[0], /fresh-partial:replace:inner/);
});

test("sliceTopLevelPartials returns [] when there are no partials", () => {
  assert.deepEqual(sliceTopLevelPartials("<main><h1>hi</h1></main>"), []);
});

// ---------- renderPartial ----------------------------------------------

test("renderPartial returns only the regions — no document shell", async () => {
  const pageVNode = h(
    "div",
    null,
    h("nav", null, "menu"),
    h(Partial, { name: "main" }, h("p", null, "body")),
  );
  const fragment = await renderPartial(pageVNode);
  assert.ok(fragment !== null);
  assert.ok(!fragment!.startsWith("<!DOCTYPE"));
  assert.doesNotMatch(fragment!, /<html/);
  assert.doesNotMatch(fragment!, /<body/);
  // The non-partial nav is NOT in the response.
  assert.doesNotMatch(fragment!, /menu/);
  // The region is.
  assert.match(fragment!, /<!--fresh-partial:replace:main--><p>body<\/p><!--\/fresh-partial-->/);
});

test("renderPartial returns null when the page has no partials", async () => {
  const fragment = await renderPartial(h("main", null, h("h1", null, "hi")));
  assert.equal(fragment, null);
});

test("renderPartial emits a <Head> delta region", async () => {
  const pageVNode = h(
    Partial,
    { name: "main" },
    h(Head, null, h("title", null, "New Title")),
    h("p", null, "body"),
  ) as VNode;
  const fragment = await renderPartial(pageVNode);
  assert.ok(fragment !== null);
  assert.match(fragment!, /<!--fresh-head--><title>New Title<\/title><!--\/fresh-head-->/);
  // The title is hoisted out of the region body, not duplicated inline.
  const bodyMatches = fragment!.match(/<title>New Title<\/title>/g) ?? [];
  assert.equal(bodyMatches.length, 1);
});

test("renderPartial's island state script calls the partial sentinel, not boot", async () => {
  const Counter = island(
    { specifier: "islands/Counter.tsx", export: "Counter" },
    (props: { count: number }) => h("button", null, `Count: ${props.count}`),
  );
  const pageVNode = h(Partial, { name: "main" }, h(Counter, { count: 1 })) as VNode;
  const fragment = await renderPartial(pageVNode, {
    renderConfig: bootCfg({
      islands: islandsMap({ "islands/Counter.tsx": "/assets/Counter.js" }),
    }),
  });
  assert.ok(fragment !== null);
  // The island chunk is imported; the boot runtime is NOT (the client owns the
  // apply step). The data script is tagged and ends at `const data = …;` with
  // NO call — the client appends its own, so a serialized value can't inject.
  assert.match(fragment!, /<script type="module" data-fresh-partial>/);
  assert.match(fragment!, /import \{Counter as _0_0\} from "\/assets\/Counter\.js";/);
  assert.doesNotMatch(fragment!, /\bboot as _/);
  assert.match(
    fragment!,
    /const data=\{islands:\[\{Component:_0_0,props:\{count:1\}\}\][^<]*\};<\/script>/,
  );
  assert.doesNotMatch(fragment!, /\(data\);/);
  // The island still server-rendered inside the region.
  assert.match(fragment!, /<button>Count: 1<\/button>/);
  // Island chunk preloaded.
  assert.match(fragment!, /<link rel="modulepreload" href="\/assets\/Counter\.js">/);
});

test("renderPartial emits no apply call, so a serialized string can't inject one", async () => {
  // A prop value that collides with the client's apply-call name shape.
  const Evil = island({ specifier: "islands/Evil.tsx", export: "Evil" }, (p: { label: string }) =>
    h("span", null, p.label),
  );
  const pageVNode = h(
    Partial,
    { name: "content" },
    h(Evil, { label: "__freshPartialApply1" }),
  ) as VNode;
  const fragment = await renderPartial(pageVNode, {
    renderConfig: bootCfg({ islands: islandsMap({ "islands/Evil.tsx": "/assets/Evil.js" }) }),
  });
  assert.ok(fragment !== null);
  // The colliding string rides as plain data, and the server emits NO call —
  // the client appends its own, so nothing in the data is interpreted as one.
  assert.match(fragment!, /label:"__freshPartialApply1"/);
  assert.doesNotMatch(fragment!, /\(data\);/);
});

test("renderPartial serializes only islands INSIDE the emitted region", async () => {
  // An island outside any partial (e.g. in a layout) and one inside the region.
  const Outside = island({ specifier: "islands/Outside.tsx", export: "Outside" }, () =>
    h("span", null, "out"),
  );
  const Inside = island({ specifier: "islands/Inside.tsx", export: "Inside" }, () =>
    h("button", null, "in"),
  );
  const pageVNode = h(
    "div",
    null,
    h(Outside, {}),
    h(Partial, { name: "content" }, h(Inside, {})),
  ) as VNode;
  const fragment = await renderPartial(pageVNode, {
    renderConfig: bootCfg({
      islands: islandsMap({
        "islands/Outside.tsx": "/assets/Outside.js",
        "islands/Inside.tsx": "/assets/Inside.js",
      }),
    }),
  });
  assert.ok(fragment !== null);
  // The outside island is already hydrated on the live page and gets sliced
  // away — its chunk isn't imported and it's not in the state.
  assert.doesNotMatch(fragment!, /Outside\.js/);
  // The inside island ships, re-indexed to 0 (subset-relative, not page-wide).
  assert.match(fragment!, /import \{Inside as _0_0\} from "\/assets\/Inside\.js";/);
  assert.match(fragment!, /islands:\[\{Component:_0_0,props:\{\}\}\]/);
  assert.match(fragment!, /<!--fresh-island:0-->/);
});

test("renderPartial has no state script when the regions are static", async () => {
  const fragment = await renderPartial(
    h(Partial, { name: "main" }, h("p", null, "static")) as VNode,
    { renderConfig: bootCfg() },
  );
  assert.ok(fragment !== null);
  assert.doesNotMatch(fragment!, /<script/);
});

// ---------- island-less f-client-nav loader ----------------------------

test("renderPage injects the boot chunk loader on an island-less f-client-nav page", async () => {
  const pageVNode = h(
    "div",
    { "f-client-nav": true },
    h(Partial, { name: "main" }, h("p", null, "body")),
  ) as VNode;
  const html = await renderPage(pageVNode, { renderConfig: bootCfg() });
  assert.match(html, /<script type="module" src="\/assets\/boot\.js"><\/script>/);
});

test("renderPage does NOT inject the loader when there's no f-client-nav", async () => {
  const html = await renderPage(
    h("div", null, h(Partial, { name: "main" }, h("p", null, "body"))),
    { renderConfig: bootCfg() },
  );
  assert.doesNotMatch(html, /src="\/assets\/boot\.js"/);
});

// ---------- f-client-nav boolean coercion ------------------------------

test("a boolean f-client-nav renders as a string attribute (so opt-out works)", async () => {
  // Preact drops `false`-valued attributes; the render hook coerces booleans
  // to strings so `f-client-nav={false}` actually reaches the DOM.
  const off = await renderPage(h("div", { "f-client-nav": false }, "x") as VNode);
  assert.match(off, /<div f-client-nav="false">/);
  const on = await renderPage(h("div", { "f-client-nav": true }, "y") as VNode);
  assert.match(on, /<div f-client-nav="true">/);
});

// ---------- ctx.isPartial ----------------------------------------------

test("ctx.isPartial requires the Fresh-Partial header", () => {
  const next = () => Promise.resolve(new Response());
  const req = (headers: Record<string, string>) =>
    new Request("https://example.com/x", { headers });

  // A legit same-origin fetch with the header.
  const ok = req({
    "Fresh-Partial": "true",
    "sec-fetch-dest": "empty",
    "sec-fetch-mode": "same-origin",
    "sec-fetch-site": "same-origin",
  });
  assert.equal(createMiddlewareContext(ok, next).isPartial, true);
  assert.equal(
    createHandlerContext(ok, { params: {}, state: {}, error: undefined }).isPartial,
    true,
  );

  // No header → not a partial.
  assert.equal(createMiddlewareContext(req({}), next).isPartial, false);

  // Header present but missing Sec-Fetch metadata is still trusted (older
  // clients / non-secure contexts).
  assert.equal(createMiddlewareContext(req({ "Fresh-Partial": "true" }), next).isPartial, true);
});

test("ctx.isPartial refuses requests whose Sec-Fetch-* don't match a fetch", () => {
  const next = () => Promise.resolve(new Response());
  const req = (headers: Record<string, string>) =>
    new Request("https://example.com/x", { headers });

  // Top-level navigation (someone opened the URL directly).
  assert.equal(
    createMiddlewareContext(req({ "Fresh-Partial": "true", "sec-fetch-dest": "document" }), next)
      .isPartial,
    false,
  );
  // Cross-site request.
  assert.equal(
    createMiddlewareContext(req({ "Fresh-Partial": "true", "sec-fetch-site": "cross-site" }), next)
      .isPartial,
    false,
  );
  // Embedded as a sub-resource.
  assert.equal(
    createMiddlewareContext(req({ "Fresh-Partial": "true", "sec-fetch-dest": "iframe" }), next)
      .isPartial,
    false,
  );
});
