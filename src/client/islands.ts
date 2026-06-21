// Client-side hydration runtime.
//
// During SSR, every island the server rendered was wrapped in a pair of
// numbered HTML comment markers:
//
//   <!--fresh-island:0-->...island HTML...<!--/fresh-island-->
//
// and every signal rendered directly as JSX children at the page level
// (outside any island) got its own pair:
//
//   <!--fresh-signal:0-->VALUE<!--/fresh-signal-->
//
// The server embedded a `__FRSH_STATE__` payload holding, per island
// instance (indexed by the marker number): the client chunk `url`, the
// `export` name, and the server-rendered `props` — and per signal node a
// signal reference at `signals[N]`.
//
// `boot({islands, signals})`:
//   1. walks for `fresh-island:N` markers, dynamic-imports each island's
//      URL, picks the export, and renders it into a root fragment scoped to
//      the marker pair (Fresh 2's `createRootFragment` trick lets Preact's
//      `render` target a slice of an existing parent without disturbing the
//      surrounding siblings),
//   2. then walks for `fresh-signal:N` markers and replaces each text range
//      with a tiny `<>{signal}</>` wrapper so preact-signals subscribes the
//      text node to the revived signal.
//
// Nested islands: the server renders an island-inside-an-island INLINE — no
// markers, no serialized props — so the only island markers in the HTML are
// top-level ones (they never nest), and the outer island re-creates the inner
// during its own client render.
//
// Limitation of this v1: uses `render`, not `hydrate` — the SSR HTML is
// replaced rather than re-used. Good enough to make interactivity work; cheap
// to swap later.

import { h, render } from "preact";
import type { ComponentType } from "preact";
import type { Signal } from "@preact/signals";
import { walkComments } from "./markers.ts";

/** One island instance, as inlined into the boot script by the server. */
export interface IslandStateEntry {
  /** The Component to hydrate. */
  Component: ComponentType<Record<string, unknown>>;
  /** Props the island was server-rendered with. */
  props: unknown;
}

/**
 * Wire-side description of a single event binding: the JSX prop name
 * (`onClick`, `onInput`, …) and a real handler function. Devalue has
 * already revived the handler through the FactoryFunction reviver (which
 * calls the original `factory(...)` wrapper with revived args), so the
 * client just needs to attach it as a DOM listener — no kind switch, no
 * per-domain dispatch.
 */
export interface EventBinding {
  event: string;
  handler: (e: Event) => void;
}

/** Shape of the devalue-decoded payload the boot module hands to `boot`. */
export interface BootState {
  islands: readonly IslandStateEntry[];
  /** Page-level signals captured for each `<!--fresh-signal:N-->` marker. */
  signals: readonly Signal<unknown>[];
  /**
   * One entry per element marked with `f-eh="<idx>"`. Each entry is the
   * list of every handler on that element (one per `on*` prop). Lookup
   * is a single integer parse + array index, then iterate.
   */
  events: ReadonlyArray<ReadonlyArray<EventBinding>>;
}

interface IslandRoot {
  /** Marker number → index into the state array. */
  idx: number;
  /**
   * User-supplied `key` from the island's vnode, decoded out of the marker
   * comment. `null` for islands rendered without a key. Used by the partial
   * runtime to preserve a live island across a swap when the swapped-in
   * fragment carries a matching key.
   */
  key: string | null;
  start: Comment;
  end: Comment;
}

interface SignalRoot {
  idx: number;
  start: Comment;
  end: Comment;
}

const ISLAND_START_PREFIX = "fresh-island:";
const ISLAND_END = "/fresh-island";
const SIGNAL_START_PREFIX = "fresh-signal:";
const SIGNAL_END = "/fresh-signal";

// The state of the in-progress hydration. A grafted island slot (see
// `client/slot.ts`) reads this to hydrate its own content — the slot's
// page-level islands/signals/events ride the same payload, by the same indices.
let activeBootState: BootState | null = null;

/** The boot state of the in-progress hydration, for slot grafting. */
export function currentBootState(): BootState | null {
  return activeBootState;
}

/**
 * A live island we may be asked to preserve across a partial swap. Recorded
 * here by `hydrateIsland` for every island whose marker carries a key.
 * `rootFrag` is the same fake-element passed to Preact's `render` on initial
 * mount; calling `render(h(Component, nextProps), rootFrag)` again on it diffs
 * the new vnode against the previous one (which Preact stashed on the
 * rootFrag) so the component instance, its hooks, refs, and signals survive —
 * only props that actually changed apply.
 */
interface AliveIsland {
  rootFrag: unknown;
  Component: ComponentType<Record<string, unknown>>;
  /** The start comment the island is anchored to, used as identity by the
   * partial runtime when matching live vs. fragment markers. */
  start: Comment;
  end: Comment;
}

const aliveByKey = new Map<string, AliveIsland>();

/** Look up a live keyed island for partial-swap reuse, or `null` if none. */
export function getKeptIsland(key: string): AliveIsland | null {
  return aliveByKey.get(key) ?? null;
}

/** Drop the bookkeeping for a keyed island that is going away. */
export function forgetKeptIsland(key: string): void {
  aliveByKey.delete(key);
}

/**
 * Re-render an island root that the partial runtime kept alive, updating
 * its props in place. Returns `true` when Preact ran a diff on the kept
 * root, `false` when there was no kept island for `key` (caller falls back
 * to a fresh mount).
 */
export function updateKeptIsland(key: string, props: Record<string, unknown>): boolean {
  const kept = aliveByKey.get(key);
  if (kept === undefined) return false;
  render(h(kept.Component, props), kept.rootFrag as unknown as Element);
  return true;
}

/**
 * Walk the document, pair up island + signal markers, and hydrate each.
 * Islands hydrate first so any signal markers that fell inside an island
 * range (and get blown away by the island's client render) don't trigger
 * spurious work in the signal pass.
 */
export function boot(state: BootState): void {
  activeBootState = state;
  bootRoots(collectRoots(document.body), state);
  // Prop bindings + event bindings run last — every island has already
  // replaced its SSR HTML, so `[f-s]` / `[f-e]` queries naturally skip
  // elements that lived inside an island's range (those nodes are gone).
  hydratePropBindings(Array.from(document.querySelectorAll("[f-s]")), state.signals);
  hydrateEventBindings(Array.from(document.querySelectorAll("[f-eh]")), state.events);
}

/**
 * Hydrate a freshly-swapped partial region. `nodes` are the top-level DOM
 * nodes the client moved into the live document (between a region's boundary
 * markers); this scans them — and their subtrees — for the same
 * island/signal/prop/event markers `boot` looks for, indexing into `state`
 * exactly as `boot` does. Used by the partial-navigation runtime after it
 * applies a region update.
 *
 * The marker indices in a partial response are page-wide (the server doesn't
 * re-index per region in v1), so `state` must be the full payload from the
 * partial's data script.
 */
export function bootNodes(
  nodes: readonly Node[],
  state: BootState,
  /**
   * Start-marker Comments the caller has already taken care of (because the
   * matching island was kept alive across a partial swap and the partial
   * runtime has already pushed new props through `updateKeptIsland`). These
   * are skipped so we don't blow away the live mount with a fresh `render`.
   */
  skipKeptStarts?: ReadonlySet<Comment>,
): void {
  activeBootState = state;
  bootRoots(pairMarkers(gatherComments(nodes)), state, skipKeptStarts);
  // Same ordering as `boot`: island hydration first (above), then bindings,
  // re-scanning the region so `[f-s]`/`[f-eh]` inside an island's range
  // (now replaced by the island's client render) are skipped.
  hydratePropBindings(gatherElements(nodes, "[f-s]"), state.signals);
  hydrateEventBindings(gatherElements(nodes, "[f-eh]"), state.events);
}

/** Shared island+signal hydration over already-paired marker roots. */
function bootRoots(
  roots: { islandRoots: IslandRoot[]; signalRoots: SignalRoot[] },
  state: BootState,
  skipKeptStarts?: ReadonlySet<Comment>,
): void {
  for (const root of roots.islandRoots) {
    if (skipKeptStarts?.has(root.start)) continue;
    const entry = state.islands[root.idx];
    if (!entry) continue;
    hydrateIsland(root, entry);
  }
  for (const root of roots.signalRoots) {
    const sig = state.signals[root.idx];
    if (sig !== undefined) hydrateSignal(root, sig);
  }
}

/** Walk a subtree's comment nodes and pair them into island + signal roots. */
function collectRoots(node: Node): {
  islandRoots: IslandRoot[];
  signalRoots: SignalRoot[];
} {
  return pairMarkers(walkComments(node));
}

/**
 * Collect every comment node within `nodes` (each node inclusive of itself,
 * plus its whole subtree) in document order. Unlike a `TreeWalker` rooted at
 * a single element, this includes top-level comment nodes in the list — a
 * partial region's content can have an island marker (`<!--fresh-island:N-->`)
 * as a direct child.
 */
function gatherComments(nodes: readonly Node[]): Comment[] {
  const out: Comment[] = [];
  const visit = (n: Node) => {
    if (n.nodeType === 8) {
      out.push(n as Comment);
      return;
    }
    for (let c = n.firstChild; c !== null; c = c.nextSibling) visit(c);
  };
  for (const n of nodes) visit(n);
  return out;
}

/** Collect every element matching `selector` within `nodes` (inclusive). */
function gatherElements(nodes: readonly Node[], selector: string): Element[] {
  const out: Element[] = [];
  const visit = (n: Node) => {
    if (n.nodeType !== 1) return;
    const el = n as Element;
    if (el.matches(selector)) out.push(el);
    for (let c = el.firstElementChild; c !== null; c = c.nextElementSibling) visit(c);
  };
  for (const n of nodes) visit(n);
  return out;
}

/**
 * Pair `fresh-island:N` / `fresh-signal:N` start markers with their matching
 * end markers into roots. Markers never nest — a nested island is rendered
 * inline by its parent (no markers; see the file header) and a signal renders
 * to a leaf text value — so at most one of each kind is open at a time and a
 * single "currently open" reference suffices (no stack, no depth).
 */
function pairMarkers(comments: Iterable<Comment>): {
  islandRoots: IslandRoot[];
  signalRoots: SignalRoot[];
} {
  const islandRoots: IslandRoot[] = [];
  const signalRoots: SignalRoot[] = [];
  let openIsland: IslandRoot | null = null;
  let openSignal: SignalRoot | null = null;

  for (const cur of comments) {
    const data = cur.data;
    if (data.startsWith(ISLAND_START_PREFIX)) {
      // Marker format: `fresh-island:<idx>` or `fresh-island:<idx>:<encoded-key>`.
      const rest = data.slice(ISLAND_START_PREFIX.length);
      const colon = rest.indexOf(":");
      const idx = Number(colon === -1 ? rest : rest.slice(0, colon));
      if (!Number.isFinite(idx)) continue;
      let key: string | null = null;
      if (colon !== -1) {
        try {
          key = decodeURIComponent(rest.slice(colon + 1));
        } catch {
          key = rest.slice(colon + 1);
        }
      }
      openIsland = { idx, key, start: cur, end: cur };
      islandRoots.push(openIsland);
    } else if (data === ISLAND_END) {
      if (openIsland !== null) {
        openIsland.end = cur;
        openIsland = null;
      }
    } else if (data.startsWith(SIGNAL_START_PREFIX)) {
      const idx = Number(data.slice(SIGNAL_START_PREFIX.length));
      if (!Number.isFinite(idx)) continue;
      openSignal = { idx, start: cur, end: cur };
      signalRoots.push(openSignal);
    } else if (data === SIGNAL_END) {
      if (openSignal !== null) {
        openSignal.end = cur;
        openSignal = null;
      }
    }
  }

  return { islandRoots, signalRoots };
}

function hydrateIsland(root: IslandRoot, entry: IslandStateEntry): void {
  const Component = entry.Component;
  if (typeof Component !== "function") {
    console.error(`[fresh] island Component at marker #${root.idx} is not a function`);
    return;
  }
  const parent = root.start.parentNode;
  if (!parent) return;
  const container = createRootFragment(parent, root.start, root.end);
  render(
    h(Component, (entry.props ?? {}) as Record<string, unknown>),
    container as unknown as Element,
  );
  if (root.key !== null) {
    aliveByKey.set(root.key, {
      rootFrag: container,
      Component: Component as ComponentType<Record<string, unknown>>,
      start: root.start,
      end: root.end,
    });
  }
}

/**
 * Bind a single text node between the marker pair to the signal — no Preact
 * involved. The SSR emits the peeked value as one text segment between the
 * markers, so in the common case we just reuse the existing node and keep
 * its `.data` in sync via `signal.subscribe`. preact-signals' `subscribe`
 * fires synchronously with the current value, then on every change.
 */
function hydrateSignal(root: SignalRoot, sig: Signal<unknown>): void {
  const parent = root.start.parentNode;
  if (!parent) return;
  // Normalize the slice to exactly one text node. SSR puts the peeked value
  // there as a single text segment, so the first sibling is typically the
  // node we want — but for empty values it's the end marker itself, and
  // anything else (stray whitespace, comments) gets cleared.
  const TEXT_NODE = 3;
  let text = root.start.nextSibling;
  if (text === root.end || (text && text.nodeType !== TEXT_NODE)) {
    text = document.createTextNode("");
    parent.insertBefore(text, root.start.nextSibling);
  } else if (text === null) {
    text = document.createTextNode("");
    parent.insertBefore(text, root.end);
  }
  while (text.nextSibling && text.nextSibling !== root.end) {
    parent.removeChild(text.nextSibling);
  }
  const textNode = text as Text;
  (sig as { subscribe(fn: (v: unknown) => void): () => void }).subscribe((v) => {
    textNode.data = v == null ? "" : String(v);
  });
}

/**
 * Walk every element carrying an `f-s` attribute (the SSR marker for
 * signal-bound props on intrinsic page-level elements), parse its
 * `{propName: signalIndex}` JSON map, and wire each prop to its signal via
 * `subscribe`. The subscriber writes to the DOM through `setProperty`,
 * which mirrors Preact's diff-time prop handling — `value == null` /
 * `value === false` removes the attribute, special-cased props use
 * `setAttribute`, the rest use direct DOM-property assignment.
 */
function hydratePropBindings(els: readonly Element[], signals: readonly Signal<unknown>[]): void {
  for (const el of els) {
    const raw = el.getAttribute("f-s");
    el.removeAttribute("f-s");
    if (!raw) continue;
    let bindings: Record<string, number>;
    try {
      bindings = JSON.parse(raw) as Record<string, number>;
    } catch {
      continue;
    }
    for (const propName of Object.keys(bindings)) {
      const idx = bindings[propName];
      const sig = signals[idx];
      if (sig === undefined) continue;
      // `prev` is only consulted by `setProperty`'s `style` branch (every other
      // prop ignores the old value). For `style` the old value must be the
      // previous style *value* (object/string), never the live
      // `CSSStyleDeclaration` that `el.style` returns — diffing against that
      // would `Object.keys()` its numeric indices and throw on
      // `style["0"] = …`. Start undefined so the first apply has no stale
      // object to clear; reading `el[propName]` for other props is pointless
      // since they don't use it.
      let prev: unknown = undefined;
      sig.subscribe((next: unknown) => {
        setProperty(el as Element, propName, next, prev);
        prev = next;
      });
    }
  }
}

/**
 * Walk every element carrying an `f-eh` attribute and attach a DOM event
 * listener for each binding in that element's group. `f-eh` is a single
 * integer index into `state.events`; each entry in the looked-up group
 * is `{event, handler}` — the handler is a real function devalue revived
 * through the FactoryFunction reviver (the SSR side captured it via
 * `fresh/events`'s `factory(...)` wrappers, the client just re-invoked
 * the same wrapper with revived args).
 *
 * Prop name → DOM event name is the same conversion Preact uses
 * internally: strip a leading `on` and lowercase the rest
 * (`onInput` → `input`).
 */
function hydrateEventBindings(
  els: readonly Element[],
  events: ReadonlyArray<ReadonlyArray<EventBinding>>,
): void {
  for (const el of els) {
    const raw = el.getAttribute("f-eh");
    el.removeAttribute("f-eh");
    if (!raw) continue;
    const groupIdx = Number(raw);
    if (!Number.isFinite(groupIdx)) continue;
    const group = events[groupIdx];
    if (group === undefined) continue;
    for (const binding of group) {
      const eventName = binding.event.replace(/^on/, "").toLowerCase();
      el.addEventListener(eventName, binding.handler);
    }
  }
}

/**
 * Direct port of Preact's `setProperty`
 * ([node_modules/preact/src/diff/props.js](preact/src/diff/props.js)) — events
 * dropped (signals don't bind to listeners), but style objects and SVG
 * namespace normalization preserved. The behaviour matches Preact's prop
 * diff at runtime: same `value == null`, `value === false`, special-case
 * attribute list, aria-attr carve-out, and direction-of-write rules. That's
 * what "the same as Preact" means for these subscribers — including the
 * style-object diff and the SVG `className → class` / `xlink:href → href`
 * rewrites Preact applies inside `SVG_NAMESPACE`.
 */
const SVG_NAMESPACE = "http://www.w3.org/2000/svg";
// Preact's regex for CSS properties that should NOT have `px` appended to
// numeric values. Verbatim from `node_modules/preact/src/constants.js`.
const IS_NON_DIMENSIONAL = /acit|ex(?:s|g|n|p|$)|rph|grid|ows|mnc|ntw|ine[ch]|zoo|^ord|itera/i;

function setStyle(style: CSSStyleDeclaration, key: string, value: unknown): void {
  if (key[0] === "-") {
    style.setProperty(key, value == null ? "" : String(value));
  } else if (value == null) {
    (style as unknown as Record<string, string>)[key] = "";
  } else if (typeof value !== "number" || IS_NON_DIMENSIONAL.test(key)) {
    (style as unknown as Record<string, unknown>)[key] = value;
  } else {
    (style as unknown as Record<string, string>)[key] = value + "px";
  }
}

function setProperty(dom: Element, name: string, value: unknown, oldValue: unknown): void {
  const namespace = dom.namespaceURI;
  if (name === "style") {
    if (typeof value === "string") {
      (dom as HTMLElement).style.cssText = value;
    } else {
      if (typeof oldValue === "string") {
        (dom as HTMLElement).style.cssText = "";
        oldValue = undefined;
      }
      if (oldValue && typeof oldValue === "object") {
        for (const k of Object.keys(oldValue as Record<string, unknown>)) {
          if (!(value && typeof value === "object" && k in (value as Record<string, unknown>))) {
            setStyle((dom as HTMLElement).style, k, "");
          }
        }
      }
      if (value && typeof value === "object") {
        for (const k of Object.keys(value as Record<string, unknown>)) {
          const v = (value as Record<string, unknown>)[k];
          if (!oldValue || v !== (oldValue as Record<string, unknown>)[k]) {
            setStyle((dom as HTMLElement).style, k, v);
          }
        }
      }
    }
    return;
  }

  // SVG-specific prop normalisation (Preact does this inline before the
  // "name in dom" check):
  //   xlink:href / xlinkHref → href  (xlink:href is deprecated)
  //   className              → class
  if (namespace === SVG_NAMESPACE) {
    name = name.replace(/xlink(H|:h)/, "h").replace(/sName$/, "s");
  }

  // Preact treats these as attributes even though they exist on the DOM
  // element, because property semantics diverge from attribute semantics
  // (e.g. `tabIndex` defaults to -1 as a property, '' as an attribute).
  if (
    name !== "width" &&
    name !== "height" &&
    name !== "href" &&
    name !== "list" &&
    name !== "form" &&
    name !== "tabIndex" &&
    name !== "download" &&
    name !== "rowSpan" &&
    name !== "colSpan" &&
    name !== "role" &&
    name !== "popover" &&
    name in dom
  ) {
    try {
      (dom as unknown as Record<string, unknown>)[name] = value == null ? "" : value;
      return;
    } catch {
      /* fall through to setAttribute */
    }
  }

  if (typeof value === "function") {
    // Never serialize functions as attribute values (defensive — signals
    // shouldn't carry function values, but Preact has this branch too).
    return;
  }
  // Preact preserves `false` for `aria-…` attrs (the attribute is
  // semantically "present + false-valued") but treats `false` as removal
  // for everything else. Detected via `name[4] === '-'` (cheap aria-test).
  if (value != null && (value !== false || name[4] === "-")) {
    dom.setAttribute(name, name === "popover" && value === true ? "" : (value as string));
  } else {
    dom.removeAttribute(name);
  }
}

/**
 * Fake "element" that delegates to `parent` but only sees the slice of
 * children between `startMarker` and `endMarker`. Lets Preact's `render`
 * mount into a slice of an existing tree.
 *
 * Adapted from Fresh 2's `createRootFragment` (packages/fresh/src/runtime/client/reviver.ts).
 */
function createRootFragment(parent: Node, startMarker: Comment, endMarker: Comment): unknown {
  const rootFrag = {
    _frshRootFrag: true,
    nodeType: 1,
    parentNode: parent,
    nextSibling: null as Node | null,
    get firstChild(): Node | null {
      const child = startMarker.nextSibling;
      if (child === endMarker) return null;
      return child;
    },
    get childNodes(): Node[] {
      const children: Node[] = [];
      let child = startMarker.nextSibling;
      while (child !== null && child !== endMarker) {
        children.push(child);
        child = child.nextSibling;
      }
      return children;
    },
    insertBefore(node: Node, ref: Node | null) {
      (parent as Element).insertBefore(node, ref ?? endMarker);
    },
    appendChild(child: Node) {
      // Insert before the end marker rather than appending to `parent`, so
      // sibling islands that share a parent stay correctly ordered.
      (parent as Element).insertBefore(child, endMarker);
    },
    removeChild(child: Node) {
      (parent as Element).removeChild(child);
    },
    contains(node: Node | null): boolean {
      if (node === null) return false;
      for (const child of rootFrag.childNodes) {
        if (child === node || (child as Element).contains?.(node)) {
          return true;
        }
      }
      return false;
    },
  };
  return rootFrag;
}
