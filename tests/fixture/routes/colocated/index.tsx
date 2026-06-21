import { page } from "./$index.ts";

import { Local } from "./(_islands)/Local.tsx";

// `/colocated` renders an island that lives in this route's co-located
// `(_islands)/` group folder.
export default page(function Colocated() {
  return (
    <main>
      <h1>colocated</h1>
      <Local id="local-counter" />
    </main>
  );
});
