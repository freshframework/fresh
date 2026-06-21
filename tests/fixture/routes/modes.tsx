import { page } from "./$modes.ts";
import { Partial } from "fresh/runtime";

// Three sibling partials, one per replacement mode, keyed off `?v=`. This page
// has no islands, so it also exercises the island-less `f-client-nav` loader
// (the boot chunk is injected purely to install the navigation runtime).
//
// Navigating v=1 → v=2 → v=3:
//   replace → shows just the latest value
//   append  → 1, 2, 3
//   prepend → 3, 2, 1
export default page(function Modes(props) {
  const v = props.url.searchParams.get("v") ?? "1";
  return (
    <div f-client-nav>
      <nav>
        <a id="v1" href="/modes?v=1">
          1
        </a>
        <a id="v2" href="/modes?v=2">
          2
        </a>
        <a id="v3" href="/modes?v=3">
          3
        </a>
      </nav>
      <p data-testid="rep">
        <Partial name="rep" mode="replace">
          <span>{v}</span>
        </Partial>
      </p>
      <ul data-testid="app">
        <Partial name="app" mode="append">
          <li>{v}</li>
        </Partial>
      </ul>
      <ul data-testid="pre">
        <Partial name="pre" mode="prepend">
          <li>{v}</li>
        </Partial>
      </ul>
    </div>
  );
});
