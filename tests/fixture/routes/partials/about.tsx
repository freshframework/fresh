import { page } from "./$about.ts";
import { Head } from "fresh/runtime";

export default page(function About() {
  return (
    <section data-testid="panel-about">
      <Head>
        <title>Partials About</title>
      </Head>
      <h2>About</h2>
    </section>
  );
});
