import { test } from "vitest";
import assert from "node:assert/strict";

import { App, getMiddleware } from "./app.ts";

// The registered middlewares aren't exposed on the instance — the build reads
// them through the exported `getMiddleware`.

test("App does not expose middlewares on its public surface", () => {
  const app = new App();
  assert.equal((app as unknown as Record<string, unknown>).middlewares, undefined);
});

test("getMiddleware reads an empty list for a fresh App", () => {
  assert.deepEqual(getMiddleware(new App()), []);
});

test("app.use registers middlewares in order and returns this for chaining", () => {
  const app = new App();
  const a = () => Promise.resolve(new Response("a"));
  const b = () => Promise.resolve(new Response("b"));

  const ret = app.use(a).use(b);

  assert.equal(ret, app, "use() returns the app for chaining");
  assert.deepEqual(getMiddleware(app), [a, b]);
});
