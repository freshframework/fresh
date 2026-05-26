import * as maxmind from "../../fixtures/maxmind.cjs";

export default function Page() {
  // deno-lint-ignore no-console
  console.log(maxmind);
  return <h1>maxmind</h1>;
}
