import { expect } from "@std/expect/expect";
import * as babel from "@babel/core";
import { inlineEnvVarsPlugin } from "./inline_env_vars.ts";

function runTest(
  options: {
    input: string;
    expected: string;
    mode?: string;
    env?: Record<string, string>;
  },
) {
  const res = babel.transformSync(options.input, {
    filename: "foo.js",
    babelrc: false,
    plugins: [
      inlineEnvVarsPlugin(options.mode ?? "development", options.env ?? {}),
    ],
  });

  const output = res?.code ?? "";
  expect(output).toEqual(options.expected);
}

Deno.test("env vars - inline NODE_ENV mode", () => {
  runTest({
    input: `() => process.env.NODE_ENV`,
    expected: `() => "asdf";`,
    mode: "asdf",
  });
});

Deno.test("env vars - inline custom process.env.*", () => {
  runTest({
    input: `() => process.env.FRESH_PUBLIC_FOO`,
    expected: `() => "a";`,
    env: {
      FRESH_PUBLIC_FOO: "a",
    },
  });
});

Deno.test("env vars - inline Deno.env.get()", () => {
  runTest({
    input: `() => Deno.env.get("FRESH_PUBLIC_FOO")`,
    expected: `() => "b";`,
    env: {
      FRESH_PUBLIC_FOO: "b",
    },
  });
});

Deno.test("env vars - inline Deno.env.get(NODE_ENV)", () => {
  runTest({
    input: `() => Deno.env.get("NODE_ENV")`,
    expected: `() => "c";`,
    mode: "c",
  });
});

Deno.test("env vars - inline const _ = Deno.env.get()", () => {
  runTest({
    input: `const deno = Deno.env.get("FRESH_PUBLIC_FOO");`,
    expected: `const deno = "test";`,
    env: {
      FRESH_PUBLIC_FOO: "test",
    },
  });
});

Deno.test("env vars - inline import.meta.env.FRESH_PUBLIC_FOO", () => {
  runTest({
    input: `() => import.meta.env.FRESH_PUBLIC_FOO;`,
    expected: `() => "test";`,
    env: {
      FRESH_PUBLIC_FOO: "test",
    },
  });
});
