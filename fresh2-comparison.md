# Fresh 2 vs Fresh 3 — Feature Comparison

A side-by-side of the public API surface and runtime features of **Fresh 2** (per the canary docs at [fresh.deno.dev](https://fresh.deno.dev/)) against **this repository (Fresh 3)** as of 2026-06-02.

Sources: Fresh 2 docs (introduction, concepts, advanced, plugins, deployment). Fresh 3 state: [PRD.md](PRD.md) (2026-06-02 snapshot, 206 passing tests), [FEATURES.md](FEATURES.md), [TODO.md](TODO.md), [docs/](docs/), and the source tree.

---

## TL;DR

Fresh 3 is a **ground-up rewrite on Vite 8 + Nitro 3** with a much smaller, more typed core. Routing, islands, layouts, `_app`, `_error`, middleware, signal serialization, dev HMR, and a brand-new **page-level reactivity layer** (signals as text / signals as DOM props / serializable event handlers, all outside islands) are in place. The big gaps versus Fresh 2 are:

1. **No programmatic `App` builder** — Fresh 3 is plugin-only; Fresh 2 also exposes `new App().use().get()…`.
2. **`<Partial>` / `f-client-nav` client-side navigation is implemented** (Navigation-API based; see §8) — remaining gaps are view transitions, `_freshIndicator` loading states, the `f-partial` fetch-URL override, and active-link marking.
3. **No async server components**, no streaming SSR, no Suspense (PRD gap #5).
4. **No `static/` directory, no `asset()` / `assetSrcSet()` helper** — Fresh 3 leans entirely on Vite's asset pipeline.
5. **No built-in plugins/middleware library** (`cors`, `csrf`, `csp`, `ipFilter`, `trailingSlashes`).
6. **No `define` namespaced helpers** (`define.page`, `define.handlers`, `define.middleware`) — Fresh 3 instead generates a per-route `$<file>.ts` with typed `handler`/`page` identities. Functionally equivalent, different import shape.
7. **No WebSocket helpers, no OpenTelemetry integration, no `IS_BROWSER` constant**.
8. **No JSX-as-island-prop** (PRD gap #1) and **no built-in `<If>` / `<Each>` islands** (PRD gap #3).
9. **Middleware arrays not allowed in `_middleware.tsx`** — Fresh 2 accepts both a single function and an array.

Conversely, Fresh 3 ships **several capabilities Fresh 2 doesn't**:

- **Page-level reactivity outside islands.** Signals can be rendered as text (`<p>Count: {countSig}</p>`), bound to DOM props (`<input value={sig} />`), and updated from events (`<input onInput={setFromProp(sig, "value")} />`) — all from inside a regular route page, no island wrapper. Fresh 2 requires an island for any of this.
- **Serializable functions and factories.** A `factory(...)` primitive from `fresh/serializable`, framework-shipped factories (`makeComputed`, `equals` / `test` / `and` / `or` / `not` from `fresh/signals`; `setFromProp` / `setValue` / `add` / `toggle` from `fresh/events`), and any function exported from `islands/**` is a serializable function the server can ship to the client via three custom devalue tags (`Signal`, `SerializedFunction`, `FactoryFunction`).
- **`makeComputed` computed signals serialize end-to-end.** Plain `computed(...)` still doesn't, but `makeComputed(fn)` packages the derivation so it round-trips and stays reactive on the client. Fresh 2 doesn't have an equivalent.
- Multi-runtime deploy (Node, Cloudflare Workers, etc.) through Nitro presets — Fresh 2 is Deno-first.
- A **pre-compiled router** (`rou3.compileRouterToString`) — zero runtime construction.
- Per-route generated typing helpers with strict middleware-state inheritance (`OwnS extends ParentS`).
- A **smart-reload watcher** that distinguishes island-only edits from server-touching edits via the SSR module graph — full reloads only when the change crosses a server-render boundary.
- A `?assets=ssr` / `?assets=client` powered three-env Vite architecture.
- **Owner-chain inside-island detection** for correctly classifying intrinsic elements rendered by component-wrappers inside islands.
- **No-dynamic-import hydration path** — the SSR-emitted boot script does static `import * as _m<i>` of every chunk and synchronously hands them to `bootFromDocument`.
- 206-test suite over plain `node --test`.

---

## Detailed comparison

### 1. App composition / entry

| Capability | Fresh 2 | Fresh 3 | Gap |
| --- | --- | --- | --- |
| File-based routing under `routes/**` | ✅ | ✅ | — |
| Plugin-style entry (`fresh()` in `vite.config.ts`) | ✅ | ✅ | — |
| Programmatic `new App()` builder | ✅ | ❌ | **Missing**: `.use`, `.get`, `.post`, `.put`, `.delete`, `.head`, `.all`, `.fsRoute`, `.route`, `.layout`, `.appWrapper`, `.onError`, `.notFound`, `.mountApp`, `.handler()`, `.listen()` |
| `basePath` / `trustProxy` config | ✅ | ❌ | **Missing** |
| Sub-app mounting (`mountApp`) | ✅ | ❌ | **Missing** |

### 2. Routing

| Capability | Fresh 2 | Fresh 3 | Gap |
| --- | --- | --- | --- |
| Static segments, dynamic `[slug]`, index files | ✅ | ✅ | — |
| Route groups `(folder)` | ✅ | ✅ | — |
| Named catch-all `[...name]` → `params.name` | ✅ | ✅ (maps to rou3 `/:name*`) | — (was a gap; closed in the latest PRD) |
| Trailing-slash normalization | ✅ (also `trailingSlashes` plugin for forcing) | ✅ (rou3 handles) | **Missing**: configurable enforcement |
| `HEAD` falls back to `GET` | ✅ | ✅ | — |
| Method-map handlers + unknown-method 405 | ✅ | ✅ | — |
| Auto-GET when only `page` exported | ✅ | ✅ | — |

### 3. Handlers, context, middleware

| Capability | Fresh 2 | Fresh 3 | Gap |
| --- | --- | --- | --- |
| `ctx.req`, `ctx.url`, `ctx.params`, `ctx.state` | ✅ | ✅ | — |
| `ctx.next()` chain | ✅ (state merges into `ctx.state`) | ✅ (entire new state passed; no merge) | Semantic difference — Fresh 3 is stricter, may need shim if porting |
| `ctx.redirect(path, status?)` | ✅ | ✅ (also collapses `//evil.com` → `/`) | — |
| `ctx.render(data)` style | ✅ | ❌ (return `{ data, … }` instead) | API shape differs; functionally equivalent |
| `ctx.info` (Deno's `ServeHandlerInfo`) | ✅ | ❌ | **Missing**: no remote-address surface |
| `_middleware.ts` accepts an **array** | ✅ | ❌ (single function only) | **Missing**: array form |
| Typed state propagation | ✅ (loose) | ✅ (strict, `OwnS extends ParentS`) | Fresh 3 ahead |

### 4. Layouts, `_app`, `_error`

| Capability | Fresh 2 | Fresh 3 | Gap |
| --- | --- | --- | --- |
| `_layout.tsx` per folder | ✅ | ✅ | — |
| `_app.tsx` shell | ✅ | ✅ | — |
| `_error.tsx` for 404 / 405 / thrown errors | ✅ | ✅ | — |
| `HttpError` / `NotFoundError` classes | ✅ | ✅ (plus `MethodNotAllowedError`) | Fresh 3 ahead |
| Dedicated `ErrorHandler<Params, State>` typing (method-map + single-function forms) | (n/a) | ✅ | Fresh 3 ahead — fixed in the latest PRD |
| `ctx.error` typing as union of every middleware's `State` | (partial) | ✅ | Fresh 3 ahead |

### 5. Pages & data fetching

| Capability | Fresh 2 | Fresh 3 | Gap |
| --- | --- | --- | --- |
| Sync page component | ✅ | ✅ | — |
| **Async page component** (data fetching inside the component) | ✅ | ❌ | **Missing** — Preact `renderToString` is sync; Fresh 3 has no async render |
| Streaming SSR / `<Suspense>` | ✅ | ❌ | **Missing** (PRD gap #6) |
| `define.page` / `define.handlers` / `define.middleware` helpers | ✅ | ❌ — replaced by per-route generated `$<file>.ts` `handler` / `page` | API surface difference |

### 6. Islands

| Capability | Fresh 2 | Fresh 3 | Gap |
| --- | --- | --- | --- |
| Auto-discovery `islands/**` | ✅ | ✅ (plus `routes/**/_islands/**`) | Fresh 3 adds co-location |
| PascalCase **and** kebab-case filenames | ✅ | unverified | Confirm naming policy |
| SSR + hydrate | ✅ (`hydrate`) | ⚠ uses `render`, not `hydrate` | **Gap** — PRD gap #3 |
| Nested islands | ✅ | ✅ (outermost-only hydration) | — |
| Owner-chain inside-island detection (intrinsic rendered by wrapper inside island) | ⚠ (hasIslandOwner) | ✅ | Fresh 3 explicitly walks the owner stack via `__r`/`diffed` hooks |
| Serializable prop types: `Date`, `Map`, `Set`, `RegExp`, `BigInt`, cyclic | ✅ | ✅ (devalue) | — |
| `URL` and `Temporal` as island props | ✅ | ⚠ (devalue defaults — `URL`/`Temporal` need explicit reducers) | **Gap** — verify/add reducers |
| Plain **signals** as props | ✅ | ✅ | — |
| **`makeComputed` computed signals** as props | ❌ (Fresh 2 has no equivalent) | ✅ (via `FactoryFunction` round-trip) | Fresh 3 ahead |
| Plain `computed(...)` as props | ❌ | ❌ — `stringify` throws | Parity (both reject) |
| **Functions exported from `islands/`** as props (`SerializedFunction` tag) | ❌ (Fresh 2 forbids functions) | ✅ | Fresh 3 ahead |
| Values from custom `factory(...)` wrappers | ❌ | ✅ (via `FactoryFunction` tag, recursive) | Fresh 3 ahead |
| JSX / children as island props | ✅ (slot reviver, template-element approach) | ❌ | **Missing** (PRD gap #1) |
| `IS_BROWSER` constant from `fresh/runtime` | ✅ | ❌ | **Missing** |
| Built-in `<If>` / `<Each>` islands | ✅ | ❌ | **Missing** (PRD gap #4) |
| Form-element signal binding (`<input value={sig} onInput={…} />`) | ✅ (inside an island) | ✅ (**inside or outside** an island — see §7) | Fresh 3 ahead |

### 7. Page-level reactivity (Fresh 3 only)

Fresh 3 introduces an entire mechanism with **no Fresh 2 analog**. Inside a regular route page (not an island), the renderer recognises three shapes:

| Shape | SSR wire | Hydration |
| --- | --- | --- |
| Signal-as-text child `<p>Count: {sig}</p>` | `<!--fresh-signal:N-->value<!--/fresh-signal-->` markers around the peeked value | Replaces the text node; subscribes to live signal |
| Signal-as-prop `<input value={sig} />` | A single `f-s='{"value":<idx>}'` attribute mapping prop names to state-array indices | Subscribes each signal; uses a port of Preact's `setProperty` (null/false removal, aria-\* carve-out, style diff, SVG normalisation) |
| Serializable event handler `onInput={setFromProp(sig, "value")}` or `onClick={importedFromIsland}` | A single `f-eh="<idx>"` attribute; `state.events[idx]` holds `[{event: "onInput", handler}, …]` | `addEventListener(name.replace(/^on/, "").toLowerCase(), handler)` after revival |

Plain closures like `onClick={() => sig.value++}` in route code throw a clear server-render-time error pointing at the JSX call site.

Framework-shipped factories (all stamped against the bare specifier so they ship as one chunk per package):

- **`fresh/events`** — `setFromProp(signal, key)`, `setValue(signal, value)`, `add(signal, delta, {min, max}?)`, `toggle(signal)`.
- **`fresh/signals`** — `makeComputed(fn)` (plus a `.use(...args)` variant for stable computed instances across re-renders); built-in computeds `equals(a, b)`, `test(a, regexp)`, `and(...)`, `or(...)`, `not(input)`.
- **`fresh/serializable`** — the generic `factory(...)` primitive every framework- or user-shipped factory is built on. User factories must be exported from `islands/`.

This means a Fresh 3 page can be entirely declarative — no per-counter island, no client-side JS authored by the user — while still updating live. Closing the islands-only mental model of Fresh 2 is a deliberate Fresh 3 goal.

### 8. Client-side navigation

Fresh 3's client navigation is built on the **Navigation API** (Baseline early 2026), where Fresh 2 hand-rolls click + popstate interception. It also adds things Fresh 2 doesn't: session-scoped back/forward (a traverse only goes partial if the whole path stayed in one document session, else full reload), `Sec-Fetch-*` validation, and a `Fresh-Partial` request header + `Vary` instead of a query param.

| Capability | Fresh 2 | Fresh 3 | Gap |
| --- | --- | --- | --- |
| `<Partial name="…">` + `f-client-nav` | ✅ | ✅ | — |
| Replacement modes `replace` / `append` / `prepend` | ✅ | ✅ | — |
| Multiple partials per response | ✅ | ✅ | — |
| Form submissions (GET + POST) as partials | ✅ | ✅ | — |
| Back/forward (history) partial navigation | ✅ | ✅ | Fresh 3 also session-scopes it |
| `f-client-nav={false}` opt-out | ✅ | ✅ | — |
| `<Head>` delta sync on navigation | ✅ | ✅ | — |
| `key`-based reconciliation of swapped islands | ✅ | ❌ | **Missing** — Fresh 3 re-renders inside-region islands fresh |
| `f-partial` link attribute (specialized endpoint) | ✅ | ❌ | **Missing** |
| `_freshIndicator` loading-state signal | ✅ | ❌ | **Missing** |
| `f-view-transition` + browser View Transitions API | ✅ | ❌ | **Missing** |

### 9. Head / metadata

| Capability | Fresh 2 | Fresh 3 | Gap |
| --- | --- | --- | --- |
| `<Head>` component from `fresh/runtime` (dedup by title / key / id / meta-name / rel) | ✅ | ✅ | — (server: in-place shell replacement + `<RemainingHead>`; client: post-hydrate insertion into `document.head` with same dedup rules) |
| Set head from islands at runtime | ✅ | ❌ | **Missing** |

### 10. Static files & assets

| Capability | Fresh 2 | Fresh 3 | Gap |
| --- | --- | --- | --- |
| `static/` directory served from root | ✅ via `staticFiles()` middleware | ❌ (use Vite's `public/`) | **Missing**: `staticFiles()` middleware + `static/` convention |
| `ETag` streaming from disk | ✅ | (Nitro defaults) | Verify parity |
| `asset()` helper + `assetSrcSet()` (1-year cache headers, fingerprinting) | ✅ | ❌ | **Missing** — Fresh 3 relies on Vite hashed filenames |
| Auto cache headers on `<img src>` / `srcset` with `data-fresh-disable-lock` opt-out | ✅ | ❌ | **Missing** |
| Hashed assets via build | ✅ | ✅ (Vite) | — |

### 11. Built-in plugins / middleware library

| Plugin                                         | Fresh 2 | Fresh 3 | Gap         |
| ---------------------------------------------- | ------- | ------- | ----------- |
| `cors()`                                       | ✅      | ❌      | **Missing** |
| `csrf()`                                       | ✅      | ❌      | **Missing** |
| `csp()`                                        | ✅      | ❌      | **Missing** |
| `ipFilter()`                                   | ✅      | ❌      | **Missing** |
| `trailingSlashes()` (configurable enforcement) | ✅      | ❌      | **Missing** |

### 12. Other runtime features

| Capability | Fresh 2 | Fresh 3 | Gap |
| --- | --- | --- | --- |
| WebSocket support / helpers | ✅ | ❌ | **Missing** |
| OpenTelemetry instrumentation | ✅ (built-in) | ❌ | **Missing** |
| Environment variable helpers | ✅ (docs page) | ⚠ standard `process.env` / Vite `import.meta.env` | Verify there's nothing branded |
| Active-link helper | ✅ | ❌ | **Missing** |
| Form/CSRF helpers in `fresh/runtime` | ✅ | ❌ | **Missing** |
| Session management examples | ✅ | n/a | Docs gap, not framework gap |
| `app.handler()` for testing | ✅ | ❌ (no App API) | **Missing**: documented test entrypoint |
| `app.listen()` for standalone server | ✅ | ❌ (Nitro builds deployable) | Different model |

### 13. Dev experience

| Capability | Fresh 2 | Fresh 3 | Notes |
| --- | --- | --- | --- |
| Preact Fast Refresh | ✅ | ✅ | Both via `@prefresh/vite` |
| Smart reload (skip server reload when only an island/leaf changed) | ⚠ | ✅ | Fresh 3 ahead — SSR-graph walker |
| Auto type generation | ⚠ (`define` helpers do the typing) | ✅ (`.fresh/types/**` + `$<file>.ts`) | Different model |

### 14. Build & deploy targets

| Target             | Fresh 2        | Fresh 3                                                |
| ------------------ | -------------- | ------------------------------------------------------ |
| Deno Deploy        | ✅ first-class | via Nitro `deno-deploy` preset (verify)                |
| `deno compile`     | ✅             | ❌                                                     |
| Docker             | ✅             | ✅ (Nitro `node-server` preset works in any container) |
| Cloudflare Workers | ✅             | ✅ (Nitro `cloudflare` preset)                         |
| Node               | ✅             | ✅ (Nitro `node-server` preset, default for `preview`) |

Fresh 3 is **multi-runtime by default** via Nitro presets; Fresh 2 is Deno-first with explicit per-target adapters.

### 15. Public package surface (Fresh 3)

The current `fresh` package exports:

| Entrypoint | What ships |
| --- | --- |
| `fresh/vite` | `fresh()` Vite plugin |
| `fresh/types` | All type-only exports (`Handler`, `HandlerContext`, `MiddlewareContext`, `PageProps`, `LayoutProps`, `ErrorHandler`, `ErrorHandlerContext`, `ErrorPageProps`, `EmptyState`, `InferData`, `HttpMethod`, …) |
| `fresh/errors` | `HttpError`, `NotFoundError`, `MethodNotAllowedError` |
| `fresh/signals` | `makeComputed`, `SerializableComputedSignal`, `equals`, `test`, `and`, `or`, `not` |
| `fresh/serializable` | `factory(...)` |
| `fresh/events` | `setFromProp`, `setValue`, `add` (+ `AddOptions`), `toggle` |
| `fresh/runtime` | `Head`, `HeadContext`, `HeadProps` |
| `fresh/internal/server` | `freshHandler` + validators (private) |
| `fresh/internal/client` | `boot`, `signal`, hydration types (private) |

`fresh/runtime` ships `Head` + `HeadContext` + `Partial`. For Fresh 2 parity, the **biggest missing entrypoints** are `fresh` (the App class), the remaining `fresh/runtime` exports (`asset`, `assetSrcSet`, `IS_BROWSER`, `_freshIndicator`), and the plugin list (`cors`, `csrf`, `csp`, `ipFilter`, `trailingSlashes`, `staticFiles`).

---

## What to add for feature parity with Fresh 2

In rough priority order, grouped by user-visible impact. **Items closed by the latest PRD are marked ✓**.

### Closed since last review

- ✓ Named catch-all params (`[...path]` → `params.path`).
- ✓ `_error.tsx` method-map handlers typed correctly (`ErrorHandler<Params, State>` family in `fresh/types`).
- ✓ Computed signals as island props (via `makeComputed` / `FactoryFunction`).
- ✓ Functions as island props (via `SerializedFunction` for island exports).
- ✓ Form-element signal binding (page-level + island-level via `f-s` / `f-eh` runtime + `fresh/events` factories).
- ✓ Page-level reactivity outside islands — Fresh 3 actually goes **further** than Fresh 2 here.
- ✓ **`<Head>` runtime element** — new `fresh/runtime` entrypoint. Server side wraps head-eligible intrinsics at JSX creation time and either collects them (inside `<Head>`) or swaps a shell element for the collected version (outside); a `<RemainingHead/>` dumps the rest at the end of `<head>`. Client side installs a matching hook in `boot()` that re-applies to `document.head` with the same dedup rules, wrapped in `@preact/signals` `effect()` so signal-valued props/children update the live document head reactively.

- ✓ **Partials + client-side navigation** (PRD §4.16) — `<Partial name="…" mode>` from `fresh/runtime`, `f-client-nav` opt-in (with `={false}` opt-out), `ctx.isPartial`, `renderPartial` (regions + `<Head>` delta + inside-region-only island state). Client runtime on the **Navigation API**: link clicks, GET/POST form submits, and session-scoped back/forward; `Fresh-Partial` header + `Sec-Fetch-*` validation + `Vary`. Multiple/nested partials per response and replace/append/prepend modes all work.

### Tier 1 — Closing the most-visible product gaps

1. **Remaining partials work** (after the §4.16 baseline)
   - `f-partial` attribute → specialized endpoint that returns only the named partial.
   - `_freshIndicator` global signal for loading state.
   - Active-link marking (`data-current` / `data-ancestor` + `aria-current`).
   - `key`-based reconciliation so swapped islands preserve state (ties into the `render` → `hydrate` migration).

2. **View Transitions**
   - `f-view-transition` attribute wraps the swap in `document.startViewTransition()`.
   - Progressive enhancement: no-op when `startViewTransition` is unavailable.

3. **Async server components + streaming SSR** (PRD gap #5)
   - Allow `page` to be `async`. Requires moving from `renderToString` to `renderToStringAsync` (preact-render-to-string) and likely Preact's streaming render.
   - `<Suspense>` support so async leaves don't block the full document.
   - Re-validate the head-injection hook (currently runs after a sync render) and the page-level signal/event prop-scan hook (`__b`) under streaming.

4. **`IS_BROWSER` constant** in `fresh/runtime`. Tiny, but Fresh 2 idiomatic.

### Tier 2 — App API and routing parity

6. **Programmatic `App` builder**
   - New entrypoint `fresh` (or `fresh/app`) exporting `new App()`.
   - `.use`, `.get/.post/.put/.delete/.head/.all`, `.layout`, `.appWrapper`, `.onError`, `.notFound`, `.fsRoute`, `.route`, `.mountApp`.
   - `.handler()` returns a `(req) => Response` for tests.
   - `.listen()` is a convenience that maps to the chosen Nitro preset; `vite build` flow continues to emit `.output/server`.
   - Constructor options: `basePath`, `trustProxy`.

7. **Middleware array form** in `_middleware.tsx` — accept `default: [mw1, mw2]` and compose left-to-right. Trivial change in the validator.

8. **`ctx.render(data)` API** — for Fresh 2 portability. Internally translates to the same `{ data }` return.

9. **`ctx.info`** equivalent — expose remote address / connection metadata where Nitro provides it.

### Tier 3 — Plugin library

10. **`fresh/plugins`** (or middleware exported from `fresh`):
    - `cors({ origin, allowHeaders, allowMethods, exposeHeaders, maxAge, credentials })`
    - `csrf({ ... })`
    - `csp({ ... })`
    - `ipFilter({ ... })`
    - `trailingSlashes("always" | "never")` (also wire to rou3 / router-level normalization)

11. **`staticFiles()` middleware + `static/` convention**
    - Decide whether to keep Vite's `public/` (current) or restore `static/`. For migration ergonomics, supporting `static/` (mapped through Vite's `publicDir`) + a `staticFiles()` middleware shim is the lowest-friction option.

12. **`asset()` + `assetSrcSet()` helpers** in `fresh/runtime`
    - For paths inside `static/`, return the URL with a `?__fresh=<buildhash>` (or just identity if already content-hashed) and attach 1-year `Cache-Control` headers in the matching middleware.
    - Auto-rewrite `<img src>` / `srcset` during SSR with a `data-fresh-disable-lock` escape hatch.

### Tier 4 — Islands feature gaps

13. **JSX / children as island props** (PRD gap #1)
    - Adopt Fresh 2's slot-reviver / `<template>` approach: serialize the child VNode tree as a tagged token; on the client, render it from a `<template>` placed inside the island's marker range.

14. **`<If>` and `<Each>` built-in islands** (PRD gap #4)
    - Tiny client-only components that consume signals and rerender; ship as part of `fresh/signals` or a new `fresh/components` entrypoint.

15. **Object factories with signal properties** (PRD gap #5) — ergonomic `factory(() => ({foo: signal1, bar: signal2}))` helper for the common "bag of signals" shape.

16. **`URL` and `Temporal` devalue reducers** — both are mentioned in Fresh 2's serialization docs.

17. **Switch client hydration from `render` to `hydrate`** (PRD gap #3).

### Tier 5 — Observability, networking, runtime polish

18. **WebSocket helpers** — Nitro supports them; we need a documented `ctx.upgrade()` (or similar) wrapper.

19. **OpenTelemetry instrumentation** — Fresh 2 ships built-in. Equivalent here would be a plugin that wraps the server entrypoint + middleware chain in spans and reads OTEL env vars.

20. **Active-link helper** (`<NavLink>` or runtime helper that matches `url.pathname`).

21. **`deno compile` deploy preset** — wire Nitro's deno-server/deno-deploy presets and document.

---

## Notes for migrators

- **`define` helpers**: code written against `define.page(...)` / `define.handlers(...)` will need to migrate to `import { page, handler } from "./$<file>.ts"`. A thin compat shim (`export const define = { page, handler, middleware }`) in the generated `$<file>.ts` would let Fresh 2 source compile unchanged.
- **Middleware state merging**: Fresh 3's `next(state)` _replaces_ state rather than merging. A code-mod could wrap `next(partial)` as `next({ ...state, ...partial })` automatically.
- **Static files**: Fresh 2 projects with a `static/` directory full of URL-referenced assets need a story before they can build. Either supply `staticFiles()` + the `static/` convention, or document the `public/` migration.
- **Plugins**: most apps use at least one of `cors` / `csrf` / `trailingSlashes`. Shipping these in Tier 3 unblocks the bulk of real-world migrations.
- **Page-level reactivity is a new tool**: porting a Fresh 2 counter-island to Fresh 3 can often be done as a regular route page + `makeComputed` / `fresh/events` factories, no island file needed. Worth calling out in the migration guide because it changes the mental model.
- **Plain closures as event handlers in routes** will throw clearly at SSR time, pointing at the JSX call site. Users porting from Fresh 2 islands need to either move the handler into an island file or use a `fresh/events` factory.
