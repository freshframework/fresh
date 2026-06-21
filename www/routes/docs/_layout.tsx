import { layout } from "./$_layout.ts";
import { Head } from "fresh/runtime";

export default layout(({ Component }) => {
  return (
    <div class="layout">
      <Head>
        <link rel="stylesheet" href="/docsearch.css" />
        <link rel="stylesheet" href="/markdown.css" />
      </Head>
      <div class="bg-background-primary text-foreground-primary">
        <Component />
      </div>
    </div>
  );
});
