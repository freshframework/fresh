import { page } from "./$nested.ts";
import { NestedOuter } from "../islands/Nested.tsx";

export default page(function NestedRoute() {
  return (
    <div>
      <h1>Nested islands</h1>
      <NestedOuter />
    </div>
  );
});
