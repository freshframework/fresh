import { page } from "./$keyed.ts";

import { Counter } from "../../islands/Counter.tsx";

// One panel of a keyed-survival demo. The keyed `<Counter>` shares its `key`
// with the sibling route `partials/keyed2.tsx`, so a partial navigation
// between the two must preserve the keyed island's hooks state (count) while
// the `label` prop updates in place. The unkeyed counter is a control: it
// must reset every swap because nothing tells the partial runtime to keep it.
export default page(function KeyedPanel() {
  return (
    <section data-testid="panel-keyed">
      <h2>Keyed A</h2>
      <Counter id="kept-counter" key="kept" label="A" />
      <Counter id="fresh-counter" label="fresh" />
    </section>
  );
});
