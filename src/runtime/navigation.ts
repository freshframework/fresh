// `navigating` — a built-in signal factory reflecting whether a client
// (partial) navigation is currently in flight.
//
// The client navigation runtime (`src/client/partials.ts`) brackets every
// partial fetch-and-apply with `navStarted()` / `navSettled()`. `navigating()`
// builds a read-only signal off that shared state — typically read inside an
// island to drive a loading indicator. It replaces Fresh 2's imperative
// `_freshIndicator` hook.
//
// It's a `makeComputed` factory (not a bare `computed`) so it's *serializable*:
// like the other built-in signals (`equals`, `and`, …) it can be used in
// page-level reactivity (a non-island route binding it to text/attributes), not
// only inside islands — a plain `computed()` throws at serialize time. The
// factory's `__FRESH_SERIALIZABLE_FUNCTION` marker resolves through
// `fresh/signals`, so the client re-builds the same computed over this module's
// shared `inFlight` counter (the navigation runtime and any deserialized
// `navigating()` observe one instance).
//
// During SSR there's no navigation in flight, so the signal reads `false` on
// the first render — matching the hydrated client state.

import { type ReadonlySignal, signal } from "@preact/signals";
import { makeComputed } from "../client/signals.ts";

// Count of partial navigations currently in flight — a counter rather than a
// bare boolean so overlapping or superseded navigations settle correctly:
// `navigating` only flips back to `false` once the last one has finished.
const inFlight = signal(0);

/**
 * Build a read-only signal that is `true` while a client (partial) navigation
 * is in flight — a link click, form submission, or back/forward traversal that
 * the Fresh navigation runtime is fetching and applying — and `false`
 * otherwise. On a server render (and a full page load) it is `false`.
 *
 * Read it inside an island to render a loading indicator:
 *
 * ```tsx
 * import { navigating } from "fresh/runtime";
 *
 * export function NavSpinner() {
 *   const busy = navigating.use(); // memoised for the component's lifetime
 *   return busy.value ? <span class="spinner" /> : null;
 * }
 * ```
 */
export const navigating: (() => ReadonlySignal<boolean>) & {
  /** Build (and memoise for the component's lifetime) the signal — use inside a component. */
  use(): ReadonlySignal<boolean>;
} = makeComputed(() => inFlight.value > 0);
if (typeof import.meta.env !== "undefined" && import.meta.env.SSR) {
  (
    navigating as unknown as { __FRESH_SERIALIZABLE_FUNCTION: unknown }
  ).__FRESH_SERIALIZABLE_FUNCTION = {
    specifier: "fresh/signals",
    export: "navigating",
  };
}

/** @internal Mark a partial navigation as started. */
export function navStarted(): void {
  inFlight.value++;
}

/** @internal Mark a partial navigation as settled (completed, failed, or aborted). */
export function navSettled(): void {
  // Guard against underflow if settle were ever called without a matching
  // start; `navigating` should never get "stuck" negative-but-truthy.
  inFlight.value = Math.max(0, inFlight.value - 1);
}
