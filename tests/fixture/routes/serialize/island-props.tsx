import { useSignal } from "@preact/signals";
import { page } from "./$island-props.ts";

import { addTo, greet, Mirror, Probe } from "../../islands/probe.tsx";

// `count` is shared four ways: a page-level text node, the `Probe` island's
// `count` prop, the factory handler `addTo(count, …)`, and the `Mirror`
// island — so updating it through any one proves a single revived identity.
export default page(function IslandProps() {
  const count = useSignal(10);
  return (
    <main>
      <p data-testid="page-count">{count}</p>
      <Probe count={count} name="ada" step={3} fn={greet} onBump={addTo(count, 5)} />
      <Mirror count={count} />
    </main>
  );
});
