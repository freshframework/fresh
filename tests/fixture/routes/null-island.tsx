import { page } from "./$null-island.ts";

import { NullThenContent } from "../islands/NullThenContent.tsx";

export default page(function NullIsland() {
  return (
    <main>
      <h1>null island</h1>
      <NullThenContent id="null-content" />
    </main>
  );
});
