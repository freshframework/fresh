import { layout } from "./$_layout";
import { Head } from "fresh/runtime";

// A layout that contributes to the document <head>. It should merge with each
// page's own <Head> (different cache keys), proving head collection works from
// the layout level too.
export default layout(({ Component }) => (
  <>
    <Head>
      <meta name="section" content="head-section" />
    </Head>
    <Component />
  </>
));
