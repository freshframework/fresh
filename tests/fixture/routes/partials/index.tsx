import { page } from "./$index.ts";
import { Head } from "fresh/runtime";

import { Counter } from "../../islands/Counter.tsx";

export default page(function Home() {
  return (
    <section data-testid="panel-home">
      <Head>
        <title>Partials Home</title>
      </Head>
      <h2>Home</h2>
      {/* An island INSIDE the partial — re-hydrated fresh after each swap. */}
      <Counter id="inside-counter" />
    </section>
  );
});
