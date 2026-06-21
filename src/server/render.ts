// Two-phase page renderer with island detection.
//
//   1. The route's page component is rendered to an HTML string. During this
//      pass, the render-time DIFF hook intercepts any component tagged with a
//      `__FRESH_SERIALIZABLE_FUNCTION` marker (set by `island-transform.ts`), records its
//      `{ specifier, export, props }`, and rewrites the vnode to render
//      itself wrapped in a pair of numbered HTML comment markers:
//
//        <!--fresh-island:0-->...island HTML...<!--/fresh-island-->
//
//   2. An "app wrapper" component (default: a minimal html/head/body shell)
//      is rendered with a placeholder where the page HTML belongs. The vnode
//      hook injects asset links/scripts into `<head>`. The placeholder is
//      string-replaced with the page HTML.
//
//   3. If any islands rendered, their client `entry` URLs are resolved
//      (async) through the SSR-side islands map, and a `__FRSH_STATE__` JSON
//      script + the boot `<script>` are inserted before `</head>`. The state
//      carries, per island instance: `{ url, export, props }`. The client
//      boot indexes into it by the marker number.

import {
  h,
  options,
  type ComponentChildren,
  type ComponentChild,
  Fragment,
  isValidElement,
  type VNode,
} from "preact";
import { renderToString } from "preact-render-to-string";
import { buildImportLines, createSerializer, SIGNAL_HELPER_SPECIFIER } from "./serialization.ts";
import { Head } from "../runtime/head.ts";
import {
  CLIENT_NAV_ATTR,
  HEAD_END,
  HEAD_START,
  normalizeClientNavProps,
  PARTIAL_DATA_SCRIPT_ATTR,
  PARTIAL_END,
  PARTIAL_START_PREFIX,
  type PartialMode,
} from "../runtime/partial.ts";
// `@preact/signals` installs its own `options.vnode` hook on import. We
// import it here BEFORE our own `installHooks` runs so our hook wraps over
// theirs in the chain — that way our hook sees the *raw* vnode tree (with
// signal-typed children) before preact-signals replaces signals with its
// internal `<Text>` component. We never call into the import; the import
// itself is the side-effect we need.
import "@preact/signals";

// `VNode<any>` (rather than `VNode`/`VNode<{}>`) because user code routinely
// returns intrinsics like `h("html", { lang })` whose VNode is parameterised
// over its props bag — the empty default would reject every such return.
// deno-lint-ignore no-explicit-any
export type AppWrapper = (props: { children: ComponentChildren }) => VNode<any>;

/** Shape returned by Vite's `?assets` query import. */
export interface ViteAssets {
  entry?: string;
  js?: ReadonlyArray<{ href: string }>;
  css?: ReadonlyArray<{ href: string }>;
}

/**
 * SSR-side islands map: specifier → loader for the client asset
 * descriptor. The codegen-generated loader unwraps the `?assets=client`
 * virtual's default export, so callers always get the flat
 * `{ entry, js, css }` shape.
 */
export type IslandsMap = Map<string, () => Promise<ViteAssets>>;

export interface RenderConfig {
  dev: boolean;
  ssrAssets: readonly ViteAssets[];
  clientAssets: ViteAssets | null;
  /** Boot chunk for island hydration. Optional so tests can omit it. */
  clientBootAssets?: ViteAssets | null;
  /**
   * SSR-side islands map (`fresh:internal/islands`). Used to resolve each
   * rendered island's client `entry` URL for embedding into the page state.
   */
  islands?: IslandsMap;
}

export interface RenderOptions {
  /** Override the default html/head/body shell. */
  app?: AppWrapper;
  /** Asset wiring for `<head>` injection. */
  renderConfig?: RenderConfig;
}

/** Marker attached by `island-transform.ts` to every exported island function. */
interface IslandMarker {
  specifier: string;
  /** Named export, or `null` for the default export. */
  export: string | null;
}

/** A single rendered island instance, addressed by its marker number. */
interface IslandInstance {
  /**
   * The original Component function (before we wrapped it). Carries
   * `__FRESH_SERIALIZABLE_FUNCTION` so the serializer can alias it to
   * an import name; on the client side this is the function the boot
   * runtime renders into the marker range.
   */
  Component: (props: Record<string, unknown>) => VNode;
  /** Specifier from the island marker — used by the islands map for URL resolution. */
  specifier: string;
  /** Props the island was server-rendered with. */
  props: unknown;
}

interface RenderState {
  /** Rendered island instances in document order; index == marker number. */
  islands: IslandInstance[];
  /**
   * Signals rendered directly as JSX children at the *page* level (outside
   * any island). Index == `fresh-signal:N` marker number. Hydrated on the
   * client by replacing each marker's text range with a Preact component
   * that subscribes to the revived signal.
   */
  signals: unknown[];
  /**
   * Event-binding descriptions for `fresh/events`-built handlers attached
   * to page-level intrinsic elements. ONE entry per element (an array of
   * however many handlers the element has — each carries its own `event`
   * field, e.g. `"onInput"` / `"onClick"`); the element ships a single
   * `f-eh="<idx>"` attribute pointing at its group. Riding the same
   * devalue payload as `signals` means each entry's `value` / `delta` /
   * etc. supports the full devalue type set, and signal references
   * inside an entry dedupe via devalue's reference graph against the
   * signal-prop bindings.
   */
  events: EventBindingWire[][];
  /** Vnodes already wrapped, to avoid re-processing on a repeat DIFF call. */
  patched: WeakSet<object>;
  /**
   * Component-render stack. Every time Preact's `__r` hook fires (a
   * function component is about to be rendered), we push that vnode; on
   * `diffed` we pop it. The top of the stack is the currently-rendering
   * component, which is what becomes the "owner" of any vnode created
   * during its body.
   */
  ownerStack: VNode[];
  /**
   * `vnode → vnode-that-rendered-it` map, populated in the creation hook
   * from `ownerStack.at(-1)`. Walking this chain answers "is this vnode
   * inside an island?" — same approach as Fresh 2's
   * [`hasIslandOwner`](https://github.com/denoland/fresh/blob/main/packages/fresh/src/runtime/server/preact_hooks.ts).
   * A WeakMap so vnodes can be GC'd freely; the chain never outlives the
   * `renderPage` call.
   */
  owners: WeakMap<VNode, VNode>;
  /**
   * Items collected by `<Head>` during Phase 1, keyed by a cache key
   * derived from each entry's tag + `key` / `id` / `<meta name>` /
   * singleton `<link rel>` (see `computeHeadCacheKey`). Last-write
   * wins. Phase 2's `<head>` element renders these via `RemainingHead`
   * — and if the app shell already has a `<title>` / etc. with the
   * same cache key, the shell's wrapper swaps the inline element for
   * the collected one in place and deletes the entry, so we don't
   * emit duplicates.
   */
  // deno-lint-ignore no-explicit-any
  headEntries: Map<string, VNode<any>>;
  /**
   * Counter for `<script>`/`<style>`/non-singleton-`<link>` entries
   * with no `key`/`id` — these have no natural dedup criterion, so we
   * synthesise a unique cache key per encounter so they all render.
   */
  headUnique: number;
  /**
   * Names of every `<Partial>` rendered so far. Used to reject duplicate
   * partial names within a single render (the client matches regions by
   * name, so two regions sharing a name would be ambiguous).
   */
  partialNames: Set<string>;
  /**
   * `true` during `renderPartial`. When set, island/signal/event state is
   * only recorded for elements *inside* a `<Partial>` (see `partialDepth`):
   * everything outside is sliced away anyway, and the live page already has it
   * hydrated, so serializing it would be dead weight.
   */
  partialMode: boolean;
  /**
   * Nesting depth of `<Partial>` wrappers currently being rendered, tracked
   * across each wrapper's whole subtree via the `__r`/`diffed` hooks. `> 0`
   * means "inside a partial region". Lets the recording sites in partial mode
   * skip outside-region state and give inside-region markers contiguous,
   * subset-relative indices.
   */
  partialDepth: number;
  /**
   * Island "slot" props (JSX passed to an island), in allocation order; index
   * == `fresh-slot:N` marker number. `rendered` flips true if the island
   * actually rendered the prop (so the slot's DOM sits inline between markers);
   * otherwise the slot is emitted into a `<template data-fresh-slot="N">` so the
   * client can still graft it if the island renders the prop later.
   */
  slots: { vnode: VNode; rendered: boolean }[];
  /** Slot VNode → its index, so the same VNode round-trips to one slot. */
  slotIndex: WeakMap<VNode, number>;
}

/** Fresh, empty render state. Shared by `renderPage` and `renderPartial`. */
function createRenderState(partialMode = false): RenderState {
  return {
    islands: [],
    signals: [],
    events: [],
    patched: new WeakSet(),
    ownerStack: [],
    headEntries: new Map(),
    headUnique: 0,
    owners: new WeakMap(),
    partialNames: new Set(),
    partialMode,
    partialDepth: 0,
    slots: [],
    slotIndex: new WeakMap(),
  };
}

/** Allocate (or re-use) the slot index for a VNode passed as an island prop. */
function allocateSlot(vnode: VNode, state: RenderState): number {
  const existing = state.slotIndex.get(vnode);
  if (existing !== undefined) return existing;
  const idx = state.slots.length;
  state.slots.push({ vnode, rendered: false });
  state.slotIndex.set(vnode, idx);
  return idx;
}

/** Whether the current render should record state for the vnode being processed. */
function shouldRecord(state: RenderState): boolean {
  return !state.partialMode || state.partialDepth > 0;
}

/** The registered symbol `@preact/signals` brands every signal with. */
const SIGNAL_BRAND = Symbol.for("preact-signals");

function isSignal(v: unknown): v is { brand: symbol; peek(): unknown } {
  return v !== null && typeof v === "object" && (v as { brand?: unknown }).brand === SIGNAL_BRAND;
}

// ---------- `<Head>` hoisting -------------------------------------------
//
// Same approach as Fresh 2: when JSX creates one of these intrinsic
// elements anywhere in the tree, the creation hook below swaps
// `vnode.type` for a small component that runs at render time. That
// component consults `useContext(HeadContext)` — if `<Head>` is open
// above us, it stashes the inner vnode in `state.headEntries` (keyed
// for dedup) and returns null; otherwise it lets the element render
// inline, except that if the same cache key was already collected by
// a `<Head>` higher up, it returns the collected vnode here instead
// (so a `<title>` in the app shell is replaced by the page's
// `<Head><title>` in place — no duplicate emission).
//
// Anything left in `state.headEntries` at the end of the head walk
// (because nothing in the shell consumed it) gets dumped by
// `<RemainingHead />`, which we append to the asset-injection list.
const HEAD_TAGS = new Set([
  "title",
  "meta",
  "link",
  "script",
  "style",
  "base",
  "noscript",
  "template",
]);

/** Vnodes the head wrapper has already produced — never re-wrap them. */
const PATCHED_HEAD: WeakSet<object> = new WeakSet();

/**
 * Render-time depth counter for "we are inside an `<svg>` subtree". SVG
 * has its own `<title>` element (the accessible name of the graphic)
 * which is NOT document-head-eligible — without this guard, the first
 * SVG `<title>` outside `<Head>` would consume the page's collected
 * `<title>`, moving it into the body and leaving `<head>` titleless.
 * Pushed/popped in the `__b` / `diffed` hooks on intrinsic `<svg>`.
 */
let SVG_DEPTH = 0;

/**
 * Render-time depth counter for "we are inside a `<Head>` provider".
 * Tracked via `__b`/`diffed` on the `Head` component instead of a
 * preact context lookup so the head-tag wrapper doesn't need to call
 * `useContext` — calling it from a function vnode that lives outside a
 * proper component-render frame trips `@preact/signals`' wrapped
 * `useContext` (it reads `r.context` on a null current-component).
 */
let HEAD_DEPTH = 0;

/**
 * Set while a head wrapper is in the middle of `h(originalType, props)`
 * — `options.vnode` fires synchronously inside that call (before we
 * have a reference to add to `PATCHED_HEAD`), so a plain set-based
 * guard isn't enough on its own. The flag short-circuits the
 * wrap-on-creation path during the inner-vnode construction.
 */
let CONSTRUCTING_HEAD_INNER = false;

/**
 * `<link rel="…">` values for which there's only ever one element in
 * the document. Other rels (`stylesheet`, `preload`, `prefetch`, …)
 * can legitimately repeat with different `href`s, so we don't dedup
 * on rel alone for them.
 */
function isSingletonLinkRel(rel: unknown): boolean {
  return rel === "canonical" || rel === "manifest";
}

function computeHeadCacheKey(
  type: string,
  key: unknown,
  props: Record<string, unknown>,
  state: RenderState,
): string {
  if (type === "title") return "title";
  if (key !== null && key !== undefined) return `key:${String(key)}`;
  if (props.id !== null && props.id !== undefined) return `id:${String(props.id)}`;
  if (type === "meta" && typeof props.name === "string") return `meta:${props.name}`;
  if (type === "link" && isSingletonLinkRel(props.rel)) return `link:${String(props.rel)}`;
  if (type === "base") return "base";
  // No natural dedup key — synthesise a unique one so the element
  // always renders (instead of clobbering an earlier non-dedupable
  // entry with the same tag).
  return `unique:${state.headUnique++}`;
}

/**
 * Replace `vnode.type` (an intrinsic head-eligible tag) with a small
 * render-time wrapper. We hold `originalType` + `originalKey` in
 * closure; everything else flows through `props` at render time.
 */
function wrapHeadElement(vnode: VNode): void {
  const originalType = vnode.type as string;
  const originalKey = vnode.key;
  // deno-lint-ignore no-explicit-any
  (vnode as any).type = (props: Record<string, unknown>) => {
    const inHead = HEAD_DEPTH > 0;
    CONSTRUCTING_HEAD_INNER = true;
    const inner = h(originalType, props);
    CONSTRUCTING_HEAD_INNER = false;
    PATCHED_HEAD.add(inner);
    // SVG has its own `<title>` element — render inline, don't hoist
    // or consume from `<Head>` collection.
    if (SVG_DEPTH > 0) return inner;
    if (currentRender === null) return inner;
    const cacheKey = computeHeadCacheKey(originalType, originalKey, props, currentRender);
    if (inHead) {
      // Inside a `<Head>` provider — collect and render null at the
      // inline position. Map insertion overwrites on repeat keys, so
      // last write wins.
      currentRender.headEntries.set(cacheKey, inner);
      return null;
    }
    // Outside `<Head>` — typically a default in the app shell. If a
    // matching entry was collected, render it HERE (consuming it so
    // `<RemainingHead>` doesn't double-emit) and skip the inline.
    const cached = currentRender.headEntries.get(cacheKey);
    if (cached !== undefined) {
      currentRender.headEntries.delete(cacheKey);
      return cached;
    }
    return inner;
  };
}

/**
 * Renders any `<Head>`-collected entries that weren't consumed by an
 * in-place shell wrapper. We append `<RemainingHead />` to
 * `buildHeadInjections`'s output, so it runs at the end of the
 * `<head>` element's children — after the shell's own elements have
 * had their chance to swap.
 */
function RemainingHead(): VNode | null {
  if (currentRender === null || currentRender.headEntries.size === 0) return null;
  return h(Fragment, null, ...currentRender.headEntries.values()) as VNode;
}

// A plain-ASCII sentinel — no HTML-special characters so preact won't escape
// it, and unique enough that we won't collide with user content.
const PLACEHOLDER = "__FRESH_PAGE_PLACEHOLDER_dQw4w9WgXcQ__";

// Module-level state read by the hooks during render. Safe because each
// `renderPage` call is synchronous from set-up through both render passes.
let currentConfig: RenderConfig | null = null;
let currentRender: RenderState | null = null;

installHooks();

/** Default app shell used when the user doesn't provide one. */
export const DefaultApp: AppWrapper = (props) =>
  h(
    "html",
    null,
    h(
      "head",
      null,
      h("meta", { charset: "UTF-8" }),
      h("meta", {
        name: "viewport",
        content: "width=device-width, initial-scale=1.0",
      }),
    ),
    h("body", null, props.children),
  );

/**
 * Render a page VNode into a full HTML document.
 *
 * Async because resolving island client URLs goes through the islands map's
 * `?assets=client` loaders (dynamic imports).
 *
 * @param pageVNode  The already-constructed page VNode.
 * @param opts       Optional app wrapper + render-config.
 * @returns          The full HTML document, prefixed by `<!DOCTYPE html>`.
 */
export async function renderPage(pageVNode: VNode, opts: RenderOptions = {}): Promise<string> {
  const App = opts.app ?? DefaultApp;
  currentConfig = opts.renderConfig ?? null;
  const state = createRenderState();
  currentRender = state;
  let html: string;
  try {
    // Phase 1 — page → HTML. Island wrapping happens here.
    const pageHtml = renderToString(pageVNode);

    // Phase 2 — render the app wrapper with a sentinel where the page goes.
    const wrappedHtml = renderToString(h(App, { children: PLACEHOLDER }) as VNode);

    // Use a replacement *function* so `$`-sequences in the page HTML (`$&`,
    // `$\``, `$<name>`, …) are inserted literally rather than interpreted as
    // `String.replace` substitution patterns.
    html = "<!DOCTYPE html>" + wrappedHtml.replace(PLACEHOLDER, () => pageHtml);
  } finally {
    currentConfig = null;
    currentRender = null;
  }

  // Phase 3 — island state + boot (async URL resolution).
  const hasRuntime =
    state.islands.length > 0 || state.signals.length > 0 || state.events.length > 0;
  if (hasRuntime && opts.renderConfig) {
    html = await injectIslandRuntime(html, state, opts.renderConfig);
  } else if (
    // No islands ran (so no boot script loaded the client runtime), but the
    // page opts into client navigation — load the boot chunk anyway so its
    // partial click/popstate listeners install. Importing the chunk is a
    // side-effecting no-op beyond installing those listeners.
    opts.renderConfig?.clientBootAssets?.entry &&
    html.includes(CLIENT_NAV_ATTR)
  ) {
    const loader = `<script type="module" src="${opts.renderConfig.clientBootAssets.entry}"></script>`;
    html = html.includes("</head>") ? html.replace("</head>", loader + "</head>") : html + loader;
  }
  return html;
}

function installHooks(): void {
  // Head injection uses the creation-time `vnode` hook: the `<head>` is built
  // during the Phase-2 app-shell render walk, so it's created while
  // `currentRender` is active. We always run the injection when a head
  // is created mid-render — even without a `renderConfig` — because
  // `<RemainingHead/>` (which dumps `<Head>`-collected entries) is
  // independent of the asset config.
  const prevVNode = options.vnode;
  options.vnode = (vnode) => {
    // Coerce a boolean `f-client-nav` to its string form so Preact doesn't
    // drop a `false` (which would silently defeat the opt-out).
    if (vnode && typeof vnode.type === "string") {
      normalizeClientNavProps(vnode.props as Record<string, unknown>);
    }
    if (vnode && vnode.type === "head" && currentRender) {
      const injected = buildHeadInjections(currentConfig);
      if (injected.length > 0) {
        const props = vnode.props as { children?: ComponentChildren };
        const existing = props.children;
        const additions = injected as ComponentChildren;
        props.children =
          existing === undefined || existing === null
            ? additions
            : Array.isArray(existing)
              ? [...existing, ...injected]
              : [existing, ...injected];
      }
    }
    // Hoist head-eligible intrinsics into `<Head>` collection. Done at
    // creation time so the wrap is in place before render — and BEFORE
    // signal-child wrapping, since the wrap changes `vnode.type` from
    // string to function (which would short-circuit the signal scan
    // below). Signals inside head elements aren't reactive client-side
    // anyway — that's a v1 limitation, not a regression.
    if (
      vnode &&
      vnode.props &&
      typeof vnode.type === "string" &&
      HEAD_TAGS.has(vnode.type) &&
      !CONSTRUCTING_HEAD_INNER &&
      !PATCHED_HEAD.has(vnode)
    ) {
      wrapHeadElement(vnode);
    }
    // Signal-as-child wrapping fires at vnode CREATION time on every
    // intrinsic element — unconditionally, regardless of whether we're
    // mid-render. The reason: tests (and ordinary app code) construct JSX
    // outside `renderPage`, so by the time we'd ever enter renderPage,
    // preact-signals' own vnode hook (chained as `prevVNode`) has already
    // swapped any signal child for its internal `<Text>` component. To win
    // that race we MUST wrap before chaining to preact-signals.
    if (vnode && vnode.props && typeof vnode.type === "string") {
      wrapSignalChildren(vnode);
      // Capture the JSX call-site as an Error so a later diff-time failure
      // (unmarked `on*` function handler) can re-throw it and point the
      // developer's debugger straight at the offending element. Targeted:
      // only stamp when at least one prop is a function on an `on*` key
      // (the only path that can fail). For every other element this loop
      // is a no-op, so the common case pays only the prop scan.
      const p = vnode.props as Record<string, unknown>;
      for (const k of Object.keys(p)) {
        if (typeof p[k] === "function" && isEventName(k)) {
          (vnode as unknown as { __fError?: Error }).__fError = new Error();
          break;
        }
      }
    }
    // Record the owner (the function-component vnode currently rendering,
    // if any). Walking this chain answers "is this vnode inside an island?"
    // — see `hasIslandOwner` below. Same approach Fresh 2 uses.
    if (currentRender !== null && vnode) {
      const owner = currentRender.ownerStack[currentRender.ownerStack.length - 1];
      if (owner !== undefined) currentRender.owners.set(vnode, owner);
    }
    if (prevVNode) prevVNode(vnode);
  };

  // Island wrapping uses the render-time DIFF hook (runtime key `__b`).
  // The page vnode tree is built by the route handler *before* `renderPage`
  // runs, so a creation-time hook would miss it; DIFF fires for each vnode
  // as it's about to be rendered, while `currentRender` is active.
  const opts = options as unknown as {
    __b?: (vnode: VNode) => void;
    __r?: (vnode: VNode) => void;
    diffed?: (vnode: VNode) => void;
  };
  const prevDiff = opts.__b;
  opts.__b = (vnode) => {
    // Track depth into intrinsic `<svg>` subtrees so the head-tag
    // wrapper can tell an SVG `<title>` from a document `<title>`.
    if (vnode && vnode.type === "svg") SVG_DEPTH++;
    // Track depth into `<Head>` so the head-tag wrapper knows it
    // should collect rather than render inline.
    if (vnode && vnode.type === Head) HEAD_DEPTH++;
    if (
      currentRender !== null &&
      vnode &&
      typeof vnode.type === "function" &&
      !currentRender.patched.has(vnode)
    ) {
      const marker = (
        vnode.type as unknown as {
          __FRESH_SERIALIZABLE_FUNCTION?: IslandMarker;
        }
      ).__FRESH_SERIALIZABLE_FUNCTION;
      if (marker) {
        currentRender.patched.add(vnode);
        // Only a *top-level* island gets markers + serialized props. An island
        // rendered inside another island is re-created by the outer island's
        // own client render, so marking it (and serializing its props) would be
        // dead weight — and its props need not even be serializable. Render it
        // inline instead. Likewise, in partial mode an island outside every
        // `<Partial>` is sliced away and already hydrated on the live page.
        if (shouldRecord(currentRender) && !hasIslandOwner(currentRender, vnode)) {
          wrapIslandInPlace(vnode, marker, currentRender);
        }
      } else if (
        (vnode.type as unknown as { __FRESH_PARTIAL?: boolean }).__FRESH_PARTIAL === true
      ) {
        currentRender.patched.add(vnode);
        wrapPartialInPlace(vnode, currentRender);
      }
    }
    // Signal-as-prop binding for intrinsic elements rendered at the page
    // level. Done at DIFF time (not creation time) so `currentRender` is
    // guaranteed active — and so we win the race against preact-signals'
    // own diff-time prop hook, which would otherwise consume the signal
    // before we see it. Page-level vs inside-island is decided by walking
    // the owner chain (see `hasIslandOwner`) — that handles nested
    // components inside islands (e.g. `<Counter><Button/></Counter>`
    // where Button's body renders a `<button>` after the wrapper's
    // synchronous originalType call has returned).
    if (
      currentRender !== null &&
      vnode &&
      typeof vnode.type === "string" &&
      !hasIslandOwner(currentRender, vnode)
    ) {
      bindSignalProps(vnode, currentRender);
    }
    if (prevDiff) prevDiff(vnode);
  };

  // Component-render hook (`__r` in preact) fires right before a function
  // component's body is invoked. Push the vnode onto the ownerStack so any
  // vnodes the body creates can record it as their owner.
  const prevR = opts.__r;
  opts.__r = (vnode) => {
    if (
      currentRender !== null &&
      vnode &&
      typeof vnode.type === "function" &&
      vnode.type !== Fragment
    ) {
      currentRender.ownerStack.push(vnode);
      if (
        (vnode.type as unknown as { __FRESH_PARTIAL_WRAPPER?: boolean }).__FRESH_PARTIAL_WRAPPER
      ) {
        currentRender.partialDepth++;
      }
    }
    if (prevR) prevR(vnode);
  };

  // Diffed (mangled key on `options.diffed`) fires after a component's
  // entire subtree has finished diffing — that's when we pop the
  // ownerStack. Keeping the stack scoped to the component's full diff
  // (not just the synchronous body call) is what makes the inside-island
  // check work for nested components.
  const prevDiffed = opts.diffed;
  opts.diffed = (vnode) => {
    if (vnode && vnode.type === "svg" && SVG_DEPTH > 0) SVG_DEPTH--;
    if (vnode && vnode.type === Head && HEAD_DEPTH > 0) HEAD_DEPTH--;
    if (
      currentRender !== null &&
      vnode &&
      typeof vnode.type === "function" &&
      vnode.type !== Fragment
    ) {
      const top = currentRender.ownerStack[currentRender.ownerStack.length - 1];
      // Defensive — the stack should always match in a well-behaved tree.
      if (top === vnode) currentRender.ownerStack.pop();
      if (
        (vnode.type as unknown as { __FRESH_PARTIAL_WRAPPER?: boolean }).__FRESH_PARTIAL_WRAPPER
      ) {
        currentRender.partialDepth--;
      }
    }
    if (prevDiffed) prevDiffed(vnode);
  };
}

/**
 * Walk the owner chain of `vnode` looking for an ancestor whose type is
 * either an island component (carries `__FRESH_SERIALIZABLE_FUNCTION`) or a wrapper we
 * installed for an island (carries `__FRESH_ISLAND_WRAPPER`). Mirrors
 * Fresh 2's
 * [`hasIslandOwner`](https://github.com/denoland/fresh/blob/main/packages/fresh/src/runtime/server/preact_hooks.ts).
 */
function hasIslandOwner(state: RenderState, vnode: VNode): boolean {
  let cur: VNode | undefined = vnode;
  while (cur !== undefined) {
    const owner = state.owners.get(cur);
    if (owner === undefined) return false;
    const t = owner.type;
    if (typeof t === "function") {
      const f = t as unknown as {
        __FRESH_SERIALIZABLE_FUNCTION?: unknown;
        __FRESH_ISLAND_WRAPPER?: unknown;
        __FRESH_SLOT_WRAPPER?: unknown;
      };
      // A slot boundary first ⇒ page-level (slot content is the page's, just
      // positioned inside the island). An island wrapper first ⇒ inside island.
      if (f.__FRESH_SLOT_WRAPPER) return false;
      if (f.__FRESH_ISLAND_WRAPPER || f.__FRESH_SERIALIZABLE_FUNCTION) return true;
    }
    cur = owner;
  }
  return false;
}

/**
 * Brackets a slot's content in `<!--fresh-slot:N-->` / `<!--/fresh-slot-->`
 * markers so the client can capture its server-rendered DOM, and flips the
 * slot's `rendered` flag — its presence in the output is exactly "the island
 * rendered this prop". Spliced into island props by `wrapSlotProps`.
 */
function SlotMarker(props: { index: number; children?: ComponentChildren }): VNode {
  if (currentRender !== null) {
    const slot = currentRender.slots[props.index];
    if (slot !== undefined) slot.rendered = true;
  }
  return h(
    Fragment,
    null,
    // @ts-ignore UNSTABLE_comment isn't in preact's typings
    h(Fragment, { UNSTABLE_comment: `fresh-slot:${props.index}` }),
    props.children,
    // @ts-ignore UNSTABLE_comment isn't in preact's typings
    h(Fragment, { UNSTABLE_comment: "/fresh-slot" }),
  );
}
// Branded so `hasIslandOwner` treats it as a page-level boundary: slot content
// is passed in from the page, so its signals / event handlers / islands must be
// recorded + serialized as page-level state (and hydrated client-side once the
// slot's DOM is grafted), even though it renders inside the host island.
(SlotMarker as unknown as { __FRESH_SLOT_WRAPPER?: boolean }).__FRESH_SLOT_WRAPPER = true;

/**
 * Whether `value` is a slottable VNode. `isValidElement` alone false-positives
 * on `@preact/signals` signals, so exclude anything carrying the signal brand —
 * a signal-valued prop must stay a signal (the serializer's signal branch and
 * preact-signals' own client binding handle it), not become a slot.
 */
function isVNode(value: unknown): value is VNode {
  return isValidElement(value) && (value as { brand?: unknown }).brand !== SIGNAL_BRAND;
}

/** Wrap a single value if it's a VNode (or an array containing VNodes). */
function wrapSlotValue(value: unknown, state: RenderState): unknown {
  if (isVNode(value)) {
    return h(SlotMarker, { index: allocateSlot(value, state) }, value as ComponentChild);
  }
  if (Array.isArray(value)) {
    let changed = false;
    const mapped = value.map((item) => {
      const wrapped = wrapSlotValue(item, state);
      if (wrapped !== item) changed = true;
      return wrapped;
    });
    return changed ? mapped : value;
  }
  return value;
}

/**
 * Return a copy of an island's props with VNode-valued props (JSX passed to the
 * island — `children` and the like) wrapped in `SlotMarker`, so rendering the
 * prop brackets its DOM with slot markers. The original props are kept for
 * serialization, where each VNode becomes a `slot(<index>)` call sharing the
 * same index. Non-VNode props pass through untouched (the common case, so the
 * original object is returned as-is when nothing was wrapped).
 */
function wrapSlotProps(
  props: Record<string, unknown>,
  state: RenderState,
): Record<string, unknown> {
  let copy: Record<string, unknown> | null = null;
  for (const key in props) {
    const value = props[key];
    const wrapped = wrapSlotValue(value, state);
    if (wrapped !== value) {
      if (copy === null) copy = { ...props };
      copy[key] = wrapped;
    }
  }
  return copy ?? props;
}

/**
 * Replace `vnode.type` with a wrapper that renders the island inside a pair
 * of numbered HTML comment markers. The instance's `{ specifier, export,
 * props }` is recorded so its client URL can be resolved after render.
 */
function wrapIslandInPlace(vnode: VNode, marker: IslandMarker, state: RenderState): void {
  const originalType = vnode.type as (props: Record<string, unknown>) => VNode;
  const idx =
    state.islands.push({
      Component: originalType,
      specifier: marker.specifier,
      props: vnode.props,
    }) - 1;
  // A user-supplied `key` rides along in the start marker so the client's
  // partial-swap path can match the new island against a live one and
  // preserve its Preact root (hooks, refs, signals) instead of remounting.
  // `encodeURIComponent` keeps the colon delimiter and "--" out of the
  // comment data.
  const key = vnode.key !== null && vnode.key !== undefined ? String(vnode.key) : null;
  const startComment =
    key !== null ? `fresh-island:${idx}:${encodeURIComponent(key)}` : `fresh-island:${idx}`;
  const endComment = "/fresh-island";

  // The wrapper function is stamped with `__FRESH_ISLAND_WRAPPER` so the
  // `__b`/`diffed` hooks can match it without inspecting the function body.
  // Inside-island depth is maintained by those hooks across the ENTIRE
  // diff of this subtree (wrapper enter → all descendants → wrapper exit),
  // not just the wrapper's synchronous body — that's the only way nested
  // components (e.g. an island that returns `<Button>` whose body renders
  // a `<button>`) get classified as inside the island, since their bodies
  // run after the wrapper has already returned.
  const wrapper = (props: Record<string, unknown>) => {
    // Render with VNode props bracketed by slot markers; the original props
    // (stored above) are what get serialized, as `slot(<index>)` calls.
    const child = originalType(wrapSlotProps(props, state));
    if (child && typeof child === "object") {
      // A `<Partial>` returned directly by an island would be marked
      // `patched` here and slip past the owner-chain check in `__b`, so catch
      // it explicitly. (Partials nested any deeper are caught by that check.)
      const childType = (child as VNode).type as unknown as { __FRESH_PARTIAL?: boolean };
      if (childType && childType.__FRESH_PARTIAL === true) {
        throw new Error(
          "<Partial> cannot be used inside an island. Move it to a route, layout, or shared (non-island) component.",
        );
      }
      state.patched.add(child);
    }
    return h(
      Fragment,
      null,
      h(Fragment, {
        // `UNSTABLE_comment` is preact-render-to-string's escape hatch for
        // emitting a raw HTML comment without an element wrapper.
        // @ts-ignore unstable property is not in preact's typings
        UNSTABLE_comment: startComment,
      }),
      child,
      h(Fragment, {
        // @ts-ignore unstable property is not in preact's typings
        UNSTABLE_comment: endComment,
      }),
    );
  };
  (wrapper as unknown as { __FRESH_ISLAND_WRAPPER?: boolean }).__FRESH_ISLAND_WRAPPER = true;
  // deno-lint-ignore no-explicit-any
  (vnode as any).type = wrapper;
}

/**
 * Replace a `<Partial>` vnode's type with a wrapper that emits boundary
 * comment markers around its children:
 *
 *   <!--fresh-partial:<mode>:<name>-->...children...<!--/fresh-partial-->
 *
 * The markers ship on every render (full page + partial responses) so the
 * client always has a handle on each region. Validates the `name` (present,
 * unique, marker-safe) and that the partial isn't nested inside an island
 * (the client owns island subtrees — a server-driven partial swap inside
 * one can't be reconciled).
 */
function wrapPartialInPlace(vnode: VNode, state: RenderState): void {
  if (hasIslandOwner(state, vnode)) {
    throw new Error(
      "<Partial> cannot be used inside an island. Move it to a route, layout, or shared (non-island) component.",
    );
  }
  const props = vnode.props as { name?: unknown; mode?: unknown };
  const name = props.name;
  if (typeof name !== "string" || name.length === 0) {
    throw new Error("<Partial> requires a non-empty string `name` prop.");
  }
  // Names land verbatim inside an HTML comment, so a `-->` (or the `--`
  // that can start one) would corrupt the marker. Reject those rather
  // than silently truncating the document.
  if (name.includes("--") || name.includes(">")) {
    throw new Error(
      `<Partial name=${JSON.stringify(name)}> contains characters not allowed in a partial name ("--" or ">").`,
    );
  }
  if (state.partialNames.has(name)) {
    throw new Error(
      `Duplicate <Partial name=${JSON.stringify(name)}>. Partial names must be unique within a render.`,
    );
  }
  state.partialNames.add(name);

  const rawMode = props.mode ?? "replace";
  if (rawMode !== "replace" && rawMode !== "append" && rawMode !== "prepend") {
    throw new Error(
      `<Partial name=${JSON.stringify(name)}> has invalid mode ${JSON.stringify(
        rawMode,
      )}; expected "replace", "append", or "prepend".`,
    );
  }
  const mode = rawMode as PartialMode;
  const startComment = `${PARTIAL_START_PREFIX}${mode}:${name}`;

  const originalType = vnode.type as (props: Record<string, unknown>) => ComponentChildren;
  const wrapper = (p: Record<string, unknown>) =>
    h(
      Fragment,
      null,
      h(Fragment, {
        // @ts-ignore unstable property is not in preact's typings
        UNSTABLE_comment: startComment,
      }),
      originalType(p) as ComponentChild,
      h(Fragment, {
        // @ts-ignore unstable property is not in preact's typings
        UNSTABLE_comment: PARTIAL_END,
      }),
    );
  // Branded so the `__r`/`diffed` hooks can bump `partialDepth` across this
  // wrapper's whole subtree (used to scope state recording in partial mode).
  (wrapper as unknown as { __FRESH_PARTIAL_WRAPPER?: boolean }).__FRESH_PARTIAL_WRAPPER = true;
  // deno-lint-ignore no-explicit-any
  (vnode as any).type = wrapper;
}

/**
 * Walk an intrinsic element's non-children props for signal values; for each
 * signal-valued prop, peek the current value into the prop slot (so SSR
 * renders the value), record the signal in `state.signals` with a stable
 * index, and accumulate `{propName: signalIndex}` bindings into an `f-s`
 * attribute on the element. The client boot finds every `[f-s]`, parses
 * the JSON, and subscribes each binding so the DOM prop tracks its signal.
 */
/**
 * Wire-side description of a single event binding. Identical to
 * `fresh/events`'s `FreshEventHandlerMarker`, plus an `event` field
 * carrying the JSX prop name (`onInput` / `onClick` / …) so a single
 * `state.events[i]` group can describe every handler on the element. The
 * `signal` field is the actual signal reference (not an index); devalue
 * serializes signals via the same `Signal` reducer the rest of the state
 * uses, so a signal referenced by both a prop binding and an event
 * binding ends up as one deduped wire slot.
 */
/**
 * Wire entry for a single event handler on a page-level intrinsic
 * element: the JSX prop name (`onClick`, `onInput`, …) and the live
 * handler function. The handler rides through devalue's `FactoryFunction`
 * reducer (it carries `__FRESH_FROM_FACTORY` because every
 * `fresh/events` factory is a `factory(...)` wrapper). No kind-specific
 * payload here — every variant collapses to the same generic shape.
 */
interface EventBindingWire {
  event: string;
  handler: unknown;
}

function bindSignalProps(vnode: VNode, state: RenderState): void {
  const props = vnode.props as Record<string, unknown>;
  // Whether to actually record bindings — false for outside-region elements in
  // partial mode (they're sliced away). Values are still peeked for SSR.
  const record = shouldRecord(state);
  let bindings: Record<string, number> | undefined;
  /**
   * Per-element group of event handlers. Pushed as ONE entry into
   * `state.events`; the element gets a single `f-eh="<idx>"` attribute.
   */
  let group: EventBindingWire[] | undefined;
  for (const key of Object.keys(props)) {
    // Skip Preact reserved slots and the marker attributes themselves
    // (defensive — re-diff of an already-bound vnode would otherwise
    // re-process its own f-s / f-eh values).
    if (key === "children" || key === "ref" || key === "key" || key === "f-s" || key === "f-eh") {
      continue;
    }
    const value = props[key];
    if (isSignal(value)) {
      const sig = value as { peek(): unknown };
      // Always peek the current value into the prop so SSR renders it. Only
      // record the live binding when this element will ship in the response
      // (in partial mode, outside-region elements are sliced away).
      props[key] = sig.peek();
      if (record) (bindings ??= {})[key] = state.signals.push(sig) - 1;
      continue;
    }
    if (typeof value === "function") {
      // Serializable handler: either an island-exported function
      // (auto-stamped by the island transform with
      // `__FRESH_SERIALIZABLE_FUNCTION`), or a `factory(...)`-returned
      // function (stamped with `__FRESH_FROM_FACTORY`). Both ride the
      // same wire path — devalue's SerializedFunction reviver gives the
      // client a real function back either way.
      const isSerializable =
        (
          value as {
            __FRESH_FROM_FACTORY?: unknown;
            __FRESH_SERIALIZABLE_FUNCTION?: unknown;
          }
        ).__FRESH_FROM_FACTORY !== undefined ||
        (value as { __FRESH_SERIALIZABLE_FUNCTION?: unknown }).__FRESH_SERIALIZABLE_FUNCTION !==
          undefined;
      if (isSerializable) {
        if (record) (group ??= []).push({ event: key, handler: value });
        // preact-render-to-string skips `on*` props naturally; for any
        // other function-valued prop, drop it so we don't emit garbage.
        if (!isEventName(key)) delete props[key];
        continue;
      }
      // An unmarked function on an `on*` prop at the page level (we only
      // reach this branch when `!hasIslandOwner`). The handler has no way to
      // survive into the hydrated page — fail loudly so the developer
      // moves the handler into an island or wraps it with `setFromProp()`.
      // Re-throw the JSX call-site Error captured by the creation hook
      // (if available) so the stack points at the user's code, not at
      // preact's diff machinery.
      if (isEventName(key)) {
        const msg = `Cannot server-render a function event handler for \`${key}\` on a \`${String(
          vnode.type,
        )}\` element at the page level. Move the element into an island, or use a serializable handler from \`fresh/events\` (e.g. \`${key}={setFromProp(signal, "value")}\`).`;
        const created = (vnode as unknown as { __fError?: Error }).__fError;
        if (created) {
          created.message = msg;
          throw created;
        }
        throw new TypeError(msg);
      }
    }
  }
  if (bindings) props["f-s"] = JSON.stringify(bindings);
  if (group) {
    const groupIdx = state.events.push(group) - 1;
    props["f-eh"] = String(groupIdx);
  }
}

/**
 * Cheap detector for JSX event-prop names: `on` followed by an uppercase
 * letter. Matches `onInput`, `onChange`, `onClick`, …; doesn't trigger on
 * `onlyChild`, `ondemand`, or random words that happen to start with `on`.
 */
function isEventName(name: string): boolean {
  return name.length > 2 && name[0] === "o" && name[1] === "n" && name[2] >= "A" && name[2] <= "Z";
}

/**
 * Walk `vnode.props.children` and replace any direct signal child with a
 * `<SignalNode>` wrapper. Each wrapped signal gets a stable index in
 * `state.signals`; the rendered output sandwiches `signal.peek()` between
 * `<!--fresh-signal:N-->` markers so the client can hydrate the exact text
 * range with a subscribing component.
 */
function wrapSignalChildren(vnode: VNode): void {
  const props = vnode.props as { children?: ComponentChildren };
  const children = props.children;
  if (children == null) return;
  // `insideIsland` is captured at vnode CREATION time by scanning the
  // ownerStack — that's the only moment when we know whether the signal
  // is being placed by the page or by an island's render. We snapshot it
  // into the SignalNode props so the render-time path (where the stack
  // has changed) can still make the right call.
  const insideIsland = currentRender !== null && isOwnerStackInsideIsland(currentRender);
  if (isSignal(children)) {
    props.children = h(SignalNode, { signal: children, insideIsland });
    return;
  }
  if (Array.isArray(children)) {
    let changed = false;
    const next: ComponentChild[] = [];
    for (const c of children as ComponentChild[]) {
      if (isSignal(c)) {
        changed = true;
        next.push(h(SignalNode, { signal: c, insideIsland }));
      } else {
        next.push(c);
      }
    }
    if (changed) props.children = next;
  }
}

/**
 * Quick "are we in an island right now?" check used at vnode CREATION time,
 * before the vnode has been registered in `owners`. Same predicate
 * `hasIslandOwner` applies at diff time, just scanning the ownerStack
 * directly instead of walking owners.
 */
function isOwnerStackInsideIsland(state: RenderState): boolean {
  for (const owner of state.ownerStack) {
    const t = owner.type;
    if (typeof t === "function") {
      const f = t as unknown as {
        __FRESH_SERIALIZABLE_FUNCTION?: unknown;
        __FRESH_ISLAND_WRAPPER?: unknown;
      };
      if (f.__FRESH_ISLAND_WRAPPER || f.__FRESH_SERIALIZABLE_FUNCTION) return true;
    }
  }
  return false;
}

/**
 * SSR-side component that captures a signal's identity (so it can ride the
 * page state under the same Signal reducer used for island props) and emits
 * its current value between a pair of `<!--fresh-signal:N-->` comment
 * markers the client boot looks for.
 */
function SignalNode(props: { signal: { peek(): unknown }; insideIsland?: boolean }): VNode {
  // Outside a renderPage call (or wrapped at creation time inside an
  // island — where the island's own client-side preact-signals hookup
  // handles reactivity), or outside a `<Partial>` during a partial render
  // (sliced away), just emit the current value with no markers. We use
  // `peek()` to read the value without subscribing — at SSR there's no
  // subscription to wire up and we don't want to leave dangling effects on
  // the render thread.
  if (currentRender === null || props.insideIsland || !shouldRecord(currentRender)) {
    return h(Fragment, null, props.signal.peek() as ComponentChild);
  }
  const idx = currentRender.signals.push(props.signal) - 1;
  return h(
    Fragment,
    null,
    h(Fragment, {
      // @ts-ignore unstable property is not in preact's typings
      UNSTABLE_comment: `fresh-signal:${idx}`,
    }),
    props.signal.peek() as ComponentChild,
    h(Fragment, {
      // @ts-ignore unstable property is not in preact's typings
      UNSTABLE_comment: "/fresh-signal",
    }),
  );
}

/**
 * Build the array of VNodes to inject into `<head>`, in this order:
 * CSS links → modulepreloads → user client entry script → vite client
 * (dev only) → `<RemainingHead/>` (dumps anything `<Head>` collected
 * that the shell didn't consume in-place). When `cfg` is null, only
 * `<RemainingHead/>` is appended — callers that render without a
 * `renderConfig` still get `<Head>` support.
 */
function buildHeadInjections(cfg: RenderConfig | null): ComponentChild[] {
  const out: ComponentChild[] = [];

  if (cfg !== null) {
    // Union all CSS hrefs from every asset bundle (SSR + client + boot).
    const seenCss = new Set<string>();
    const allBundles: ViteAssets[] = [
      ...cfg.ssrAssets,
      ...(cfg.clientAssets ? [cfg.clientAssets] : []),
      ...(cfg.clientBootAssets ? [cfg.clientBootAssets] : []),
    ];
    for (const bundle of allBundles) {
      for (const css of bundle.css ?? []) {
        if (seenCss.has(css.href)) continue;
        seenCss.add(css.href);
        out.push(h("link", { rel: "stylesheet", href: css.href }));
      }
    }

    // Modulepreloads + script for the user client entry's chunk graph.
    if (cfg.clientAssets) {
      const seenJs = new Set<string>();
      for (const js of cfg.clientAssets.js ?? []) {
        if (seenJs.has(js.href)) continue;
        seenJs.add(js.href);
        out.push(h("link", { rel: "modulepreload", href: js.href }));
      }
      if (cfg.clientAssets.entry) {
        out.push(h("script", { type: "module", src: cfg.clientAssets.entry }));
      }
    }

    // Dev-only: Vite's HMR client.
    if (cfg.dev) {
      out.push(
        h("script", {
          type: "module",
          dangerouslySetInnerHTML: { __html: 'import "/@vite/client";' },
        }),
      );
    }
  }

  // Anything `<Head>` collected that isn't consumed in-place by a shell
  // element with a matching cache key. Lives at the END of `<head>` —
  // the shell's own children render first, get a chance to swap, then
  // this dumps the leftovers.
  out.push(h(RemainingHead, null));

  return out;
}

/**
 * Resolve each rendered island / factory specifier through the islands
 * map to a chunk URL, then build the inline `<script type="module">`
 * that reconstructs `data` and drives hydration. No `__FRSH_STATE__`
 * JSON sidecar — the script itself IS the deserializer.
 *
 * `kind` shapes the script:
 *   * `"boot"`    — full page: imports + `const data = …;` + `boot(data);`
 *     (boot is added as an extra import on the boot chunk).
 *   * `"partial"` — partial response: imports + `const data = …;` and *no*
 *     trailing call, tagged with the `PARTIAL_DATA_SCRIPT_ATTR` attribute. The
 *     client locates it by that attribute and appends its own per-navigation
 *     `<unique>(data)` call — never substituting inside the body, so a
 *     serialized value can't inject or corrupt the call.
 *
 * Returns the ordered HTML parts (modulepreloads, stylesheets, the inline
 * script) — the caller decides where to put them (`</head>` for a page, the
 * end of the fragment for a partial).
 */
async function buildRuntimeParts(
  state: RenderState,
  cfg: RenderConfig,
  kind: "boot" | "partial",
): Promise<string[]> {
  const islandsMap = cfg.islands;
  if (!islandsMap) return [];

  // Render every slot the island didn't render inline into its `<template>`
  // HTML, indexed by slot number — ALL of this BEFORE serialization, with the
  // render hooks re-activated (`currentRender = state`), so a templated slot's
  // page-level islands / signals / event handlers are marked and recorded into
  // `state` and ride the serialized payload below (then hydrate client-side once
  // the slot's DOM is grafted). Rendering a slot can surface more slots (a
  // nested island's props), so loop over the growing list rather than a snapshot
  // — nothing is rendered after serialization, where its state would be lost.
  const slotTemplates: string[] = [];
  if (state.slots.some((s) => !s.rendered)) {
    const prevRender = currentRender;
    currentRender = state;
    try {
      for (let i = 0; i < state.slots.length; i++) {
        if (!state.slots[i].rendered) slotTemplates[i] = renderToString(state.slots[i].vnode);
      }
    } finally {
      currentRender = prevRender;
    }
  }

  // Phase 1: serialize the value tree. The serializer collects every
  // logical specifier it needs (island Component exports, factory
  // chunks, plus — implicitly via SIGNAL_HELPER_SPECIFIER — the boot
  // chunk for `signal`) into `ser.imports`, and emits child-before-
  // parent `const _x<n> = …;` declarations for each shared signal /
  // factory result so reference identity survives.
  // The `slot` callback turns a VNode-valued island prop into a `slot(<index>)`
  // call, using the index allocated during render (`wrapSlotProps`). A VNode
  // reached only now — one not allocated during render, i.e. buried inside a
  // non-VNode prop (an object, etc.) rather than passed as a direct prop /
  // array item / `children` — could never be marked or hydrated, so it's a hard
  // error rather than a silently-inert graft.
  const ser = createSerializer({
    slot: (v) => {
      if (!isVNode(v)) return null;
      const idx = state.slotIndex.get(v);
      if (idx === undefined) {
        throw new Error(
          "Cannot serialize JSX nested inside a non-VNode island prop. Pass JSX as a " +
            "direct island prop, an array item, or `children` so it can be rendered as a " +
            "slot — burying it inside an object (or other value) isn't supported.",
        );
      }
      return idx;
    },
  });
  const dataSrc = ser.serialize({
    islands: state.islands.map((inst) => ({
      Component: inst.Component,
      props: inst.props,
    })),
    signals: state.signals,
    events: state.events,
  });
  // The trailing call. A full page imports `boot` and calls it; a partial
  // emits no call (the client appends its own). `aliasFor` appends to the same
  // map, so calling it after `serialize` is fine — boot just gets the next
  // export slot inside whatever module index was assigned to the boot chunk.
  const callLine = kind === "boot" ? `${ser.aliasFor(SIGNAL_HELPER_SPECIFIER, "boot")}(data);` : "";

  // Phase 2: resolve each logical specifier to a real chunk URL.
  // `SIGNAL_HELPER_SPECIFIER` (the boot chunk) resolves through
  // `cfg.clientBootAssets`; every other specifier goes through the SSR
  // islands map.
  const descriptorBySpecifier = new Map<string, ViteAssets | undefined>();
  await Promise.all(
    [...ser.imports.keys()].map(async (specifier) => {
      if (specifier === SIGNAL_HELPER_SPECIFIER) {
        descriptorBySpecifier.set(specifier, cfg.clientBootAssets ?? undefined);
        return;
      }
      const loader = islandsMap.get(specifier);
      const descriptor = loader ? await loader() : undefined;
      descriptorBySpecifier.set(specifier, descriptor);
    }),
  );

  // Sync resolver for `buildImportLines`. Throws on missing chunk URLs
  // so the offending specifier is named in the error.
  const resolveUrl = (specifier: string): string => {
    const descriptor = descriptorBySpecifier.get(specifier);
    if (!descriptor?.entry) {
      throw new Error(
        `Cannot serialize specifier "${specifier}": no client chunk URL. Make sure the module is exported from an islands/ file (or shipped by a fresh runtime entrypoint).`,
      );
    }
    return descriptor.entry;
  };

  const importLines = buildImportLines(ser.imports, resolveUrl);

  // Phase 3: build the page-tail injection. Order:
  //   1. modulepreload <link>s for every dependency chunk (parallel fetch);
  //   2. <link rel="stylesheet"> for any island/factory CSS;
  //   3. the inline <script type="module"> — static imports, shared
  //      `_x<n>` decls, `const data = …;`, then `boot(data);`.
  const parts: string[] = [];
  const seenPreload = new Set<string>();
  const seenCss = new Set<string>();
  const preload = (href: string) => {
    if (seenPreload.has(href)) return;
    seenPreload.add(href);
    parts.push(`<link rel="modulepreload" href="${href}">`);
  };
  for (const descriptor of descriptorBySpecifier.values()) {
    if (!descriptor) continue;
    for (const js of descriptor.js ?? []) preload(js.href);
    if (descriptor.entry) preload(descriptor.entry);
    for (const css of descriptor.css ?? []) {
      if (seenCss.has(css.href)) continue;
      seenCss.add(css.href);
      parts.push(`<link rel="stylesheet" href="${css.href}">`);
    }
  }

  // Inline script body. `dataSrc` is `devalue.uneval` output, which
  // already encodes every `<` inside string literals as `<` (devalue's
  // documented safe-for-<script> guarantee); the surrounding framing is
  // pure JS punctuation, so `</script>` can't appear in the wire.
  // Order: imports → `const data = <uneval-output>;` → the call line
  // (empty for partials — the client appends its own). devalue handles
  // shared-reference dedup internally via IIFE-bound locals, so we don't
  // emit any of our own `const _x<n>` lines.
  // Emit each templated slot, keyed by index, so `slot(<index>)` can graft (and
  // hydrate) its DOM if the island renders the prop later (e.g. conditionally).
  // All were rendered pre-serialization above; the serialize pass allocates no
  // new slots (a VNode it reaches that wasn't pre-allocated is a hard error).
  for (let i = 0; i < slotTemplates.length; i++) {
    if (slotTemplates[i] !== undefined) {
      parts.push(`<template data-fresh-slot="${i}">${slotTemplates[i]}</template>`);
    }
  }

  const scriptBody = [...importLines, `const data=${dataSrc};`, callLine].join("");
  // Partial scripts are tagged so the client can find the one carrying state.
  const attr = kind === "partial" ? ` ${PARTIAL_DATA_SCRIPT_ATTR}` : "";
  parts.push(`<script type="module"${attr}>${scriptBody}</script>`);

  return parts;
}

/**
 * Insert the page boot runtime (modulepreloads + stylesheets + the inline
 * `boot(data)` script) before `</head>`.
 */
async function injectIslandRuntime(
  html: string,
  state: RenderState,
  cfg: RenderConfig,
): Promise<string> {
  if (!cfg.islands || !cfg.clientBootAssets?.entry) return html;
  const parts = await buildRuntimeParts(state, cfg, "boot");
  if (parts.length === 0) return html;
  const injection = parts.join("");
  if (html.includes("</head>")) {
    return html.replace("</head>", injection + "</head>");
  }
  // No </head> (unusual custom shell) — fall back to appending at EOF.
  return html + injection;
}

/**
 * Extract every *top-level* partial region from a rendered HTML string.
 * Each region is the substring from a `<!--fresh-partial:…-->` opener at
 * nesting depth 0 through its matching `<!--/fresh-partial-->`, inclusive
 * of both markers and any nested partial / island markers inside. Nested
 * partials are NOT emitted separately — they ride along inside their
 * enclosing region (the client walks into them).
 */
export function sliceTopLevelPartials(html: string): string[] {
  const open = `<!--${PARTIAL_START_PREFIX}`;
  const close = `<!--${PARTIAL_END}-->`;
  const out: string[] = [];
  let i = 0;
  let depth = 0;
  let regionStart = -1;
  while (i < html.length) {
    const ns = html.indexOf(open, i);
    const ne = html.indexOf(close, i);
    if (ns === -1 && ne === -1) break;
    if (ns !== -1 && (ne === -1 || ns < ne)) {
      // Opener. Advance past its `-->` so a `name` containing `<!--` can't
      // be misread (names are validated marker-safe, but be defensive).
      if (depth === 0) regionStart = ns;
      depth++;
      const end = html.indexOf("-->", ns);
      i = end === -1 ? html.length : end + 3;
    } else {
      // Closer.
      depth = Math.max(0, depth - 1);
      i = ne + close.length;
      if (depth === 0 && regionStart !== -1) {
        out.push(html.slice(regionStart, i));
        regionStart = -1;
      }
    }
  }
  return out;
}

/**
 * Render a page VNode to a *partial* response: just the `<Partial>` regions
 * (with their boundary markers), an optional `<Head>` delta region, and the
 * inline island-state script the client re-injects to hydrate the swapped
 * regions. No document shell.
 *
 * Returns `null` when the page rendered no partial regions — the caller
 * should fall back to a full-page response so the client can do a normal
 * navigation.
 *
 * Only islands/signals/events *inside* a `<Partial>` are recorded (the render
 * runs in `partialMode`): everything outside is sliced away and already
 * hydrated on the live page, so it would be dead weight. Inside-region markers
 * therefore get contiguous, subset-relative indices that match the serialized
 * state.
 */
export async function renderPartial(
  pageVNode: VNode,
  opts: RenderOptions = {},
): Promise<string | null> {
  currentConfig = opts.renderConfig ?? null;
  const state = createRenderState(true);
  currentRender = state;
  let pageHtml: string;
  try {
    pageHtml = renderToString(pageVNode);
  } finally {
    currentConfig = null;
    currentRender = null;
  }

  const regions = sliceTopLevelPartials(pageHtml);
  if (regions.length === 0) return null;

  let fragment = regions.join("");

  // `<Head>` delta — anything collected via `<Head>` during this render,
  // wrapped in its own marker region. `currentRender` is already cleared,
  // so re-rendering the collected entries emits them inline (no re-collect).
  if (state.headEntries.size > 0) {
    const headHtml = renderToString(h(Fragment, null, ...state.headEntries.values()) as VNode);
    fragment += `<!--${HEAD_START}-->${headHtml}<!--${HEAD_END}-->`;
  }

  // Island/signal/event state script (only if anything interactive rendered).
  if (
    (state.islands.length > 0 || state.signals.length > 0 || state.events.length > 0) &&
    opts.renderConfig
  ) {
    const parts = await buildRuntimeParts(state, opts.renderConfig, "partial");
    fragment += parts.join("");
  }

  return fragment;
}
