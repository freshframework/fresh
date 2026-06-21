import { test } from "vitest";
import assert from "node:assert/strict";

import { h, type ComponentChildren, type VNode } from "preact";
import { computed, signal, type Signal } from "@preact/signals";
import { DefaultApp, renderPage, type RenderConfig } from "./render.ts";
import { Head } from "../runtime/head.ts";

/**
 * Per-(url, name) implementations to bind into the inline boot
 * script's aliases. Anything not overridden becomes a callable
 * sentinel whose invocation returns a `{__call:{url,name,args}}`
 * record. Tests pass overrides to install real implementations for
 * `signal`, framework factories, etc. — matching the old reviver-map
 * ergonomics.
 */
export type BootImportOverrides = Record<string, Record<string, (...args: unknown[]) => unknown>>;

interface CallSentinel {
  (...args: unknown[]): { __call: { url: string; name: string; args: unknown[] } };
  __import: { url: string; name: string };
}

function makeSentinel(url: string, name: string): CallSentinel {
  const fn = ((...args: unknown[]) => ({ __call: { url, name, args } })) as CallSentinel;
  fn.__import = { url, name };
  return fn;
}

/**
 * Pull the inline `<script type="module">` body out of the rendered HTML.
 * Skips the dev-mode `import "/@vite/client";` script if present.
 */
function readInlineBootSource(html: string): string {
  const matches = [...html.matchAll(/<script type="module">([\s\S]*?)<\/script>/g)];
  for (let i = matches.length - 1; i >= 0; i--) {
    const body = matches[i][1];
    if (body.includes("@vite/client")) continue;
    return body;
  }
  throw new Error("no Fresh boot <script type='module'> in html");
}

/**
 * Parse the script's `import { x as alias } from "url";` lines into an
 * ordered list of `{alias, url, name}` records — order is module-index
 * order (since each module's first import appears in the source before
 * any later module's first import).
 */
function readScriptImports(src: string): Array<{ alias: string; url: string; name: string }> {
  const importRe = /import\s*\{([^}]+)\}\s*from\s*"([^"]+)";/g;
  const out: Array<{ alias: string; url: string; name: string }> = [];
  for (const m of src.matchAll(importRe)) {
    const url = m[2];
    for (const spec of m[1].split(",").map((s) => s.trim())) {
      const [from, , to] = spec.split(/\s+/);
      out.push({ alias: to, url, name: from });
    }
  }
  return out;
}

/**
 * Module URLs in the order they appear as `_<m>_…` module indices in
 * the script — same ordering the old `_m<i>` import list used to ship,
 * just keyed off the `<m>` part of `_<m>_<s>`.
 */
function readBootModuleUrls(html: string): string[] {
  const imports = readScriptImports(readInlineBootSource(html));
  const out: string[] = [];
  for (const { alias, url } of imports) {
    const m = alias.match(/^_(\d+)_\d+$/);
    if (!m) continue;
    const idx = Number(m[1]);
    if (out[idx] === undefined) out[idx] = url;
  }
  return out;
}

/**
 * Eval the inline boot script in a sandbox. Each aliased import is
 * either the matching override function (when supplied) or a
 * sentinel. The trailing `boot(data);` call is intercepted; the value
 * that would have been passed is returned as `bootArg`.
 */
function evalBootScript(
  html: string,
  overrides: BootImportOverrides = {},
): {
  data: unknown;
  bootArg: unknown;
} {
  const src = readInlineBootSource(html);
  const aliases = readScriptImports(src);
  let stripped = src.replace(/import\s*\{[^}]+\}\s*from\s*"[^"]+";/g, "");
  let bootArg: unknown = undefined;
  stripped = stripped.replace(
    /\b(_\d+_\d+)\s*\(\s*data\s*\)\s*;?\s*$/,
    (_, alias) => `__bootRecord(${alias},data);`,
  );
  const declLines: string[] = [];
  const bindings: Record<string, unknown> = {};
  for (const { alias, url, name } of aliases) {
    const override = overrides[url]?.[name];
    const value = override ?? makeSentinel(url, name);
    bindings[alias] = value;
    declLines.push(`const ${alias}=__bind(${JSON.stringify(alias)});`);
  }
  const body = `${declLines.join("")}${stripped}\nreturn { data: typeof data!=='undefined'?data:undefined };`;
  const fn = new Function("__bind", "__bootRecord", body) as (
    bind: (a: string) => unknown,
    rec: (bootAlias: unknown, arg: unknown) => void,
  ) => { data: unknown };
  const out = fn(
    (a) => bindings[a],
    (_a, v) => {
      bootArg = v;
    },
  );
  return { data: out.data, bootArg };
}

/**
 * Reshape `data.islands[N]` from `{Component, props}` (the live boot
 * shape) into the `{module, export, props}` form earlier tests
 * asserted on. `module` is the module index from
 * `Component.__import.url`'s position in the boot-module-URL list;
 * `export` is `Component.__import.name` (with `"default"` normalized
 * back to `null`).
 */
function reshapeIslands(islands: unknown[], moduleUrls: string[]): unknown[] {
  return islands.map((inst) => {
    const i = inst as { Component: CallSentinel; props: unknown };
    return {
      module: moduleUrls.indexOf(i.Component.__import.url),
      export: i.Component.__import.name === "default" ? null : i.Component.__import.name,
      props: i.props,
    };
  });
}

/** Eval the boot script and return just `data.islands` in reshaped form. */
function readState(html: string, overrides: BootImportOverrides = {}): unknown {
  const { data } = evalBootScript(html, overrides);
  return reshapeIslands((data as { islands: unknown[] }).islands, readBootModuleUrls(html));
}

/**
 * Eval the boot script ONCE and return the full `{islands, signals,
 * events}` triple. Single-eval is load-bearing: any signal / factory
 * result that should share identity across the triple (e.g. a signal
 * referenced from both an island prop and a `{signal}` text child)
 * relies on the shared `_x<n>` `const` binding produced by that one
 * eval. Re-evaluating splits sharing across distinct JS instances.
 */
function readBootState(
  html: string,
  overrides: BootImportOverrides = {},
): { islands: unknown[]; signals: unknown[]; events: unknown[] } {
  const { data } = evalBootScript(html, overrides);
  const d = data as { islands: unknown[]; signals: unknown[]; events: unknown[] };
  return {
    islands: reshapeIslands(d.islands, readBootModuleUrls(html)),
    signals: d.signals,
    events: d.events,
  };
}

/** Override map shorthand: bind `signal` (from the boot chunk) to preact's real `signal`. */
const SIGNAL_OVERRIDE: BootImportOverrides = {
  "/assets/boot.js": { signal: (v: unknown) => signal(v) as unknown },
};

const page = (): VNode => h("main", null, h("h1", null, "Hello"), h("p", null, "World"));

const emptyAssets = { entry: undefined, js: [], css: [] };

test("renderPage emits a full HTML document with the default app shell", async () => {
  const html = await renderPage(page());
  assert.ok(html.startsWith("<!DOCTYPE html>"), "doctype prefixed");
  assert.match(html, /<html>/);
  assert.match(html, /<head>/);
  assert.match(html, /<meta charset="UTF-8"\s*\/?>/);
  assert.match(
    html,
    /<meta name="viewport" content="width=device-width, initial-scale=1\.0"\s*\/?>/,
  );
  assert.match(html, /<body><main><h1>Hello<\/h1><p>World<\/p><\/main><\/body>/);
});

test("renderPage splices page HTML literally — `$`-sequences aren't replacement patterns", async () => {
  // `$&`, `$<name>`, `$$`, … are special in `String.replace`'s replacement
  // string; the page HTML must be inserted into the app shell verbatim.
  const tricky = h("main", null, h("code", null, "./$<name>.ts"), " literal $$ here");
  const html = await renderPage(tricky);
  assert.doesNotMatch(html, /FRESH_PAGE_PLACEHOLDER/, "the sentinel must not leak");
  assert.match(html, /<code>\.\/\$&lt;name>\.ts<\/code>/);
  assert.match(html, /literal \$\$ here/);
});

test("renderPage injects nothing into <head> when no renderConfig is passed", async () => {
  const html = await renderPage(page());
  assert.doesNotMatch(html, /<script /);
  assert.doesNotMatch(html, /<link /);
});

test("renderPage injects /@vite/client only when renderConfig.dev is true", async () => {
  const dev: RenderConfig = { dev: true, ssrAssets: [], clientAssets: null };
  const prod: RenderConfig = { dev: false, ssrAssets: [], clientAssets: null };
  const devHtml = await renderPage(page(), { renderConfig: dev });
  const prodHtml = await renderPage(page(), { renderConfig: prod });
  assert.match(devHtml, /<script type="module">import "\/@vite\/client";<\/script>/);
  assert.doesNotMatch(prodHtml, /\/@vite\/client/);
});

test("renderPage injects CSS links for every SSR and client asset (deduped)", async () => {
  const cfg: RenderConfig = {
    dev: false,
    ssrAssets: [
      { ...emptyAssets, css: [{ href: "/a.css" }, { href: "/shared.css" }] },
      { ...emptyAssets, css: [{ href: "/b.css" }, { href: "/shared.css" }] },
    ],
    clientAssets: {
      entry: "/entry.js",
      js: [],
      css: [{ href: "/c.css" }, { href: "/shared.css" }],
    },
  };
  const html = await renderPage(page(), { renderConfig: cfg });
  // Each unique href appears exactly once.
  for (const href of ["/a.css", "/b.css", "/c.css", "/shared.css"]) {
    const matches = html.match(new RegExp(`href="${href}"`, "g")) ?? [];
    assert.equal(matches.length, 1, `${href} should appear once`);
    assert.match(html, new RegExp(`<link rel="stylesheet" href="${href}"\\s*/?>`));
  }
});

test("renderPage injects the client entry script + modulepreloads", async () => {
  const cfg: RenderConfig = {
    dev: false,
    ssrAssets: [],
    clientAssets: {
      entry: "/assets/entry-abc.js",
      js: [{ href: "/assets/chunk-1.js" }, { href: "/assets/chunk-2.js" }],
      css: [],
    },
  };
  const html = await renderPage(page(), { renderConfig: cfg });
  assert.match(html, /<link rel="modulepreload" href="\/assets\/chunk-1\.js"\s*\/?>/);
  assert.match(html, /<link rel="modulepreload" href="\/assets\/chunk-2\.js"\s*\/?>/);
  assert.match(html, /<script type="module" src="\/assets\/entry-abc\.js">/);
});

test("renderPage does not double-render the page when the wrapper has children", async () => {
  const html = await renderPage(page());
  const matches = html.match(/<main>/g) ?? [];
  assert.equal(matches.length, 1);
});

test("renderPage accepts a custom app wrapper", async () => {
  const App = (props: { children: ComponentChildren }) =>
    h(
      "html",
      { lang: "en" },
      h("head", null, h("title", null, "Custom")),
      h("body", { class: "wrapped" }, props.children),
    );
  const cfg: RenderConfig = { dev: true, ssrAssets: [], clientAssets: null };
  const html = await renderPage(page(), { app: App, renderConfig: cfg });
  assert.match(html, /<html lang="en">/);
  assert.match(html, /<title>Custom<\/title>/);
  assert.match(html, /<body class="wrapped">/);
  // The vite client still lands inside the custom <head>.
  assert.match(html, /<script type="module">import "\/@vite\/client";<\/script><\/head>/);
});

test("renderPage resets the renderConfig after the render (no leakage)", async () => {
  const cfg: RenderConfig = {
    dev: true,
    ssrAssets: [{ ...emptyAssets, css: [{ href: "/leak.css" }] }],
    clientAssets: null,
  };
  await renderPage(page(), { renderConfig: cfg });
  const html = await renderPage(page());
  assert.doesNotMatch(html, /<script /);
  assert.doesNotMatch(html, /<link /);
});

test("DefaultApp renders the body around its children", async () => {
  const wrapped = h(DefaultApp, { children: h("span", null, "x") }) as VNode;
  assert.equal(wrapped.type, DefaultApp);
});

// ---------- island detection ----------

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

/** An islands map that resolves each specifier to a fixed client chunk URL. */
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

test("renderPage wraps a rendered island in a numbered marker and resolves its URL into the state", async () => {
  const Counter = island(
    { specifier: "islands/Counter.tsx", export: "Counter" },
    (props: { count: number }) => h("button", null, `Count: ${props.count}`),
  );
  const pageVNode = h("div", null, h(Counter, { count: 3 }));
  const html = await renderPage(pageVNode, {
    renderConfig: bootCfg({
      islands: islandsMap({
        "islands/Counter.tsx": "/assets/islands/Counter-abc.js",
      }),
    }),
  });

  // Numbered marker — no specifier/export embedded.
  assert.match(html, /<!--fresh-island:0-->/);
  assert.match(html, /<!--\/fresh-island-->/);
  // The island itself still rendered.
  assert.match(html, /<button>Count: 3<\/button>/);
  // State carries a `module` INDEX into the shared modules array + export
  // + props at the marker index. The URL lives only on the inline boot
  // script's static import, not on the wire.
  assert.deepEqual(readState(html), [
    {
      module: 0,
      export: "Counter",
      props: { count: 3 },
    },
  ]);
  // Both the island chunk and the boot chunk are imported by the
  // inline script (the boot chunk supplies the `boot` runtime;
  // `fresh/signals`/`fresh/events`/`@preact/signals` only show up
  // when needed). The island is module 0, boot is module 1.
  assert.deepEqual(readBootModuleUrls(html), ["/assets/islands/Counter-abc.js", "/assets/boot.js"]);
  // Inline script: static imports → const data = … → boot(data).
  assert.match(
    html,
    /<script type="module">import \{Counter as _0_0\} from "\/assets\/islands\/Counter-abc\.js";import \{boot as _1_0\} from "\/assets\/boot\.js";const data=\{islands:\[\{Component:_0_0,props:\{count:3\}\}\],signals:\[\],events:\[\]\};_1_0\(data\);<\/script>/,
  );
  // Island entry is modulepreloaded.
  assert.match(html, /<link rel="modulepreload" href="\/assets\/islands\/Counter-abc\.js">/);
});

test("island chunk graph (js deps) + css are preloaded/linked, deduped across instances", async () => {
  const A = island({ specifier: "islands/A.tsx", export: "A" }, (_p: Record<string, never>) =>
    h("i", null, "a"),
  );
  const map = new Map<string, () => Promise<ViteAssetsLike>>();
  map.set("islands/A.tsx", () =>
    Promise.resolve({
      entry: "/assets/A.js",
      js: [{ href: "/assets/shared.js" }],
      css: [{ href: "/assets/A.css" }],
    }),
  );
  const html = await renderPage(
    h("div", null, h(A, {}), h(A, {})), // two instances, one specifier
    { renderConfig: bootCfg({ islands: map }) },
  );
  // Entry + js dep preloaded exactly once each.
  for (const href of ["/assets/A.js", "/assets/shared.js"]) {
    const n = (html.match(new RegExp(`modulepreload" href="${href}"`, "g")) ?? []).length;
    assert.equal(n, 1, `${href} preloaded once`);
  }
  // Island CSS linked once.
  const cssN = (html.match(/stylesheet" href="\/assets\/A\.css"/g) ?? []).length;
  assert.equal(cssN, 1, "island css linked once");
});

test("default-export islands serialize `export` as null in the state", async () => {
  const Widget = island({ specifier: "islands/Widget.tsx", export: null }, () =>
    h("span", null, "w"),
  );
  const html = await renderPage(h("div", null, h(Widget, {})), {
    renderConfig: bootCfg({
      islands: islandsMap({ "islands/Widget.tsx": "/assets/Widget.js" }),
    }),
  });
  assert.match(html, /<!--fresh-island:0-->/);
  const state = readState(html) as Array<{ module: number; export: string | null; props: unknown }>;
  assert.deepEqual(state, [
    {
      module: 0,
      export: null,
      props: {},
    },
  ]);
  assert.deepEqual(readBootModuleUrls(html), ["/assets/Widget.js", "/assets/boot.js"]);
});

test("multiple islands get sequential markers + state entries", async () => {
  const A = island({ specifier: "islands/A.tsx", export: "A" }, (p: { n: number }) =>
    h("i", null, p.n),
  );
  const html = await renderPage(h("div", null, h(A, { n: 1 }), h(A, { n: 2 })), {
    renderConfig: bootCfg({
      islands: islandsMap({ "islands/A.tsx": "/assets/A.js" }),
    }),
  });
  assert.match(html, /<!--fresh-island:0-->/);
  assert.match(html, /<!--fresh-island:1-->/);
  // Both instances reuse the same module slot; props differ.
  assert.deepEqual(readState(html), [
    { module: 0, export: "A", props: { n: 1 } },
    { module: 0, export: "A", props: { n: 2 } },
  ]);
  // One shared chunk import for the deduped specifier.
  assert.deepEqual(readBootModuleUrls(html), ["/assets/A.js", "/assets/boot.js"]);
});

test("an island vnode `key` is encoded into its start marker", async () => {
  const Counter = island(
    { specifier: "islands/Counter.tsx", export: "Counter" },
    (p: { n: number }) => h("i", null, p.n),
  );
  const html = await renderPage(
    h("div", null, h(Counter, { n: 1, key: "cart" }), h(Counter, { n: 2 })),
    {
      renderConfig: bootCfg({
        islands: islandsMap({ "islands/Counter.tsx": "/assets/Counter.js" }),
      }),
    },
  );
  // Keyed marker carries the encoded key after a second colon; unkeyed
  // sibling keeps the existing two-segment shape.
  assert.match(html, /<!--fresh-island:0:cart-->/);
  assert.match(html, /<!--fresh-island:1-->/);
});

test("a non-string island key is stringified before encoding", async () => {
  const A = island({ specifier: "islands/A.tsx", export: "A" }, (_p: Record<string, never>) =>
    h("i", null, "a"),
  );
  const html = await renderPage(h("div", null, h(A, { key: 42 })), {
    renderConfig: bootCfg({ islands: islandsMap({ "islands/A.tsx": "/assets/A.js" }) }),
  });
  assert.match(html, /<!--fresh-island:0:42-->/);
});

test("island key characters that would collide with the delimiter are URL-encoded", async () => {
  const A = island({ specifier: "islands/A.tsx", export: "A" }, (_p: Record<string, never>) =>
    h("i", null, "a"),
  );
  const html = await renderPage(h("div", null, h(A, { key: "a:b c" })), {
    renderConfig: bootCfg({ islands: islandsMap({ "islands/A.tsx": "/assets/A.js" }) }),
  });
  // `:` → `%3A`, space → `%20`. The decoded key is what the client gets.
  assert.match(html, /<!--fresh-island:0:a%3Ab%20c-->/);
});

test("no island → no state script or boot script", async () => {
  const html = await renderPage(page(), {
    renderConfig: bootCfg({ islands: islandsMap({}) }),
  });
  assert.doesNotMatch(html, /__FRSH_STATE__/);
  assert.doesNotMatch(html, /\/assets\/boot\.js/);
});

test("island state escapes `<` to avoid premature </script>", async () => {
  const A = island({ specifier: "islands/A.tsx", export: "A" }, (_p: { html: string }) =>
    h("i", null, "x"),
  );
  const html = await renderPage(h("div", null, h(A, { html: "</script><script>alert(1)" })), {
    renderConfig: bootCfg({
      islands: islandsMap({ "islands/A.tsx": "/assets/A.js" }),
    }),
  });
  // The raw `</script>` must not appear inside the state script body.
  // devalue's stringify already escapes `<` to `<` (uppercase) so the
  // escape may come from either devalue or our trailing `<` replace.
  assert.match(html, /\\u003[Cc]\/script>/);
  assert.doesNotMatch(html, /<\/script><script>alert\(1\)/);
  // Round-trip via devalue restores the original payload faithfully.
  const state = readState(html) as Array<{ props: { html: string } }>;
  assert.equal(state[0].props.html, "</script><script>alert(1)");
});

test("island state preserves richer types — Date, Set, BigInt round-trip via devalue", async () => {
  const A = island(
    { specifier: "islands/A.tsx", export: "A" },
    (_p: { when: Date; tags: Set<string>; n: bigint; pattern: RegExp }) => h("i", null, "x"),
  );
  const when = new Date("2026-05-28T12:00:00.000Z");
  const tags = new Set(["alpha", "beta"]);
  const n = 12345678901234567890n;
  const pattern = /^fresh-island:(\d+)$/i;
  const html = await renderPage(h("div", null, h(A, { when, tags, n, pattern })), {
    renderConfig: bootCfg({
      islands: islandsMap({ "islands/A.tsx": "/assets/A.js" }),
    }),
  });
  const state = readState(html) as Array<{
    props: { when: Date; tags: Set<string>; n: bigint; pattern: RegExp };
  }>;
  const props = state[0].props;
  assert.ok(props.when instanceof Date);
  assert.equal(props.when.toISOString(), when.toISOString());
  assert.ok(props.tags instanceof Set);
  assert.deepEqual([...props.tags], ["alpha", "beta"]);
  assert.equal(typeof props.n, "bigint");
  assert.equal(props.n, n);
  assert.ok(props.pattern instanceof RegExp);
  assert.equal(props.pattern.source, pattern.source);
  assert.equal(props.pattern.flags, pattern.flags);
});

test("island state serializes signals via the Signal reducer (value on the wire, signal after revive)", async () => {
  const A = island(
    { specifier: "islands/A.tsx", export: "A" },
    (_p: { count: ReturnType<typeof signal> }) => h("i", null, "x"),
  );
  const count = signal(7);
  const html = await renderPage(h("div", null, h(A, { count })), {
    renderConfig: bootCfg({
      islands: islandsMap({ "islands/A.tsx": "/assets/A.js" }),
    }),
  });
  // Bind the boot chunk's `signal` import to preact's real `signal()`
  // so the eval'd `data.signals[0]` IS a working signal — same end
  // state as the SSR-emitted script would produce on the client.
  const state = readState(html, SIGNAL_OVERRIDE) as Array<{
    props: { count: ReturnType<typeof signal> };
  }>;

  assert.equal(
    state[0].props.count.brand,
    Symbol.for("preact-signals"),
    "revived prop is a real signal",
  );
  assert.equal(state[0].props.count.value, 7);
});

test("island state throws when a prop is a computed signal", async () => {
  const A = island({ specifier: "islands/A.tsx", export: "A" }, (_p: Record<string, unknown>) =>
    h("i", null, "x"),
  );
  const base = signal(3);
  const doubled = computed(() => base.value * 2);
  await assert.rejects(
    () =>
      renderPage(h("div", null, h(A, { doubled })), {
        renderConfig: bootCfg({
          islands: islandsMap({ "islands/A.tsx": "/assets/A.js" }),
        }),
      }),
    /Cannot serialize a computed signal/,
  );
});

test("serializable signal: factory + args ride the wire via FactoryFunction + SerializedFunction", async () => {
  const A = island({ specifier: "islands/A.tsx", export: "A" }, (_p: Record<string, unknown>) =>
    h("i", null, "x"),
  );
  // Mimic what a `makeComputed()` factory in an island module
  // produces: a wrapper function carrying `__FRESH_SERIALIZABLE_FUNCTION`,
  // and a signal it returned carrying `__FRESH_FROM_FACTORY = { factory:
  // wrapper, args }`.
  const base = signal(3);
  const doubledFactory = (b: Signal<number>) => computed(() => b.value * 2);
  (
    doubledFactory as unknown as { __FRESH_SERIALIZABLE_FUNCTION: unknown }
  ).__FRESH_SERIALIZABLE_FUNCTION = {
    specifier: "islands/utils.tsx",
    export: "doubled",
  };
  const doubled = doubledFactory(base) as unknown as {
    brand: symbol;
    value: number;
    __FRESH_FROM_FACTORY: { factory: unknown; args: unknown[] };
  };
  doubled.__FRESH_FROM_FACTORY = { factory: doubledFactory, args: [base] };

  const html = await renderPage(h("div", null, h(A, { doubled })), {
    renderConfig: bootCfg({
      islands: islandsMap({
        "islands/A.tsx": "/assets/A.js",
        "islands/utils.tsx": "/assets/utils.js",
      }),
    }),
  });

  // Three URLs imported by the boot script: the boot chunk (signal +
  // boot), the rendered island, and the factory's chunk.
  const urls = readBootModuleUrls(html);
  assert.ok(urls.includes("/assets/A.js"), "island A chunk imported");
  assert.ok(urls.includes("/assets/utils.js"), "factory chunk imported");

  // Override the factory chunk's `doubled` export with a real impl,
  // and the boot chunk's `signal` with the live preact-signals binding.
  // Result: the inline script's `(_..._)(_..._(3))` for `doubled` calls
  // `doubled(signal(3))` which is `computed(() => b.value * 2)`.
  const state = readState(html, {
    ...SIGNAL_OVERRIDE,
    "/assets/utils.js": {
      doubled: ((b) => computed(() => (b as Signal<number>).value * 2)) as (
        ...args: unknown[]
      ) => unknown,
    },
  }) as Array<{ props: { doubled: ReturnType<typeof computed> } }>;

  assert.equal(state[0].props.doubled.value, 6);
  assert.equal(state[0].props.doubled.brand, Symbol.for("preact-signals"));
});

test("serializable signal: throws when the factory specifier isn't in the islands map", async () => {
  const A = island({ specifier: "islands/A.tsx", export: "A" }, (_p: Record<string, unknown>) =>
    h("i", null, "x"),
  );
  const base = signal(3);
  const orphanFactory = (b: Signal<number>) => computed(() => b.value * 2);
  (
    orphanFactory as unknown as { __FRESH_SERIALIZABLE_FUNCTION: unknown }
  ).__FRESH_SERIALIZABLE_FUNCTION = {
    specifier: "islands/missing.tsx",
    export: "fn",
  };
  const orphan = orphanFactory(base) as unknown as {
    brand: symbol;
    value: number;
    __FRESH_FROM_FACTORY: { factory: unknown; args: unknown[] };
  };
  orphan.__FRESH_FROM_FACTORY = { factory: orphanFactory, args: [base] };

  await assert.rejects(
    () =>
      renderPage(h("div", null, h(A, { orphan })), {
        renderConfig: bootCfg({
          islands: islandsMap({ "islands/A.tsx": "/assets/A.js" }),
        }),
      }),
    /Cannot serialize specifier "islands\/missing\.tsx": no client chunk URL/,
  );
});

test("island detection state does not leak between renders", async () => {
  const A = island({ specifier: "islands/A.tsx", export: "A" }, (p: { n: number }) =>
    h("i", null, p.n),
  );
  const cfg = bootCfg({ islands: islandsMap({ "islands/A.tsx": "/a.js" }) });
  await renderPage(h("div", null, h(A, { n: 1 })), { renderConfig: cfg });
  // Second render has no islands → no stale state emitted.
  const html = await renderPage(page(), { renderConfig: cfg });
  assert.doesNotMatch(html, /__FRSH_STATE__/);
});

test("page with no islands / signals / events skips the boot script + preloads but still ships the boot CSS", async () => {
  // The boot chunk descriptor is fully populated (entry + chunked deps +
  // CSS). On a trivial page the inline boot <script>, the state JSON, and
  // the JS modulepreloads must all be omitted — there's nothing to
  // hydrate. The boot CSS is still injected so framework-shipped styles
  // are consistent across pages (no flash on the first interactive nav).
  const cfg = bootCfg({
    clientBootAssets: {
      entry: "/assets/fresh.boot.js",
      js: [{ href: "/assets/_chunks/runtime.js" }],
      css: [{ href: "/assets/fresh.boot.css" }],
    },
    islands: islandsMap({}),
  });
  const html = await renderPage(h("p", null, "static"), { renderConfig: cfg });
  // No state JSON, no inline boot script.
  assert.doesNotMatch(html, /__FRSH_STATE__/);
  assert.doesNotMatch(html, /bootFromDocument/);
  // No boot JS entry / chunk preloads.
  assert.doesNotMatch(html, /fresh\.boot\.js/);
  assert.doesNotMatch(html, /_chunks\/runtime\.js/);
  // CSS is always injected.
  assert.match(html, /<link rel="stylesheet" href="\/assets\/fresh\.boot\.css"\s*\/?>/);
});

// ---------- page-level signal children (`<p>{signal}</p>`) ----------

test("page-level signal child gets wrapped in numbered fresh-signal markers and serialized in state.signals", async () => {
  const s = signal("hello");
  const html = await renderPage(h("p", null, "value: ", s as unknown as ComponentChildren), {
    renderConfig: bootCfg({ islands: islandsMap({}) }),
  });
  // The signal's peeked value is sandwiched between markers.
  assert.match(html, /<!--fresh-signal:0-->hello<!--\/fresh-signal-->/);
  const state = readBootState(html, SIGNAL_OVERRIDE);
  assert.deepEqual(state.islands, []);
  assert.equal(state.signals.length, 1);
  const revived = state.signals[0] as ReturnType<typeof signal>;
  assert.equal(revived.brand, Symbol.for("preact-signals"));
  assert.equal(revived.value, "hello");
});

test("multiple page-level signal children get sequential indices", async () => {
  const a = signal(1);
  const b = signal(2);
  const html = await renderPage(
    h(
      "div",
      null,
      h("p", null, a as unknown as ComponentChildren),
      h("p", null, b as unknown as ComponentChildren),
    ),
    { renderConfig: bootCfg({ islands: islandsMap({}) }) },
  );
  assert.match(html, /<!--fresh-signal:0-->1<!--\/fresh-signal-->/);
  assert.match(html, /<!--fresh-signal:1-->2<!--\/fresh-signal-->/);
  const state = readBootState(html, SIGNAL_OVERRIDE);
  assert.equal(state.signals.length, 2);
});

test("signal children INSIDE an island are NOT wrapped (the island re-renders them on the client)", async () => {
  // Island whose own JSX renders `{props.value}` where `value` is a signal.
  // The page passes that signal as a prop; the wrapping must happen ONLY at
  // the page-level child slot (the island prop), not again inside the island.
  const A = island(
    { specifier: "islands/A.tsx", export: "A" },
    (p: { value: ReturnType<typeof signal> }) =>
      h("i", null, p.value as unknown as ComponentChildren),
  );
  const s = signal(42);
  const html = await renderPage(h("div", null, h(A, { value: s })), {
    renderConfig: bootCfg({
      islands: islandsMap({ "islands/A.tsx": "/a.js" }),
    }),
  });
  // Exactly one island marker pair.
  assert.match(html, /<!--fresh-island:0-->/);
  // No signal markers at all — the signal lives inside the island.
  assert.doesNotMatch(html, /fresh-signal:/);
  const state = readBootState(html, SIGNAL_OVERRIDE);
  assert.equal(state.signals.length, 0);
  assert.equal(state.islands.length, 1);
});

test("a signal shared between an island prop and a page-level child is deduped on the wire", async () => {
  // devalue's reference graph reuses the same wire slot for both the prop
  // and the page-level child; after revival both point at the same signal,
  // so updates flow through both subscribers.
  const A = island(
    { specifier: "islands/A.tsx", export: "A" },
    (_p: { count: ReturnType<typeof signal> }) => h("i", null, "x"),
  );
  const s = signal(7);
  const html = await renderPage(
    h("div", null, h(A, { count: s }), h("p", null, s as unknown as ComponentChildren)),
    {
      renderConfig: bootCfg({
        islands: islandsMap({ "islands/A.tsx": "/a.js" }),
      }),
    },
  );
  assert.match(html, /<!--fresh-signal:0-->7<!--\/fresh-signal-->/);
  const state = readBootState(html, SIGNAL_OVERRIDE) as {
    islands: Array<{ props: { count: ReturnType<typeof signal> } }>;
    signals: Array<ReturnType<typeof signal>>;
  };
  // devalue reuses references → it's literally the same revived signal.
  assert.equal(state.signals[0], state.islands[0].props.count);
  // And it carries the original value.
  assert.equal(state.signals[0].value, 7);
});

test("page-level {signal} state does not leak between renders", async () => {
  const cfg = bootCfg({ islands: islandsMap({}) });
  const s = signal("first");
  await renderPage(h("p", null, s as unknown as ComponentChildren), { renderConfig: cfg });
  // Second render has no signals → no stale state emitted.
  const html = await renderPage(page(), { renderConfig: cfg });
  assert.doesNotMatch(html, /__FRSH_STATE__/);
  assert.doesNotMatch(html, /fresh-signal:/);
});

// ---------- page-level signal-as-prop bindings (`<input value={signal} />`) ----------

test("a signal passed as a prop on a page-level element renders peeked value + an f-s binding marker", async () => {
  const value = signal("hello");
  const html = await renderPage(
    h("input", { value, disabled: true } as unknown as Record<string, unknown>),
    { renderConfig: bootCfg({ islands: islandsMap({}) }) },
  );
  // SSR shows the peeked value as the input's attribute.
  assert.match(html, /<input/);
  assert.match(html, /value="hello"/);
  // Static props ride along untouched.
  assert.match(html, /disabled/);
  // `f-s` carries a JSON map of `{propName: signalIndex}` so the client
  // boot can re-attach each signal to its DOM property.
  assert.match(html, /f-s="\{&quot;value&quot;:0\}"/);
  const state = readBootState(html, SIGNAL_OVERRIDE);
  assert.equal(state.signals.length, 1);
  const revived = state.signals[0] as ReturnType<typeof signal>;
  assert.equal(revived.value, "hello");
});

test("multiple signal-valued props on one element accumulate into one `f-s` map with sequential indices", async () => {
  const v = signal(3);
  const dis = signal(false);
  const html = await renderPage(
    h("input", { value: v, disabled: dis } as unknown as Record<string, unknown>),
    { renderConfig: bootCfg({ islands: islandsMap({}) }) },
  );
  // Both props get peek'd into the SSR output.
  assert.match(html, /value="3"/);
  // `disabled=false` is omitted by preact-render-to-string (matches Preact's
  // diff-time setProperty: `false` on non-aria attrs → removeAttribute). We
  // assert the absence of a real `disabled` attribute (not the string
  // inside the f-s JSON, which contains `disabled` as a key).
  assert.doesNotMatch(html, /\sdisabled[\s/=>]/);
  // One f-s attribute carrying BOTH bindings.
  assert.match(html, /f-s="\{&quot;value&quot;:0,&quot;disabled&quot;:1\}"/);
  const state = readBootState(html, SIGNAL_OVERRIDE);
  assert.equal(state.signals.length, 2);
});

test("signal-valued props INSIDE an island do NOT emit `f-s` markers (the island handles them via preact-signals on the client)", async () => {
  const A = island(
    { specifier: "islands/A.tsx", export: "A" },
    (p: { value: ReturnType<typeof signal> }) =>
      h("input", { value: p.value } as unknown as Record<string, unknown>),
  );
  const s = signal(42);
  const html = await renderPage(h("div", null, h(A, { value: s })), {
    renderConfig: bootCfg({
      islands: islandsMap({ "islands/A.tsx": "/a.js" }),
    }),
  });
  // The island rendered, but no f-s attribute on its inner <input>.
  assert.match(html, /<!--fresh-island:0-->/);
  assert.match(html, /value="42"/);
  assert.doesNotMatch(html, /f-s=/);
  // Only the island instance is in the state — the signal lives inside it.
  const state = readBootState(html, SIGNAL_OVERRIDE);
  assert.equal(state.signals.length, 0);
  assert.equal(state.islands.length, 1);
});

// ---------- island slots (JSX props) ----------

test("a VNode passed as a direct island prop serializes as a slot, bracketed by markers", async () => {
  const Host = island({ specifier: "islands/Host.tsx", export: "Host" }, (p: { part: VNode }) =>
    h("div", null, p.part),
  );
  const html = await renderPage(h("div", null, h(Host, { part: h("h1", null, "hi") })), {
    renderConfig: bootCfg({ islands: islandsMap({ "islands/Host.tsx": "/host.js" }) }),
  });
  // Rendered inline, bracketed by a slot marker, and serialized as `slot(...)`.
  assert.match(html, /<!--fresh-slot:0--><h1>hi<\/h1><!--\/fresh-slot-->/);
  assert.match(html, /\bslot as _\d+_\d+\b/);
});

test("a `{signal}` in a slot surfaced while rendering another templated slot is still serialized", async () => {
  // Outer doesn't render its slot → templated. Its slot content is Inner, which
  // also doesn't render ITS slot → templated. Rendering Outer's template
  // surfaces Inner's slot only after the initial slot count, so it must be
  // rendered (with hooks) BEFORE serialization — otherwise the deep signal is
  // lost to a post-serialization static render.
  const Inner = island({ specifier: "islands/Inner.tsx", export: "Inner" }, () =>
    h("span", null, "inner"),
  );
  const Outer = island({ specifier: "islands/Outer.tsx", export: "Outer" }, () =>
    h("div", null, "outer"),
  );
  const s = signal("deep");
  const html = await renderPage(
    h(
      "div",
      null,
      h(Outer, { slot: h(Inner, { slot: h("p", null, s as unknown as ComponentChildren) }) }),
    ),
    {
      renderConfig: bootCfg({
        islands: islandsMap({ "islands/Outer.tsx": "/o.js", "islands/Inner.tsx": "/i.js" }),
      }),
    },
  );
  // The deep signal got a marker in its template…
  assert.match(html, /<template data-fresh-slot="1">[\s\S]*fresh-signal:0[\s\S]*<\/template>/);
  // …and rode the serialized payload (Inner is the 2nd island, the signal is there).
  const state = readBootState(html, SIGNAL_OVERRIDE);
  assert.equal(state.signals.length, 1);
  assert.equal(state.islands.length, 2);
});

test("a VNode buried in a non-VNode island prop (object) errors at serialize time", async () => {
  const Host = island(
    { specifier: "islands/Host.tsx", export: "Host" },
    (p: { foo: { part: VNode } }) => h("div", null, p.foo.part),
  );
  const pageVNode = h("div", null, h(Host, { foo: { part: h("h1", null, "hi") } }));
  await assert.rejects(
    renderPage(pageVNode, {
      renderConfig: bootCfg({ islands: islandsMap({ "islands/Host.tsx": "/host.js" }) }),
    }),
    /JSX nested inside a non-VNode island prop/,
  );
});

test("signal-prop bindings deduplicate with signal children via devalue references", async () => {
  // The same signal feeds both `<input value={s}>` and `<p>{s}</p>`. The
  // bind path pushes it once; the child-wrap path pushes it again. devalue's
  // reference graph collapses both to one wire slot — verified by the
  // revived array entries pointing at the same identity.
  const s = signal("shared");
  const html = await renderPage(
    h(
      "div",
      null,
      h("input", { value: s } as unknown as Record<string, unknown>),
      h("p", null, s as unknown as ComponentChildren),
    ),
    { renderConfig: bootCfg({ islands: islandsMap({}) }) },
  );
  // Both ride: f-s binding for the input + fresh-signal markers for the <p>.
  assert.match(html, /f-s=/);
  assert.match(html, /<!--fresh-signal:/);
  const state = readBootState(html, SIGNAL_OVERRIDE);
  // The f-s binding sits at signals[0]; the child-wrap pushes the same
  // signal again at signals[1]. Both array slots point at the same revived
  // signal because devalue dedupes by reference identity.
  assert.equal(state.signals.length, 2);
  assert.equal(state.signals[0], state.signals[1]);
});

// ---------- page-level event handlers via `fresh/events` factories ----------

/**
 * Build a fake factory-stamped handler — same shape as anything coming
 * out of `fresh/events`'s `factory(...)` wrappers. The returned function
 * carries `__FRESH_FROM_FACTORY`; the `factory` it points at is itself a
 * `__FRESH_SERIALIZABLE_FUNCTION`-stamped wrapper. Together they route
 * through devalue's FactoryFunction → SerializedFunction chain.
 */
function fakeHandler(
  exportName: string,
  args: unknown[],
  body: () => void = () => {},
): { handler: (e: Event) => void; factory: (...a: unknown[]) => unknown } {
  const factoryFn = (..._args: unknown[]) => body;
  (
    factoryFn as unknown as { __FRESH_SERIALIZABLE_FUNCTION: unknown }
  ).__FRESH_SERIALIZABLE_FUNCTION = {
    specifier: "islands/handlers.tsx",
    export: exportName,
  };
  const handler = body as unknown as {
    __FRESH_FROM_FACTORY: { factory: unknown; args: unknown[] };
  };
  handler.__FRESH_FROM_FACTORY = { factory: factoryFn, args };
  return { handler: body, factory: factoryFn };
}

const handlerIslands = () => islandsMap({ "islands/handlers.tsx": "/assets/handlers.js" });

test("a factory-marked event handler at the page level emits an `f-eh` index into state.events; the handler rides through devalue as a FactoryFunction", async () => {
  const count = signal(0);
  const { handler } = fakeHandler("setFromProp", [count, "value"]);

  const html = await renderPage(
    h("input", { value: count, onInput: handler } as unknown as Record<string, unknown>),
    { renderConfig: bootCfg({ islands: handlerIslands() }) },
  );

  assert.match(html, /value="0"/);
  assert.match(html, /f-s="\{&quot;value&quot;:0\}"/);
  assert.match(html, /f-eh="0"/);

  // Each event-group entry is `{event, handler}`. The handler is the
  // result of calling the factory alias with the marked args; we stub
  // the framework factory to return a sentinel string so we can assert
  // it landed on `state.events[0][0].handler` directly.
  const state = readBootState(html, {
    ...SIGNAL_OVERRIDE,
    "/assets/handlers.js": {
      setFromProp: () => "revived-handler",
    },
  });
  assert.equal(state.events.length, 1);
  const group = state.events[0] as Array<{ event: string; handler: unknown }>;
  assert.equal(group.length, 1);
  assert.equal(group[0].event, "onInput");
  assert.equal(group[0].handler, "revived-handler");
});

test("FactoryFunction args carry devalue-rich values (Date) through state.events", async () => {
  // Date round-trips through devalue — proving the handler's args get
  // the full devalue type set, not just JSON.
  const when = signal(new Date("2026-01-01T00:00:00.000Z"));
  const target = new Date("2026-12-31T00:00:00.000Z");
  const { handler } = fakeHandler("setValue", [when, target]);
  const html = await renderPage(
    h("button", { onClick: handler } as unknown as Record<string, unknown>, "Reset"),
    { renderConfig: bootCfg({ islands: handlerIslands() }) },
  );
  assert.match(html, /f-eh="0"/);
  let observedArgs: unknown[] = [];
  readBootState(html, {
    ...SIGNAL_OVERRIDE,
    "/assets/handlers.js": {
      setValue: (...args) => {
        observedArgs = args;
        return null;
      },
    },
  });
  // args === [signal, Date] — the Date survived devalue end to end.
  assert.equal(observedArgs.length, 2);
  assert.ok(observedArgs[1] instanceof Date);
  assert.equal((observedArgs[1] as Date).toISOString(), "2026-12-31T00:00:00.000Z");
});

test("multiple handlers on one element fold into one `f-eh` group with their event names preserved", async () => {
  const v = signal("hello");
  const fromProp = fakeHandler("setFromProp", [v, "value"]).handler;
  const setEmpty = fakeHandler("setValue", [v, ""]).handler;

  const html = await renderPage(
    h("input", {
      onInput: fromProp,
      onChange: setEmpty,
    } as unknown as Record<string, unknown>),
    { renderConfig: bootCfg({ islands: handlerIslands() }) },
  );
  assert.match(html, /f-eh="0"/);
  const state = readBootState(html, {
    ...SIGNAL_OVERRIDE,
    "/assets/handlers.js": {
      setFromProp: () => null,
      setValue: () => null,
    },
  });
  // ONE entry in state.events; that entry carries both handlers, each
  // tagged with its own `event` field.
  assert.equal(state.events.length, 1);
  const group = state.events[0] as Array<{ event: string }>;
  assert.equal(group.length, 2);
  assert.deepEqual(group.map((g) => g.event).sort(), ["onChange", "onInput"]);
});

test("an UNMARKED function event handler at the page level throws a clear error", async () => {
  const handler = () => {};
  await assert.rejects(
    () =>
      renderPage(h("button", { onClick: handler } as unknown as Record<string, unknown>, "click"), {
        renderConfig: bootCfg({ islands: islandsMap({}) }),
      }),
    /Cannot server-render a function event handler for `onClick` on a `button` element/,
  );
});

test("the thrown error's stack points at the offending JSX call site, not at the diff hook", async () => {
  // The creation-time hook stashes an Error on the vnode, and the diff
  // hook re-throws that same Error with the helpful message — so the
  // captured stack frames lead the developer to the user-authored JSX,
  // not to preact-render-to-string's internals. We assert it on a
  // labeled helper so the frame name is searchable.
  function createOffendingButton() {
    return h("button", { onClick: () => {} } as unknown as Record<string, unknown>, "click");
  }
  let err: Error | null = null;
  try {
    await renderPage(createOffendingButton(), {
      renderConfig: bootCfg({ islands: islandsMap({}) }),
    });
  } catch (e) {
    err = e as Error;
  }
  assert.ok(err, "renderPage should throw");
  assert.match(err!.message, /Cannot server-render a function event handler/);
  assert.ok(err!.stack, "error has a .stack");
  // The captured creation-site stack includes the helper that built the
  // offending vnode. preact-render-to-string frames may also be present,
  // but the user frame is what matters here.
  assert.match(err!.stack!, /createOffendingButton/);
});

test("an unmarked function event handler INSIDE an island does NOT throw (the island hydrates its own listeners)", async () => {
  const A = island({ specifier: "islands/A.tsx", export: "A" }, () =>
    h("button", { onClick: () => {} } as unknown as Record<string, unknown>, "click me"),
  );
  // No throw expected.
  const html = await renderPage(h("div", null, h(A, {})), {
    renderConfig: bootCfg({
      islands: islandsMap({ "islands/A.tsx": "/a.js" }),
    }),
  });
  assert.match(html, /<button>click me<\/button>/);
  assert.doesNotMatch(html, /f-e=/);
});

test("an island-exported function used as an event handler at the page level is accepted — `__FRESH_SERIALIZABLE_FUNCTION` alone is enough (no factory wrapper needed)", async () => {
  // Regression: the page-level event check used to require
  // `__FRESH_FROM_FACTORY`, which a bare island-file export does NOT have.
  // Such functions are still fully serializable (the island transform
  // stamps `__FRESH_SERIALIZABLE_FUNCTION` on them, devalue routes them
  // through the SerializedFunction reducer).
  const onClick = () => {};
  (onClick as unknown as { __FRESH_SERIALIZABLE_FUNCTION: unknown }).__FRESH_SERIALIZABLE_FUNCTION =
    {
      specifier: "islands/double.tsx",
      export: "onClick",
    };

  const html = await renderPage(
    h("button", { onClick } as unknown as Record<string, unknown>, "go"),
    {
      renderConfig: bootCfg({
        islands: islandsMap({ "islands/double.tsx": "/assets/double.js" }),
      }),
    },
  );
  // The handler made it onto the wire as a serializable event binding.
  assert.match(html, /f-eh="0"/);
  assert.match(html, /<button[^>]*>go<\/button>/);
});

test("an unmarked function event handler inside a NESTED component inside an island does NOT throw — the owner-chain walk catches indirection", async () => {
  // The button is rendered by `Button`, which is rendered by `A` (the
  // island). The island wrapper's synchronous originalType call has long
  // since returned by the time preact actually invokes `Button` and
  // creates the `<button>` vnode — so a depth-counter approach would miss
  // it. The owner-chain walk (matching Fresh 2) keeps the inside-island
  // classification correct through arbitrary component nesting.
  function Button(props: { onClick: () => void; children: string }) {
    return h(
      "button",
      { onClick: props.onClick } as unknown as Record<string, unknown>,
      props.children,
    );
  }
  const A = island({ specifier: "islands/A.tsx", export: "A" }, () =>
    h(Button, { onClick: () => {}, children: "nested click" }),
  );
  const html = await renderPage(h("div", null, h(A, {})), {
    renderConfig: bootCfg({
      islands: islandsMap({ "islands/A.tsx": "/a.js" }),
    }),
  });
  assert.match(html, /<button>nested click<\/button>/);
  assert.doesNotMatch(html, /f-e=/);
});

// ---------- <Head> ----------

test("<Head><title> hoists into the document <head> and appears nowhere else", async () => {
  const html = await renderPage(
    h("main", null, h(Head, null, h("title", null, "About")), h("p", null, "body")),
  );
  // Default shell's <head>...</head> contains the collected <title>.
  assert.match(html, /<head>[\s\S]*<title>About<\/title>[\s\S]*<\/head>/);
  // The <title> doesn't leak into <body>.
  assert.doesNotMatch(html, /<body>[\s\S]*<title>/);
});

test("<Head><title> in the page replaces a <title> sitting in the app shell", async () => {
  const Shell = (props: { children: ComponentChildren }) =>
    h(
      "html",
      null,
      h("head", null, h("title", null, "Shell Default")),
      h("body", null, props.children),
    );
  const html = await renderPage(h(Head, null, h("title", null, "Page Title")), {
    app: Shell,
  });
  // Exactly one <title> in the output, and it's the page-provided one.
  const titles = [...html.matchAll(/<title>([^<]*)<\/title>/g)].map((m) => m[1]);
  assert.deepEqual(titles, ["Page Title"]);
});

test("multiple <title>s in <Head> blocks: last write wins", async () => {
  const html = await renderPage(
    h(
      "main",
      null,
      h(Head, null, h("title", null, "First")),
      h(Head, null, h("title", null, "Second")),
      h(Head, null, h("title", null, "Third")),
    ),
  );
  const titles = [...html.matchAll(/<title>([^<]*)<\/title>/g)].map((m) => m[1]);
  assert.deepEqual(titles, ["Third"]);
});

test("<meta name> dedupes by name; same name → last value wins", async () => {
  const html = await renderPage(
    h(
      "main",
      null,
      h(
        Head,
        null,
        h("meta", { name: "description", content: "first" }),
        h("meta", { name: "description", content: "second" }),
      ),
    ),
  );
  const descs = [...html.matchAll(/<meta name="description" content="([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(descs, ["second"]);
});

test("singleton <link rel> (canonical) dedupes; non-singleton (stylesheet) does not", async () => {
  const html = await renderPage(
    h(
      "main",
      null,
      h(
        Head,
        null,
        h("link", { rel: "canonical", href: "/first" }),
        h("link", { rel: "canonical", href: "/second" }),
        h("link", { rel: "stylesheet", href: "/a.css" }),
        h("link", { rel: "stylesheet", href: "/b.css" }),
      ),
    ),
  );
  // Canonical: only one (the last).
  const canonical = [...html.matchAll(/<link rel="canonical" href="([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(canonical, ["/second"]);
  // Stylesheets: both present.
  assert.match(html, /<link rel="stylesheet" href="\/a\.css"/);
  assert.match(html, /<link rel="stylesheet" href="\/b\.css"/);
});

test("`key` prop drives dedup before other heuristics", async () => {
  const html = await renderPage(
    h(
      "main",
      null,
      h(
        Head,
        null,
        // Different meta names but same key — should collapse to one.
        h("meta", { key: "social", name: "twitter:card", content: "summary" }),
        h("meta", { key: "social", name: "og:type", content: "article" }),
      ),
    ),
  );
  const metas = [...html.matchAll(/<meta[^>]*>/g)];
  // Just the framework-injected charset/viewport + the one keyed meta.
  // Filter to the dedup-eligible name attrs we care about:
  const named = metas.map((m) => m[0]).filter((s) => /name="(og:|twitter:)/.test(s));
  assert.equal(named.length, 1);
  assert.match(named[0], /name="og:type"/);
});

test("`id` prop drives dedup when no `key`", async () => {
  const html = await renderPage(
    h(
      "main",
      null,
      h(
        Head,
        null,
        h("style", { id: "theme" }, "body { color: red; }"),
        h("style", { id: "theme" }, "body { color: blue; }"),
      ),
    ),
  );
  const styles = [...html.matchAll(/<style id="theme">([^<]*)<\/style>/g)].map((m) => m[1]);
  assert.deepEqual(styles, ["body { color: blue; }"]);
});

test("<Head>-collected items render at the END of <head> (after framework asset injections)", async () => {
  const cfg: RenderConfig = {
    dev: false,
    ssrAssets: [{ entry: undefined, js: [], css: [{ href: "/framework.css" }] }],
    clientAssets: null,
  };
  const html = await renderPage(h(Head, null, h("link", { rel: "canonical", href: "/page" })), {
    renderConfig: cfg,
  });
  // Framework stylesheet comes BEFORE the user's canonical link.
  const fwIdx = html.indexOf("/framework.css");
  const userIdx = html.indexOf("/page");
  assert.ok(fwIdx > 0 && userIdx > fwIdx, "framework asset precedes <Head> entries");
});

test("no <Head> on the page → nothing extra is injected into <head>", async () => {
  const html = await renderPage(h("p", null, "static"));
  // Sanity: only the default shell's charset/viewport metas.
  const metas = [...html.matchAll(/<meta[^>]*>/g)];
  assert.equal(metas.length, 2);
  assert.doesNotMatch(html, /<title>/);
});

test("head state doesn't leak between renders", async () => {
  await renderPage(h(Head, null, h("title", null, "Render A")));
  const html = await renderPage(h("p", null, "no head"));
  assert.doesNotMatch(html, /Render A/);
});
