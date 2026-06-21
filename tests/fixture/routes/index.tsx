import { page } from "./$index.ts";

export default page(function Index() {
  return (
    <ul>
      <li>
        <a href="/islands">islands</a>
      </li>
      <li>
        <a href="/partials">partials</a>
      </li>
      <li>
        <a href="/modes">modes</a>
      </li>
    </ul>
  );
});
