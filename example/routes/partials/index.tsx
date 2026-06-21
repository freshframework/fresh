import { page } from "./$index.ts";

import { Clicks } from "../../islands/Clicks.tsx";

export default page(function Home() {
  return (
    <div class="panel">
      <h3>Home panel</h3>
      <p>This panel was rendered on the server and swapped in via a partial.</p>
      <Clicks />
    </div>
  );
});
