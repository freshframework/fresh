import { page } from "./$reactive.ts";

import { TitleIsland } from "../../islands/TitleIsland.tsx";

// Only the island sets the <title> here, so it starts at the island's value
// (overriding the shell) and updates reactively when the island's signal does.
export default page(function HeadReactive() {
  return (
    <main>
      <h1 data-testid="head-reactive">reactive head</h1>
      <TitleIsland />
    </main>
  );
});
