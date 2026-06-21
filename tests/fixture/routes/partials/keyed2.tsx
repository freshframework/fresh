import { page } from "./$keyed2.ts";

import { Counter } from "../../islands/Counter.tsx";

// Sibling of `partials/keyed.tsx`. Shares the `kept` key so the keyed
// `<Counter>` survives the partial swap from there to here, but ships
// `label="B"` so the prop-update path is exercised: Preact diffs the new
// vnode against the surviving root and rewrites only the changed prop.
// The unkeyed counter carries a different `id` to verify the live A-panel
// instance was actually destroyed (the B id only exists here).
export default page(function KeyedPanel2() {
  return (
    <section data-testid="panel-keyed-2">
      <h2>Keyed B</h2>
      <Counter id="kept-counter" key="kept" label="B" />
      <Counter id="fresh-counter-b" label="fresh-b" />
    </section>
  );
});
