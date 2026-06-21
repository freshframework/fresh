# TODO

## Islands

- [x] Support passing JSX as props ("slots"): the server renders the JSX to DOM — inline between `<!--fresh-slot:N-->` markers if the island rendered the prop, else into a `<template data-fresh-slot="N">` — and serializes the prop as `slot(N)`. The client `<Slot>` grafts that DOM in when the island renders it, then hydrates it. Slot content is treated page-level (a `SlotMarker` boundary in `hasIslandOwner`), so inline signals, signal-bound attributes, serialized event handlers, and nested islands inside a slot all come alive — for both inline-rendered slots and ones emitted to a `<template>` (rendered with the hooks active so their page-level state rides the payload, then hydrated on graft). Limitations: slots applied during a partial swap aren't supported yet (the capture timing differs), and a VNode buried inside a non-VNode prop (an object, etc., rather than a direct prop / array item / `children`) is rejected at serialize time — it could never be marked or hydrated, so it errors rather than grafting silently-inert DOM.
- [ ] Built-in islands:
  - [ ] `<If>`
- [ ] Switch the client hydration from `render` to `hydrate` (reuse SSR DOM instead of replacing it).
- [ ] Serializable factories
  - [ ] Object factories, including signal properties

## Rendering

- [x] `<Head>` element — collect head children rendered anywhere in the tree and inject into the document `<head>`. Shipped as `Head` from `fresh/runtime` (server hoist + client dedup + partial delta sync); covered by `tests/e2e/head.spec.ts` and `src/client/head-dedupe.test.ts`.

## Navigation

Partials — client-side navigation that swaps named `<Partial>` regions instead of full pages. **v1 landed:** `<Partial name mode>` component (`fresh/runtime`), `f-client-nav` opt-in, server-side partial render (`renderPartial`, `ctx.isPartial`), replace/append/prepend modes, `<Head>` delta sync, scoped island/signal/event re-hydration, and a full-page fallback on error or non-partial responses.

The client runtime is built on the **Navigation API** (Baseline early 2026 — Chrome/Edge/Firefox/Safari). A single `navigate` listener covers link clicks, form submissions, and back/forward traversal; `event.intercept()` manages the history entry, scroll restoration, focus reset, and an `AbortSignal` for free. Per-region opt-in uses `NavigateEvent.sourceElement` — the handler walks up from the initiating element to see if it sits inside an `f-client-nav` region. On browsers without the Navigation API, links degrade to full-page navigation.

GET and POST form submissions work out of the box (GET fields ride in the URL; POST sends `event.formData` as the body).

`f-partial` on a link / form / submitter overrides the URL the partial is fetched from while history still moves to the navigated URL — resolved against the document base, and remembered on the history entry so a later back/forward traverse re-fetches identically.

Traversal (back/forward) is only served as a partial when the entire traversed path stayed within one document "session": each entry partial-navigated to is stamped with a per-document session id (via `navigation.updateCurrentEntry`), and a traverse that would cross a full page load (or any unstamped entry) falls back to a real navigation so the live DOM always matches the destination.

Request detection uses the `Fresh-Partial` request header (not a query param), so the fetched URL is identical to the navigated URL. The server only treats a request as partial when that header is present _and_ the `Sec-Fetch-*` metadata matches a same-origin `fetch()` (`dest: empty`, `site: same-origin`) — a top-level navigation, embed, or cross-site request gets the full page instead of a bare fragment. Responses carry `Vary: Fresh-Partial` so caches don't cross the two shapes.

State delivery reuses the existing serializer: the partial response carries the same inline data `<script type="module">` as a full page, ending in a `__FRESH_PARTIAL_APPLY(data)` sentinel that the client renames per-navigation and re-injects so island chunks hydrate the swapped region. Only islands / signals / events _inside_ an emitted `<Partial>` are serialized (the render runs in "partial mode" and tracks partial-nesting depth); state outside the region is sliced away and already hydrated on the live page, so it's omitted and inside-region markers get contiguous, subset-relative indices.

Deferred:

- [ ] View transitions — wrap the DOM swap in `document.startViewTransition` behind an `f-view-transition` opt-in.
- [x] Richer form cases — external submitters (a `<button form="…">` outside its form inherits the form's `f-client-nav` region) and per-submitter `formaction` overrides. (A submitter overriding a GET form to POST via `formmethod` is unsupported: Chromium's Navigation API performs the POST but leaves `event.formData` null, so the body can't be recovered — such a submit falls through to a full load. File upstream.)
- [ ] Active-link marking (`data-current` / `data-ancestor` + `aria-current`).
- [x] Loading indicators — `navigating` signal (`fresh/runtime`), `true` while a partial navigation is in flight. ~~`_freshIndicator`-style signal hook.~~
- [ ] Keyed island-state preservation across navigations (reviver/reconcile model — ties into the `render` → `hydrate` migration above).
- [x] Correct the committed URL after a server redirect: the client follows the redirect, swaps the target region, and `history.replaceState`s the entry to the redirect target.
- [x] Browser-driven tests for the client runtime — `tests/e2e/partials.spec.ts` drives the real Navigation-API client across Chromium/Firefox/WebKit (link/form swaps, traversal, redirect URL correction, `f-partial`, modes, `navigating` signal). Remaining finer-grained gaps tracked under [Testing](#testing).

## Server & routing

Gaps surfaced by comparing against the Fresh 2 test suite. (Programmatic route registration — `app.get/post/use/route`, `mountApp` — is intentionally out of scope; fresh3 is file-system-routing only.)

- [ ] Built-in middleware library — Fresh 2 ships `cors`, `csrf`, `csp`, `trailingSlashes`, `ipFilter`, and `staticFiles` (~60 tests' worth of behaviour). fresh3 ships **none** of these; it only composes user `_middleware.tsx` files (static assets are served by Vite/Nitro, not a middleware). Each would need a builder + its own tests.
- [ ] Route-level `config` export — `skipAppWrapper` (omit `_app` for a single route) and `skipInheritedLayouts` (skip parent layouts). No per-route `config` is parsed today, so these can't be tested until built.
- [ ] WebSocket upgrade — no `ctx.upgrade` / app-level `ws()`. The Vite/Nitro/srvx stack doesn't expose a socket upgrade path yet.
- [ ] **Bug:** on the `_error` page, `props.error instanceof Error` is `false` for genuine errors — the thrower's `Error.prototype` differs from the one `_error.tsx` sees across the dev SSR module boundary. `instanceof HttpError` still works (the class is shared through the `fresh/errors` module), so error _status_ resolves correctly, but the example `routes/_error.tsx` gates its message on `instanceof Error` and silently shows the fallback. Read `.message` structurally instead; confirm whether a bundled prod build (single realm) is affected before deciding to fix the framework vs. the example/docs. Reproduced by `check/boom` + `check/teapot` in `tests/integration/routing.test.ts`.

## Testing

- [x] Server-behaviour integration coverage — `tests/integration/routing.test.ts` exercises routing shapes (dynamic / catch-all / route-group), the middleware chain (state seeding, post-processing, short-circuit), handler return semantics (single-fn, HEAD→GET fallback, 405, custom status + headers, no-page → JSON), and the `_error` pipeline (404 / 500 / `HttpError` status). `src/server/context.test.ts` adds the `isPartial` `Sec-Fetch-*` accept/refuse matrix + `ctx.error` propagation.
- [x] Co-located `(_islands)` island hydration — fixture `routes/colocated/(_islands)/Local.tsx` + e2e in `tests/e2e/islands.spec.ts`. Also added a null-returning-island hydration test.
- [x] Partial-navigation client e2e — scroll reset on a forward swap, scroll restoration on back/forward traverse, full-page fallback when a partial fetch 500s, and native in-page hash-link scrolling (no swap/reload). All in `tests/e2e/partials.spec.ts`. Scroll reset/restore is handled entirely by the Navigation API's default `intercept({ scroll: "after-transition" })` (no fresh3 code needed) — the test drives navigation via a JS `.click()` (`clickViaJs` in `util.ts`) so Playwright's scroll-into-view doesn't reset the page to the top before the navigation fires.
- [ ] Remaining partial client e2e: focus reset after a swap, and request-abort behaviour when one navigation supersedes another in flight.
- [ ] Head e2e gaps: multiple islands each rendering `<Head>` (merge), reactive `<meta>` content updates post-hydration, and `<style>`/`<template>`/`<noscript>` collection into the head.
- [ ] Serializer wire-format coverage leans on devalue at the e2e layer; explicit unit round-trips for Temporal types, `Uint8Array` / typed arrays, `URL`, sparse arrays, and `undefined` / `NaN` / `±Infinity` are missing (only partly exercised via `tests/e2e/serialization.spec.ts`).

### WWW

- [ ] Re-add `raw.ts` handler for versioned assets, needed for Fresh 1 compat
