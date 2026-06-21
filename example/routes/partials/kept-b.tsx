import { page } from "./$kept-b.ts";
import { KeptCounter } from "../../islands/KeptCounter.tsx";

// The matching side of `partials/kept-a.tsx`. Same `key="counter"`, different
// `label`. Swapping between the two demonstrates that Fresh's partial runtime
// matches keyed islands across the boundary, keeps the live Preact root, and
// diffs only the changed props.
export default page(function KeptB() {
  return (
    <div class="panel">
      <h3>Panel B</h3>
      <p>
        Same component, same key, different label. The count carries over and the mount tick stays
        the same — Preact diffed the new vnode into the surviving root.
      </p>
      <KeptCounter key="counter" label="B" />
    </div>
  );
});
