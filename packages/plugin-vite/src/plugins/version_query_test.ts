import { expect } from "@std/expect/expect";
import {
  type DepsOptimizerLike,
  depsOptimizerOf,
  ensureVersionQuery,
} from "./version_query.ts";

const DEP = "/app/node_modules/preact/dist/preact.mjs";

function optimizer(
  options: { browserHash?: string; extensions?: string[] } = {},
): DepsOptimizerLike {
  return {
    metadata: { browserHash: options.browserHash ?? "abc123" },
    options: { extensions: options.extensions },
  };
}

Deno.test("version query - versions a dependency", () => {
  expect(ensureVersionQuery(DEP, optimizer())).toEqual(`${DEP}?v=abc123`);
});

Deno.test("version query - ignores app source", () => {
  const id = "/app/islands/Counter.ts";
  expect(ensureVersionQuery(id, optimizer())).toEqual(id);
});

Deno.test("version query - is idempotent", () => {
  const id = `${DEP}?v=abc123`;
  expect(ensureVersionQuery(id, optimizer())).toEqual(id);
});

Deno.test("version query - ignores extensions Vite cannot pre-bundle", () => {
  const id = "/app/node_modules/some-dep/Widget.tsx";
  expect(ensureVersionQuery(id, optimizer())).toEqual(id);

  // ...unless the optimizer was configured to handle them.
  expect(ensureVersionQuery(id, optimizer({ extensions: [".tsx"] })))
    .toEqual(`${id}?v=abc123`);
});

Deno.test("version query - waits for the optimizer to initialise", () => {
  expect(ensureVersionQuery(DEP, optimizer({ browserHash: "" }))).toEqual(DEP);
});

Deno.test("version query - keeps an existing query and fragment", () => {
  expect(ensureVersionQuery(`${DEP}?foo=1`, optimizer()))
    .toEqual(`${DEP}?v=abc123&foo=1`);

  expect(ensureVersionQuery(`${DEP}#bar`, optimizer()))
    .toEqual(`${DEP}?v=abc123#bar`);
});

Deno.test("version query - depsOptimizerOf tolerates a missing optimizer", () => {
  expect(depsOptimizerOf({})).toBeUndefined();
  expect(depsOptimizerOf({ depsOptimizer: optimizer() })).toBeDefined();
});
