import { page } from "./$kept-a.ts";
import { KeptCounter } from "../../islands/KeptCounter.tsx";

// One half of the keyed-island survival demo. The `<KeptCounter>` here shares
// `key="counter"` with the sibling at `partials/kept-b.tsx`, so a partial swap
// between the two preserves the island's count and mount state while the
// `label` prop updates in place.
export default page(function KeptA() {
  return (
    <div class="panel">
      <h3>Panel A</h3>
      <p>
        Click the counter below, then switch to Panel B. The count and mount tick stay because the
        island is identified by its key; only the label prop updates.
      </p>
      <KeptCounter key="counter" label="A" />
    </div>
  );
});
