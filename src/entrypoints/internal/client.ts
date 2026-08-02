// This module is the client boot chunk — the first framework code every page
// with islands (or client navigation) evaluates. In dev we load
// `preact/debug` here, so it is on by default without the user wiring up an
// `entry.client.ts`. The `await` is what keeps the ordering: the inline boot
// script's `import { boot } from <this chunk>` doesn't resolve until
// `preact/debug` has been imported, so no island renders before it.
//
// `import.meta.env.DEV` is statically `false` in a production build, so the
// import is dropped and `preact/debug` never ends up in the shipped bundle.
// The `typeof` guard matches the rest of the client runtime — it keeps the
// module evaluable outside a Vite pipeline (e.g. plain Vitest imports).
if (typeof import.meta.env !== "undefined" && import.meta.env.DEV) {
  await import("preact/debug");
}

export { signal } from "@preact/signals";
export {
  boot,
  type BootState,
  type EventBinding,
  type IslandStateEntry,
} from "../../client/islands.ts";
export { installPartials } from "../../client/partials.ts";
export { slot } from "../../client/slot.ts";
