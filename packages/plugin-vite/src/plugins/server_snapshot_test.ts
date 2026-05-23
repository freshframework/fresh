import { expect } from "@std/expect/expect";
import {
  FRESH_CSS_PLACEHOLDER,
  replaceFreshCssPlaceholders,
} from "./server_snapshot.ts";

Deno.test("server snapshot - replaceFreshCssPlaceholders with no css", () => {
  const output = replaceFreshCssPlaceholders(
    `export default ${FRESH_CSS_PLACEHOLDER};`,
    undefined,
  );

  expect(output).toEqual("export default null;");
});

Deno.test("server snapshot - replaceFreshCssPlaceholders once", () => {
  const output = replaceFreshCssPlaceholders(
    `const css = ${FRESH_CSS_PLACEHOLDER};`,
    ["assets/server-entry.css"],
  );

  expect(output).toEqual(`const css = ["/assets/server-entry.css"];`);
});

Deno.test("server snapshot - replaceFreshCssPlaceholders multiple times", () => {
  const output = replaceFreshCssPlaceholders(
    [
      `const appCss = ${FRESH_CSS_PLACEHOLDER};`,
      `const layoutCss = ${FRESH_CSS_PLACEHOLDER};`,
      `const errorCss = ${FRESH_CSS_PLACEHOLDER};`,
    ].join("\n"),
    ["assets/server-entry.css"],
  );

  expect(output).toEqual([
    `const appCss = ["/assets/server-entry.css"];`,
    `const layoutCss = ["/assets/server-entry.css"];`,
    `const errorCss = ["/assets/server-entry.css"];`,
  ].join("\n"));
});
