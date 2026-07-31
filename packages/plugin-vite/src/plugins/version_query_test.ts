import { expect } from "@std/expect/expect";
import {
  type DepsOptimizer,
  depsOptimizerOf,
  ensureVersionQuery,
  tryOptimizedResolve,
} from "./version_query.ts";

const DEP = "/app/node_modules/preact/dist/preact.mjs";

interface FakeDepInfo {
  file: string;
  src?: string;
  browserHash?: string;
}

function optimizer(
  options: {
    browserHash?: string;
    extensions?: string[];
    optimized?: Record<string, FakeDepInfo>;
    depInfoList?: FakeDepInfo[];
  } = {},
): DepsOptimizer {
  return {
    metadata: {
      browserHash: options.browserHash ?? "abc123",
      optimized: options.optimized ?? {},
      discovered: {},
      chunks: {},
      depInfoList: options.depInfoList ?? [],
    },
    options: { extensions: options.extensions },
    getOptimizedDepId: (info: FakeDepInfo) =>
      `${info.file}?v=${info.browserHash ?? "abc123"}`,
    // The rest of Vite's `DepsOptimizer` is not exercised here.
  } as unknown as DepsOptimizer;
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

Deno.test("optimized resolve - substitutes a pre-bundled dependency", async () => {
  const deps = optimizer({
    optimized: { preact: { file: "/app/.vite/deps/preact.js" } },
  });

  expect(await tryOptimizedResolve("preact", DEP, deps))
    .toEqual("/app/.vite/deps/preact.js?v=abc123");
});

Deno.test("optimized resolve - matches by source for `npm:` specifiers", async () => {
  // Deno rewrites imports inside jsr modules, so the specifier never matches
  // the optimizer's keys and only the source file identifies the dependency.
  const deps = optimizer({
    optimized: { preact: { file: "/app/.vite/deps/preact.js", src: DEP } },
    depInfoList: [{ file: "/app/.vite/deps/preact.js", src: DEP }],
  });

  expect(await tryOptimizedResolve("npm:preact@^10.0.0", DEP, deps))
    .toEqual("/app/.vite/deps/preact.js?v=abc123");
});

Deno.test("optimized resolve - leaves dependencies that were not pre-bundled", async () => {
  expect(await tryOptimizedResolve("preact", DEP, optimizer()))
    .toBeUndefined();
});
