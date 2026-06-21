// Client-side partial navigation runtime, built on the Navigation API.
//
// Installed (once) when this module is imported — which happens via the boot
// chunk (`fresh/internal/client`) on any page that either rendered islands or
// opted into client navigation with `f-client-nav`. It intercepts same-origin
// navigations that originate inside an `f-client-nav` region (link clicks and
// form submissions) plus back/forward traversals, refetches the same URL with
// a `Fresh-Partial` request header, and swaps the matching live `<Partial>`
// regions in place (re-hydrating any islands inside them) instead of a full
// load.
//
// Why the Navigation API: a single `navigate` event covers clicks, form
// submits, and history traversal, and `event.intercept()` manages the history
// entry, scroll restoration, focus reset, and an `AbortSignal` for us — all
// the bookkeeping a hand-rolled click + popstate interceptor has to do by
// hand. It's Baseline (Chrome/Edge/Firefox/Safari) as of early 2026; on older
// browsers `navigation` is absent and links simply do full-page navigation.
//
// Per-region opt-in: `NavigateEvent.sourceElement` gives us the element that
// initiated the navigation (the `<a>`, or a form's submitter/`<form>`), so the
// handler walks up from it to decide whether the navigation started inside an
// `f-client-nav` region — no separate click/submit bookkeeping needed.
//
// State hand-off (strategy A): the server's data script is the same shape as a
// full-page boot script (static `import`s of island chunks + `const data =
// <uneval>`), but with NO trailing call — just `const data`. We can't run a
// parsed-but-not-inserted module script, so we extract its body (located by the
// `data-fresh-partial` attribute), APPEND a call to a per-navigation unique
// global we define (which hydrates the just-swapped nodes), and inject the
// combined script so the browser runs it natively (re-using cached chunks).
// Appending — never substituting inside the body — means a serialized value
// that happens to contain the global's name can't corrupt or hijack the call.

import { options, type VNode } from "preact";
import { bootNodes, type BootState, forgetKeptIsland, updateKeptIsland } from "./islands.ts";
import { navSettled, navStarted } from "../runtime/navigation.ts";
import { HEAD_KEY_ATTR, headDedupeSelector } from "./head-dedupe.ts";
import { walkComments } from "./markers.ts";
import {
  CLIENT_NAV_ATTR,
  HEAD_END,
  HEAD_START,
  normalizeClientNavProps,
  PARTIAL_ATTR,
  PARTIAL_DATA_SCRIPT_ATTR,
  PARTIAL_END,
  PARTIAL_HEADER,
  parsePartialMarker,
  type PartialMode,
} from "../runtime/partial.ts";

/** A partial region parsed out of a server fragment response. */
interface FragmentRegion {
  name: string;
  mode: PartialMode;
  /** Parsed nodes strictly between the region's boundary markers. */
  nodes: Node[];
}

/** A matched partial region in the live document. */
interface LiveRegion {
  start: Comment;
  end: Comment;
}

const COMMENT_NODE = 8;
const ELEMENT_NODE = 1;

const ISLAND_START_PREFIX = "fresh-island:";
const ISLAND_END_COMMENT = "/fresh-island";

interface ParsedIslandMarker {
  /** State-array index. */
  idx: number;
  /** User-supplied `key` from the island vnode, decoded. `null` when absent. */
  key: string | null;
}

/** Parse a `fresh-island:<idx>[:<encoded-key>]` start marker. */
function parseIslandMarker(data: string): ParsedIslandMarker | null {
  if (!data.startsWith(ISLAND_START_PREFIX)) return null;
  const rest = data.slice(ISLAND_START_PREFIX.length);
  const colon = rest.indexOf(":");
  const idx = Number(colon === -1 ? rest : rest.slice(0, colon));
  if (!Number.isFinite(idx)) return null;
  if (colon === -1) return { idx, key: null };
  const raw = rest.slice(colon + 1);
  try {
    return { idx, key: decodeURIComponent(raw) };
  } catch {
    return { idx, key: raw };
  }
}

/** Find the matching `/fresh-island` end marker for an island's start. */
function findIslandEnd(start: Comment): Comment | null {
  for (let n = start.nextSibling; n !== null; n = n.nextSibling) {
    if (n.nodeType === COMMENT_NODE && (n as Comment).data === ISLAND_END_COMMENT) {
      return n as Comment;
    }
  }
  return null;
}

// Fresh's per-history-entry bookkeeping lives under one `__fresh` key on the
// Navigation API entry state, so we touch the host's state object once and
// leave any other keys alone.
const FRESH_STATE_KEY = "__fresh";

interface FreshEntryState {
  // The URL the entry was *fetched* from when it differs from the committed URL
  // (an `f-partial` override). On a later back/forward traverse to this entry we
  // re-fetch from here, not from the committed URL — otherwise the swapped
  // content wouldn't match how the entry was first built.
  fetchUrl?: string;
}

/** Read Fresh's `__fresh` bookkeeping off a Navigation API entry state. */
function readFreshState(state: unknown): FreshEntryState | null {
  if (state === null || typeof state !== "object") return null;
  const fresh = (state as Record<string, unknown>)[FRESH_STATE_KEY];
  return fresh !== null && typeof fresh === "object" ? (fresh as FreshEntryState) : null;
}

let installed = false;
let navApi: Navigation | null = null;

/**
 * Install the Navigation API interception. Idempotent; a no-op outside the
 * browser or when the Navigation API is unavailable (links then do normal
 * full-page navigation).
 */
export function installPartials(): void {
  if (installed || typeof document === "undefined") return;
  // `navigation` is typed as always-present by the DOM lib, but it's absent on
  // browsers without the Navigation API — guard at runtime.
  const nav: Navigation | undefined = globalThis.navigation;
  if (!nav) return;
  installed = true;
  navApi = nav;
  installClientNavCoercion();
  nav.addEventListener("navigate", onNavigate);
}

/**
 * Chain Preact's vnode-creation hook to coerce a boolean `f-client-nav` to its
 * string form on client-created intrinsic elements (e.g. inside an island that
 * re-renders) — the mirror of the server render hook, so Preact never drops a
 * `false` and silently defeats an in-island opt-out.
 */
function installClientNavCoercion(): void {
  const prev = options.vnode;
  options.vnode = (vnode: VNode) => {
    if (vnode && typeof vnode.type === "string") {
      normalizeClientNavProps(vnode.props as Record<string, unknown>);
    }
    prev?.(vnode);
  };
}

/**
 * Persist the URL an `f-partial` entry was fetched from on its history entry
 * (best effort), so a later back/forward traverse re-fetches the same content —
 * the entry's committed URL differs from the URL its content came from.
 */
function rememberFetchUrl(fetchUrl: string): void {
  if (navApi === null) return;
  try {
    const cur = navApi.currentEntry?.getState();
    const base = cur !== null && typeof cur === "object" ? (cur as Record<string, unknown>) : {};
    const fresh: FreshEntryState = { fetchUrl };
    navApi.updateCurrentEntry({ state: { ...base, [FRESH_STATE_KEY]: fresh } });
  } catch {
    // updateCurrentEntry can throw mid-transition; a later traverse then just
    // re-fetches the committed URL instead of the override — still same-document.
  }
}

/** Read a stored `f-partial` fetch-URL override off a history entry, if any. */
function storedFetchUrl(index: number): string | null {
  if (navApi === null) return null;
  const fresh = readFreshState(navApi.entries()[index]?.getState());
  return fresh !== null && typeof fresh.fetchUrl === "string" ? fresh.fetchUrl : null;
}

// Auto-install on import — the boot chunk pulls this module in, so any page
// shipping the client runtime gets partial navigation wired up.
installPartials();

// ---------- navigate interception --------------------------------------

function onNavigate(event: NavigateEvent): void {
  // The API already filters cross-origin / modified-click navigations out of
  // `canIntercept`. Skip downloads and pure in-page hash changes too.
  if (!event.canIntercept || event.downloadRequest !== null || event.hashChange) {
    return;
  }

  let method = "get";
  let body: FormData | null = null;
  // The URL to fetch the partial from when it differs from the committed URL
  // (an `f-partial` override, or — on traverse — the override stored when the
  // entry was first built). Null ⇒ fetch the navigated URL itself.
  let fetchOverride: string | null = null;
  const isTraverse = event.navigationType === "traverse";

  if (event.navigationType === "reload") {
    return;
  } else if (isTraverse) {
    // Back/forward: only an entry belonging to THIS document (its initial entry
    // plus the ones it created via partial navigation) can be restored by
    // swapping regions into the live DOM. `destination.sameDocument` is the
    // browser's authoritative answer; a cross-document target must be a full
    // load. We can't just bail: a *declined* same-document traverse still
    // commits (the URL moves) but leaves the DOM untouched, so the page would
    // look stuck. Intercepting and reloading reloads the now-committed URL.
    if (!event.destination.sameDocument) {
      event.intercept({
        handler: () => {
          location.reload();
          return Promise.resolve();
        },
      });
      return;
    }
    // Re-fetch from the same URL this entry was originally built from if it
    // used an `f-partial` override; otherwise the committed URL.
    fetchOverride = storedFetchUrl(event.destination.index);
  } else {
    // push / replace from a click or form submit — require the navigation to
    // have started inside an `f-client-nav` region.
    if (!clientNavEnabledFor(event.sourceElement)) return;
    // A form submission carries its payload in `formData` — the Navigation API
    // only populates it for a POST submission (a GET serialises its fields into
    // the URL instead). Its presence is authoritative, so we forward it as a
    // POST; `event.destination.url` already reflects a submitter's `formaction`
    // override. (A submitter that overrides a GET form to POST via `formmethod`
    // is a Chromium gap — it performs the POST but leaves `event.formData` null,
    // so we can't recover the body; such a submit falls through to a full load.)
    if (event.formData !== null) {
      method = "post";
      body = event.formData;
    }
    // `f-partial` on the link / form / submitter overrides where the partial is
    // fetched from. The history entry still lands on the navigated URL; only the
    // request target changes. Resolve relative to the document base.
    const override = partialFetchUrl(event.sourceElement);
    if (override !== null) fetchOverride = new URL(override, document.baseURI).href;
  }

  const destUrl = new URL(event.destination.url);
  const fetchUrl = fetchOverride !== null ? new URL(fetchOverride) : destUrl;

  // Fetch + apply the partial. `controller` is the precommit controller when the
  // browser supports `precommitHandler` (below); it lets us retarget a server
  // redirect BEFORE the navigation commits. Without it we fall back to rewriting
  // the committed URL after the fact.
  const apply = async (controller: NavigationPrecommitController | null): Promise<void> => {
    // Flip the `navigating` signal on for the duration of the swap so islands
    // can render a loading indicator; the `finally` guarantees it settles even
    // on a thrown error or an aborted (superseded) navigation.
    navStarted();
    try {
      const { applied, redirectedTo } = await fetchAndApply(fetchUrl, method, body, event.signal);
      if (applied) {
        if (!isTraverse) {
          if (fetchOverride !== null) {
            // `f-partial` deliberately decouples the committed URL (the
            // navigated `href`) from the fetched URL — so a redirect of the
            // override fetch must NOT retarget the committed URL. Remember the
            // override on the *navigated* entry so a later traverse re-fetches
            // (and re-redirects) identically. This must run post-commit, when
            // `currentEntry` is that entry — in the precommit path defer via
            // `addHandler`; the fallback `handler` path is already post-commit.
            if (controller !== null) {
              controller.addHandler(() => {
                rememberFetchUrl(fetchOverride);
                return Promise.resolve();
              });
            } else {
              rememberFetchUrl(fetchOverride);
            }
          } else if (redirectedTo !== null && redirectedTo !== event.destination.url) {
            // With no override the committed URL IS the fetch URL, so a server
            // redirect moves the entry to the redirect target. Retarget the
            // in-flight navigation when we can — the request URL never commits,
            // so the redirect target takes its place under the navigation's own
            // history disposition (a link click stays a push, keeping the origin
            // entry). Otherwise the request URL already committed, so rewrite it
            // in place.
            if (controller !== null) {
              controller.redirect(redirectedTo);
            } else {
              correctCommittedUrl(redirectedTo);
            }
          }
        }
      } else if (!event.signal.aborted) {
        // No matching partials (e.g. navigated to a page without them) — let the
        // browser complete it as a normal navigation. With an `f-partial`
        // override the committed URL (`href`) is authoritative; otherwise follow
        // any redirect target. Don't override a navigation that superseded us
        // (its abort fired our signal).
        fullNav(fetchOverride !== null ? destUrl : new URL(redirectedTo ?? destUrl.href));
      }
    } catch {
      if (!event.signal.aborted) fullNav(destUrl);
    } finally {
      navSettled();
    }
  };

  // Prefer `precommitHandler` (Baseline 2026) so a server redirect can be
  // committed at its true URL via `controller.redirect()`, with no post-commit
  // history rewrite. Fall back to the post-commit `handler` where it's absent.
  if (typeof globalThis.NavigationPrecommitController !== "undefined") {
    event.intercept({ precommitHandler: (controller) => apply(controller) });
  } else {
    event.intercept({ handler: () => apply(null) });
  }
}

/**
 * Resolve the nearest `f-client-nav` setting on `el`'s ancestor chain: `true`
 * to opt in, `false` to opt back out, or `null` if nothing on the path mentions
 * it.
 */
function clientNavSetting(el: Element | null): boolean | null {
  for (let cur: Element | null = el; cur !== null; cur = cur.parentElement) {
    if (cur.hasAttribute(CLIENT_NAV_ATTR)) {
      return cur.getAttribute(CLIENT_NAV_ATTR) !== "false";
    }
  }
  return null;
}

/**
 * Whether the navigation initiated by `source` is client-nav enabled. The
 * initiating element's ancestors win (so a setting closest to it — e.g. an
 * opt-out on one submit button — takes precedence); if nothing on that path
 * mentions `f-client-nav`, fall back to the associated form's region. That last
 * step is what lets an *external* submitter (a `<button form="…">` placed
 * outside its form) inherit the form's opt-in.
 */
function clientNavEnabledFor(source: Element | null): boolean {
  const direct = clientNavSetting(source);
  if (direct !== null) return direct;
  const form = ownerForm(source);
  if (form !== null && form !== source) {
    const viaForm = clientNavSetting(form);
    if (viaForm !== null) return viaForm;
  }
  return false;
}

/**
 * The `<form>` a navigation's source element submits: the element itself if it
 * is a form, else its owner form via the `.form` IDL property — which resolves
 * *external* submitters declared with `form="…"` — falling back to the nearest
 * ancestor form.
 */
function ownerForm(source: Element | null): HTMLFormElement | null {
  if (source === null) return null;
  if (source instanceof HTMLFormElement) return source;
  const associated = (source as { form?: HTMLFormElement | null }).form;
  return associated ?? source.closest("form");
}

/**
 * Resolve an `f-partial` fetch-URL override from the navigation's source
 * element: the initiating element itself (a link, or a form's submitter) or,
 * for a submission, the owning `<form>`. Returns the raw attribute value
 * (resolved against the document base by the caller), or null when absent.
 */
function partialFetchUrl(source: Element | null): string | null {
  if (source === null) return null;
  const direct = source.getAttribute(PARTIAL_ATTR);
  if (direct !== null && direct !== "") return direct;
  const onForm = ownerForm(source)?.getAttribute(PARTIAL_ATTR) ?? null;
  return onForm !== null && onForm !== "" ? onForm : null;
}

/** Outcome of a partial fetch-and-apply. */
interface ApplyResult {
  /** Whether at least one live region was updated from the response. */
  applied: boolean;
  /**
   * The final response URL when the fetch followed a same-origin server
   * redirect, else `null`. The caller corrects the committed history entry to
   * this (the entry currently sits at the request URL).
   */
  redirectedTo: string | null;
}

/**
 * Fetch the partial response and apply it. `applied` is `false` when there was
 * nothing to apply (caller falls back to a full navigation). Lets abort errors
 * propagate so the caller can distinguish them from real failures.
 */
async function fetchAndApply(
  destUrl: URL,
  method: string,
  body: FormData | null,
  signal: AbortSignal,
): Promise<ApplyResult> {
  // Fetch the navigated URL as-is — the partial signal rides a request header,
  // not the URL — and force same-origin mode so `Sec-Fetch-Mode: same-origin`
  // (which the server validates).
  const init: RequestInit = {
    headers: { accept: "text/html", [PARTIAL_HEADER]: "true" },
    credentials: "same-origin",
    mode: "same-origin",
    signal,
  };
  if (body !== null) {
    init.method = method.toUpperCase();
    init.body = body;
  }
  const res = await fetch(destUrl.href, init);
  // A server redirect (e.g. a POST handler issuing a 303 to its result page)
  // is followed transparently; `res.url` is the final, post-redirect URL. Only
  // honour same-origin targets (cross-origin can't be a partial swap anyway).
  const redirectedTo =
    res.redirected && new URL(res.url).origin === location.origin ? res.url : null;
  const ct = res.headers.get("content-type") ?? "";
  if (!res.ok || !ct.includes("text/html")) return { applied: false, redirectedTo };
  const text = await res.text();
  return { applied: await applyResponse(text), redirectedTo };
}

function fullNav(url: URL): void {
  location.href = url.href;
}

/**
 * Replace the committed history entry's URL in place (redirect correction).
 * The Navigation API has no way to retarget an in-flight navigation, so we use
 * `history.replaceState` — which updates the current entry's URL and is
 * reflected back through `navigation.currentEntry`. Preserves the existing
 * state; `markCurrentEntryFresh` stamps our bookkeeping afterwards.
 */
function correctCommittedUrl(url: string): void {
  try {
    history.replaceState(history.state, "", url);
  } catch {
    // Best effort — if the platform rejects replaceState mid-navigation the
    // worst case is the address bar shows the request URL instead of the
    // redirect target; the swapped content is still correct.
  }
}

// ---------- applying a partial response --------------------------------

/**
 * Parse a fragment response, swap every matching region into the live page,
 * sync the `<Head>` delta, and hydrate the swapped nodes. Resolves `false` when
 * nothing applied (the caller falls back to a full navigation).
 *
 * When the response carries island state we load its chunk imports FIRST and
 * only then swap the DOM + hydrate — so the new content never appears in an
 * un-hydrated state (and the `navigating` signal stays on until it's live).
 */
async function applyResponse(text: string): Promise<boolean> {
  // Parse via a <template>, not DOMParser: a fragment response leads with a
  // `<!--fresh-partial:…-->` comment, and DOMParser's full-document parser
  // hoists a leading comment to the document level (outside <body>), so a
  // body-children scan would miss it. <template> parses in fragment context,
  // keeping every top-level node (comments included) as a direct child of its
  // inert content fragment — and scripts in there don't execute.
  const tpl = document.createElement("template");
  tpl.innerHTML = text;
  const root = tpl.content;

  const regions = collectFragmentRegions(root);
  if (regions.length === 0) return false;

  // Match each fragment region to its live counterpart up front, before
  // mutating anything; bail if none match.
  const pending: Array<{ region: FragmentRegion; live: LiveRegion }> = [];
  for (const region of regions) {
    const live = findLiveRegion(region.name);
    if (live) pending.push({ region, live });
    else console.warn(`[fresh] <Partial name="${region.name}"> not found on the current page`);
  }
  if (pending.length === 0) return false;

  // Bookkeeping for keyed-island survival: `keptStarts` is the set of live
  // start markers that the apply step moved into the swapped region (instead
  // of remounting), and `propUpdates` lines each one up with the new state
  // index so we can push fresh props through `updateKeptIsland` once chunks
  // have loaded.
  const keptStarts = new Set<Comment>();
  const propUpdates: KeptPropUpdate[] = [];

  // The actual mutation: swap each matched region into the live DOM and sync
  // the `<Head>` delta, returning the moved nodes to hydrate. Deferred so it can
  // run after the island chunks have loaded.
  const commit = (): Node[] => {
    const moved: Node[] = [];
    for (const { region, live } of pending) {
      applyRegion(live, region, moved, keptStarts, propUpdates);
    }
    syncHead(root);
    return moved;
  };

  const scriptBody = extractDataScriptBody(root);
  if (scriptBody === null) {
    // No island state — nothing to load, so swap straight away. No island
    // survival is possible here either (no boot state to read new props from).
    commit();
    return true;
  }
  // Load the island chunks first, then commit + hydrate atomically.
  return runHydrationScript(scriptBody, commit, keptStarts, propUpdates);
}

interface KeptPropUpdate {
  /** Live start marker that the apply step kept in place. */
  start: Comment;
  /** State-array index of the fragment-side marker that matched. */
  newIdx: number;
  /** The `key` shared by both sides; used to address the kept root. */
  key: string;
}

/** Collect the top-level partial regions out of a parsed fragment. */
function collectFragmentRegions(root: ParentNode): FragmentRegion[] {
  const out: FragmentRegion[] = [];
  let node: Node | null = root.firstChild;
  while (node !== null) {
    const parsed =
      node.nodeType === COMMENT_NODE ? parsePartialMarker((node as Comment).data) : null;
    if (parsed === null) {
      node = node.nextSibling;
      continue;
    }
    // The region runs from this open marker to its matching close (shared with
    // `findLiveRegion`'s lookup); collect every node strictly between them, so a
    // nested partial's markers + content ride along.
    const open = node as Comment;
    const end = findMatchingEnd(open);
    const nodes: Node[] = [];
    for (let n = open.nextSibling; n !== null && n !== end; n = n.nextSibling) nodes.push(n);
    out.push({ name: parsed.name, mode: parsed.mode, nodes });
    // Resume after the close (or stop if there wasn't one — a malformed tail).
    node = end !== null ? end.nextSibling : null;
  }
  return out;
}

/** Find a live region's boundary markers by name. */
function findLiveRegion(name: string): LiveRegion | null {
  for (const c of walkComments(document.body)) {
    const parsed = parsePartialMarker(c.data);
    if (parsed !== null && parsed.name === name) {
      const end = findMatchingEnd(c);
      if (end !== null) return { start: c, end };
    }
  }
  return null;
}

/**
 * Walk forward over siblings from an opening partial marker to its matching
 * close, tracking partial nesting so an inner region's close doesn't end the
 * outer one. Shared by the live-DOM region lookup and fragment parsing.
 */
function findMatchingEnd(start: Comment): Comment | null {
  let depth = 1;
  for (let n = start.nextSibling; n !== null; n = n.nextSibling) {
    if (n.nodeType !== COMMENT_NODE) continue;
    const d = (n as Comment).data;
    if (parsePartialMarker(d) !== null) {
      depth++;
    } else if (d === PARTIAL_END) {
      depth--;
      if (depth === 0) return n as Comment;
    }
  }
  return null;
}

/**
 * Swap (or extend) a live region with a fragment region's content.
 *
 * In `replace` mode the live region is scanned for keyed island markers
 * (`<!--fresh-island:N:key-->`). For each whose `key` is also present in the
 * incoming fragment, the live nodes are reused: they're detached from the
 * live DOM and spliced into the fragment in place of the matching keyed
 * marker pair + content, so when the fragment is inserted the same Preact
 * root sits at the new location. `keptStarts` records the live start
 * markers we kept, and `propUpdates` lines each one up with the fragment's
 * state-array index so the post-commit step can push new props through
 * `updateKeptIsland`. Append/prepend modes don't harvest — they only add to
 * the live region, so there's nothing to preserve from it.
 */
function applyRegion(
  live: LiveRegion,
  region: FragmentRegion,
  moved: Node[],
  keptStarts: Set<Comment>,
  propUpdates: KeptPropUpdate[],
): void {
  const parent = live.start.parentNode;
  if (parent === null) return;

  const frag = document.createDocumentFragment();
  for (const n of region.nodes) frag.appendChild(document.importNode(n, true));

  if (region.mode === "replace") {
    spliceKeyedIslands(live, frag, keptStarts, propUpdates);
  }

  const newNodes = Array.from(frag.childNodes);

  if (region.mode === "replace") {
    removeBetween(live.start, live.end);
    parent.insertBefore(frag, live.end);
  } else if (region.mode === "append") {
    parent.insertBefore(frag, live.end);
  } else {
    // prepend
    parent.insertBefore(frag, live.start.nextSibling);
  }

  for (const n of newNodes) moved.push(n);
}

/**
 * For every keyed island the fragment carries whose key matches a keyed
 * island in the live region, lift the live nodes out and drop them into the
 * fragment where the matching marker pair sat. Lets the live Preact root
 * survive the surrounding `removeBetween` (the live nodes aren't in the
 * range anymore by the time it runs) and ride back into place with the
 * rest of the fragment.
 *
 * Live keyed islands the fragment doesn't claim are unmounted: their DOM is
 * about to disappear with the surrounding region, so we run a final
 * `render(null, …)` via `forgetKeptIsland`'s caller path to clear Preact's
 * bookkeeping before dropping the entry.
 */
function spliceKeyedIslands(
  live: LiveRegion,
  frag: DocumentFragment,
  keptStarts: Set<Comment>,
  propUpdates: KeptPropUpdate[],
): void {
  const liveKeyed = collectKeyedIslandsInRange(live.start, live.end);
  if (liveKeyed.size === 0) return;
  walkKeyedIslandsInTree(frag, (fragStart, fragEnd, info) => {
    if (info.key === null) return;
    const liveMatch = liveKeyed.get(info.key);
    if (liveMatch === undefined) return;
    liveKeyed.delete(info.key);
    spliceLiveOverFragMarker(fragStart, fragEnd, liveMatch.start, liveMatch.end);
    keptStarts.add(liveMatch.start);
    propUpdates.push({ start: liveMatch.start, newIdx: info.idx, key: info.key });
  });
  // Anything the fragment didn't claim is about to disappear with the rest of
  // the live region. Drop the bookkeeping for those keys; the Preact root will
  // be orphaned (its DOM is gone) but that's the same outcome as today's
  // remount path — without keyed survival the island is destroyed anyway.
  for (const key of liveKeyed.keys()) forgetKeptIsland(key);
}

/**
 * Find every keyed island in the live range `[start, end)`. Walks each
 * sibling subtree under `start.parentNode` separately because TreeWalker
 * doesn't natively support a node-range root.
 */
function collectKeyedIslandsInRange(
  start: Comment,
  end: Comment,
): Map<string, { start: Comment; end: Comment }> {
  const out = new Map<string, { start: Comment; end: Comment }>();
  for (let sib = start.nextSibling; sib !== null && sib !== end; sib = sib.nextSibling) {
    walkKeyedIslandsInTree(sib, (s, e, info) => {
      if (info.key === null) return;
      // First occurrence of a given key wins — a duplicate key in the same
      // region is undefined behaviour, but at least the second one won't
      // replace the recorded entry.
      if (!out.has(info.key)) out.set(info.key, { start: s, end: e });
    });
  }
  return out;
}

/**
 * Walk every island start marker in `root` (inclusive: a Comment passed in is
 * itself inspected; an Element's whole subtree is). For each, pair it with its
 * matching `/fresh-island` end marker and hand both — plus the parsed
 * `{ idx, key }` — to `visit`. Keys without a parsed marker are skipped, as
 * are markers whose matching end can't be found in the tree.
 */
function walkKeyedIslandsInTree(
  root: Node,
  visit: (start: Comment, end: Comment, info: ParsedIslandMarker) => void,
): void {
  const visitOne = (c: Comment): void => {
    const info = parseIslandMarker(c.data);
    if (info === null) return;
    const end = findIslandEnd(c);
    if (end === null) return;
    visit(c, end, info);
  };
  if (root.nodeType === COMMENT_NODE) {
    visitOne(root as Comment);
    return;
  }
  if (root.nodeType !== ELEMENT_NODE && root.nodeType !== 11 /* DocumentFragment */) {
    return;
  }
  for (const c of walkComments(root)) visitOne(c);
}

/**
 * Replace the fragment's keyed-island marker pair (and everything between
 * them) with the live keyed-island range, sharing the same `parentNode`. The
 * fragment's marker comments are removed; the live `[start, …, end]` is
 * moved in their place via `insertBefore`, detaching the live nodes from
 * their previous home.
 */
function spliceLiveOverFragMarker(
  fragStart: Comment,
  fragEnd: Comment,
  liveStart: Comment,
  liveEnd: Comment,
): void {
  const parent = fragStart.parentNode;
  if (parent === null) return;
  // Snapshot the live range (start, end, and everything between) before we
  // start moving it — `insertBefore` rewrites sibling links as it goes.
  const range: Node[] = [liveStart];
  for (let n = liveStart.nextSibling; n !== null && n !== liveEnd; n = n.nextSibling) {
    range.push(n);
  }
  range.push(liveEnd);
  // Drop everything between the fragment's marker pair, then replace the
  // pair itself with the live range.
  let n = fragStart.nextSibling;
  while (n !== null && n !== fragEnd) {
    const next = n.nextSibling;
    parent.removeChild(n);
    n = next;
  }
  for (const node of range) parent.insertBefore(node, fragEnd);
  parent.removeChild(fragStart);
  parent.removeChild(fragEnd);
}

function removeBetween(start: Comment, end: Comment): void {
  const parent = start.parentNode;
  if (parent === null) return;
  let n = start.nextSibling;
  while (n !== null && n !== end) {
    const next = n.nextSibling;
    parent.removeChild(n);
    n = next;
  }
}

// ---------- `<Head>` delta sync ----------------------------------------

function syncHead(root: ParentNode): void {
  const nodes = collectMarkerRegion(root, HEAD_START, HEAD_END);
  if (nodes === null) return;
  for (const node of nodes) {
    if (node.nodeType !== ELEMENT_NODE) continue;
    const el = node as Element;
    const tag = el.tagName.toLowerCase();
    if (tag === "title") {
      document.title = el.textContent ?? "";
      continue;
    }
    const imported = document.importNode(el, true) as Element;
    // Same dedup the `<Head>` client runtime uses, so a partial swap replaces
    // the right singleton head element instead of appending a duplicate.
    const selector = headDedupeSelector(
      tag,
      (attr) => el.getAttribute(attr),
      el.getAttribute(HEAD_KEY_ATTR),
    );
    const existing = selector !== null ? document.head.querySelector(selector) : null;
    if (existing !== null) {
      existing.replaceWith(imported);
    } else {
      document.head.appendChild(imported);
    }
  }
}

/**
 * Collect the nodes between a `<!--start-->` / `<!--end-->` comment pair at
 * the top level of a parsed fragment. No nesting expected.
 */
function collectMarkerRegion(root: ParentNode, startData: string, endData: string): Node[] | null {
  const kids = Array.from(root.childNodes);
  const startIdx = kids.findIndex(
    (n) => n.nodeType === COMMENT_NODE && (n as Comment).data === startData,
  );
  if (startIdx === -1) return null;
  const out: Node[] = [];
  for (let i = startIdx + 1; i < kids.length; i++) {
    const n = kids[i];
    if (n.nodeType === COMMENT_NODE && (n as Comment).data === endData) return out;
    out.push(n);
  }
  return out;
}

// ---------- hydration hand-off -----------------------------------------

/** Pull the body of the partial data script (the one tagged by the server). */
function extractDataScriptBody(root: ParentNode): string | null {
  const script = root.querySelector(`script[type="module"][${PARTIAL_DATA_SCRIPT_ATTR}]`);
  return script === null ? null : script.textContent;
}

// Distinguishes per-navigation hydration globals so concurrent navigations
// never share (and so never clobber) one another's state.
let applyCounter = 0;

/**
 * Inject the data script so the browser executes it as a real module (its
 * static island-chunk imports resolve against the page, hitting cache). The
 * server body is just `import …; const data = …;` — we *append* a call to a
 * per-navigation unique global we define here. The module body only runs once
 * its imports have loaded, so by the time our global is called the chunks are
 * ready: we then run `commit` (swap the DOM + sync `<Head>`) and hydrate the
 * moved nodes together. Appending (never substituting inside the body) means a
 * serialized value containing the global's name can't hijack the call.
 *
 * Resolves `true` once the swap has happened, `false` if the module's chunks
 * failed to load (so nothing was swapped and the caller can full-navigate).
 */
function runHydrationScript(
  scriptBody: string,
  commit: () => Node[],
  keptStarts: ReadonlySet<Comment>,
  propUpdates: readonly KeptPropUpdate[],
): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    // `fnName` is a fixed-format identifier we generate (never derived from the
    // response), so it's safe to splice into source.
    const fnName = `__freshPartialApply${++applyCounter}`;
    const script = document.createElement("script");
    const g = globalThis as unknown as Record<string, unknown>;
    const cleanup = () => {
      delete g[fnName];
      script.remove();
    };
    g[fnName] = (data: BootState) => {
      try {
        // Chunks are loaded now: swap the DOM, then hydrate the moved nodes.
        const moved = commit();
        try {
          bootNodes(moved, data, keptStarts);
          // Push fresh props through each surviving keyed island. Preact's
          // diff handles the rest — same Component, same root container,
          // hooks/refs/signals preserved.
          for (const { key, newIdx } of propUpdates) {
            const entry = data.islands[newIdx];
            if (entry === undefined) continue;
            updateKeptIsland(key, (entry.props ?? {}) as Record<string, unknown>);
          }
        } catch (err) {
          console.error("[fresh] partial hydration failed", err);
        }
        resolve(true);
      } catch (err) {
        console.error("[fresh] partial swap failed", err);
        resolve(false);
      } finally {
        cleanup();
      }
    };
    script.type = "module";
    // `data` is the `const data` from the server body (same module scope).
    script.textContent = `${scriptBody}\nglobalThis.${fnName}(data);`;
    // If a chunk fails to load the module body never runs (so our global is
    // never called); surface it and let the caller fall back to a full load.
    script.addEventListener("error", () => {
      console.error("[fresh] partial island chunk failed to load");
      cleanup();
      resolve(false);
    });
    document.body.appendChild(script);
  });
}
