import type { FreshContext } from "@fresh/core";
// deno-lint-ignore no-external-import
import { greet, version } from "cjs-test-module";

export default function Home(_ctx: FreshContext) {
  return (
    <div>
      <p class="greeting">{greet("Fresh")}</p>
      <p class="version">{version}</p>
    </div>
  );
}
