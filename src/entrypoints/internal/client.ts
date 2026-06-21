// Internal client-side hydration entrypoint. Consumed only by the
// SSR-emitted inline `<script type="module">` — not part of the
// user-facing surface.
//
// Exports:
//
//   * `signal` — re-exported from `@preact/signals`. The serializer's
//     `Signal` branch generates calls to this from the SSR side; having
//     it live on the boot chunk means the inline script imports it from
//     the same URL it imports `boot` from, with no separate
//     `@preact/signals` chunk needed.
//
//   * `boot(state)` — the hydration runtime. Walks DOM markers, renders
//     islands into root fragments, binds page-level signals to text
//     nodes and `[f-s]` attributes, attaches `[f-eh]` listeners.
//
//   * `installPartials()` — imported for its side effect: installs the
//     client-side partial-navigation listeners. Re-exported so the
//     side-effecting import isn't tree-shaken.
//
//   * `slot(N)` — revives an island "slot" prop (JSX passed to an island).
//     The serializer emits calls to it for VNode-valued props; it grafts the
//     server-rendered DOM for slot N into place.

export { signal } from "@preact/signals";
export {
  boot,
  type BootState,
  type EventBinding,
  type IslandStateEntry,
} from "../../client/islands.ts";
export { installPartials } from "../../client/partials.ts";
export { slot } from "../../client/slot.ts";
