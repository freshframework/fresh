import { test } from "vitest";
import assert from "node:assert/strict";

import { freshTsconfigContent, freshTsconfigPath } from "./tsconfig.ts";

test("freshTsconfigPath is the conventional .fresh/tsconfig.json", () => {
  assert.equal(freshTsconfigPath(), ".fresh/tsconfig.json");
});

test("freshTsconfigContent declares rootDirs + the preact-jsx defaults", () => {
  const config = JSON.parse(freshTsconfigContent());
  assert.deepEqual(config.compilerOptions.rootDirs, ["..", "./types"]);
  assert.equal(config.compilerOptions.jsx, "react-jsx");
  assert.equal(config.compilerOptions.jsxImportSource, "preact");
  // Lib-check off so Nitro's optional peer deps don't poison user
  // typecheck runs.
  assert.equal(config.compilerOptions.skipLibCheck, true);
  assert.equal(config.compilerOptions.strict, true);
  assert.equal(config.compilerOptions.moduleResolution, "bundler");
  assert.equal(config.compilerOptions.allowImportingTsExtensions, true);
  assert.equal(config.compilerOptions.noEmit, true);
});

test("freshTsconfigContent ends with a trailing newline", () => {
  assert.ok(freshTsconfigContent().endsWith("\n"));
});
