import { page } from "./$nested.ts";
import { NestedOuter } from "../../islands/Nested.tsx";

// Nested islands inside a `<Partial>`, so a partial swap re-hydrates them via
// `bootNodes` (which pairs island markers within the moved region the same way
// the full-page boot does).
export default page(function PartialNested() {
  return (
    <section data-testid="panel-nested">
      <h2>Nested</h2>
      <NestedOuter />
    </section>
  );
});
