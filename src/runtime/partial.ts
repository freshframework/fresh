// `<Partial>` — a named, client-updatable region of the page, plus the
// constants the server renderer, the client navigation runtime, and the
// boot chunk all share to recognise partial boundaries on the wire.
//
// During SSR a `<Partial name="main">` is wrapped in a pair of HTML
// comment markers (mirroring how islands/signals are marked):
//
//   <!--fresh-partial:replace:main-->...region HTML...<!--/fresh-partial-->
//
// The markers are emitted on *every* render — full page loads included —
// so the client always has a handle on each region. When a link inside an
// `f-client-nav` region is clicked, the client fetches the same URL with
// `?fresh-partial=true`, the server renders only the partial regions (no
// document shell), and the client swaps the matching live region's content
// in place (and re-hydrates any islands inside it) instead of doing a full
// page navigation.
//
// `<Partial>` itself is a passthrough component — it renders its children
// unchanged. All the wiring happens in the render hook that recognises the
// `__FRESH_PARTIAL` brand (see `src/server/render.ts`).

import type { ComponentChildren } from "preact";

/**
 * Attribute that opts a subtree into client-side (partial) navigation.
 * Checked on the clicked element and its ancestors; the nearest one wins,
 * and `f-client-nav="false"` opts a subtree back out. Absent everywhere ⇒
 * the link does a normal full-page navigation.
 */
export const CLIENT_NAV_ATTR = "f-client-nav";

/**
 * Optional attribute on a link / form / submitter that overrides the URL the
 * partial is *fetched* from, while the browser history still moves to the
 * navigated URL (`href` / form action). The client resolves it relative to the
 * document base, fetches the partial from there, and — for a fresh push/replace
 * — remembers it on the history entry so a later back/forward traverse
 * re-fetches identically. Honoured only inside an `f-client-nav` region.
 */
export const PARTIAL_ATTR = "f-partial";

/**
 * Request header the client sets so the server renders a partial response.
 * A header (rather than a query param) keeps the fetched URL identical to the
 * navigated URL, and pairs with a `Vary: Fresh-Partial` response header so
 * caches don't serve a fragment to a normal navigation.
 */
export const PARTIAL_HEADER = "Fresh-Partial";

/** Comment-marker prefix for a partial region: `fresh-partial:<mode>:<name>`. */
export const PARTIAL_START_PREFIX = "fresh-partial:";
/** Comment marker closing a partial region. */
export const PARTIAL_END = "/fresh-partial";

/** Comment markers wrapping the `<Head>` delta in a partial response. */
export const HEAD_START = "fresh-head";
export const HEAD_END = "/fresh-head";

/**
 * Attribute marking the inline `<script type="module">` that carries a
 * partial response's serialized island state. Its body is just static imports
 * plus `const data = <serialized>;` — no trailing call. The client locates the
 * script by this attribute, then *appends* its own `<unique>(data)` call
 * (rather than substituting a sentinel inside the body), so a serialized value
 * that happens to contain the call name can't corrupt or hijack the data.
 */
export const PARTIAL_DATA_SCRIPT_ATTR = "data-fresh-partial";

/** Replacement strategy when a partial region's content is updated. */
export type PartialMode = "replace" | "append" | "prepend";

export interface PartialProps {
  /** Unique (per render) region name the client matches against. */
  name: string;
  /**
   * How an update applies to the existing region content. `replace`
   * (default) swaps the children; `append` / `prepend` add to them.
   */
  mode?: PartialMode;
  children?: ComponentChildren;
}

/**
 * A named region whose content can be updated by client-side partial
 * navigation. Renders its children unchanged; the render hook wraps the
 * output in boundary markers keyed by `name` + `mode`.
 *
 * ```tsx
 * <div f-client-nav>
 *   <nav><a href="/about">About</a></nav>
 *   <Partial name="main">
 *     {/* swapped on navigation, the nav stays put *\/}
 *   </Partial>
 * </div>
 * ```
 */
export function Partial(props: PartialProps): ComponentChildren {
  return props.children;
}

// Branding the function lets the render hook recognise a `<Partial>` vnode
// by identity-independent marker (survives bundling / re-export) the same
// way islands carry `__FRESH_SERIALIZABLE_FUNCTION`.
(Partial as unknown as { __FRESH_PARTIAL?: boolean }).__FRESH_PARTIAL = true;

// Teach preact's JSX about the partial-navigation attributes so users get
// typed `f-client-nav` / `f-partial` on any intrinsic element.
declare module "preact" {
  // deno-lint-ignore no-namespace
  namespace JSX {
    // `RefType` is unused here but must match Preact's generic parameter for the
    // declaration to merge (TS requires identical type parameters).
    // eslint-disable-next-line no-unused-vars
    interface HTMLAttributes<RefType extends EventTarget = EventTarget> {
      /** Opt this element and its subtree into client-side partial navigation. */
      "f-client-nav"?: boolean | "true" | "false";
      /** Fetch the partial from a URL other than the link/form target. */
      "f-partial"?: string;
    }
  }
}

/**
 * Coerce a boolean `f-client-nav` prop to its string form in place. Preact
 * drops `false`-valued attributes entirely (and renders `true` without a
 * value), so `f-client-nav={false}` would otherwise never reach the DOM and
 * the opt-out would silently do nothing. Run from the vnode-creation hooks
 * (server render + client island render) on intrinsic elements. Mirrors Fresh
 * 2's `preact_hooks_client.ts`.
 */
export function normalizeClientNavProps(props: Record<string, unknown> | null | undefined): void {
  if (props != null && typeof props[CLIENT_NAV_ATTR] === "boolean") {
    props[CLIENT_NAV_ATTR] = String(props[CLIENT_NAV_ATTR]);
  }
}

/** Parse a `fresh-partial:<mode>:<name>` comment body into `{ mode, name }`. */
export function parsePartialMarker(data: string): { mode: PartialMode; name: string } | null {
  if (!data.startsWith(PARTIAL_START_PREFIX)) return null;
  const rest = data.slice(PARTIAL_START_PREFIX.length);
  const colon = rest.indexOf(":");
  if (colon === -1) return null;
  const mode = rest.slice(0, colon) as PartialMode;
  const name = rest.slice(colon + 1);
  if (mode !== "replace" && mode !== "append" && mode !== "prepend") return null;
  return { mode, name };
}
