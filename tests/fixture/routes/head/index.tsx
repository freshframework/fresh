import { page } from "./$index.ts";
import { Head } from "fresh/runtime";

// Route-level <Head>: its <title> overrides the _app shell's <title> (dedup by
// "title", last-write-wins), and it adds a meta + a canonical link.
export default page(function HeadHome() {
  return (
    <main>
      <Head>
        <title>Head Home</title>
        <meta name="description" content="home description" />
        <link rel="canonical" href="https://example.com/head" />
      </Head>
      <h1 data-testid="head-page">head home</h1>
    </main>
  );
});
