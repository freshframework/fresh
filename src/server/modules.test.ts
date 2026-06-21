import { test } from "vitest";
import assert from "node:assert/strict";

import { validateHandler, validateLayout, validateMiddleware, validatePage } from "./modules.ts";

// ---------- validateHandler ----------

test("validateHandler accepts a single function and returns it", () => {
  const fn = () => new Response("ok");
  const result = validateHandler({ handlers: fn });
  assert.equal(result, fn);
});

test("validateHandler accepts a method-map and returns a filtered copy", () => {
  const GET = () => new Response("g");
  const POST = () => new Response("p");
  const result = validateHandler({ handlers: { GET, POST } });
  assert.deepEqual(Object.keys(result as object).sort(), ["GET", "POST"]);
  assert.equal((result as Record<string, unknown>).GET, GET);
  assert.equal((result as Record<string, unknown>).POST, POST);
});

test("validateHandler rejects unknown HTTP methods", () => {
  assert.throws(
    () => validateHandler({ handlers: { TRACE: () => new Response("x") } }),
    /unknown HTTP method "TRACE"/,
  );
});

test("validateHandler rejects non-function method entries", () => {
  assert.throws(
    () => validateHandler({ handlers: { GET: "not a fn" } }),
    /handler for method "GET" must be a function/,
  );
});

test("validateHandler returns null when the module has no `handlers` export", () => {
  assert.equal(validateHandler({}), null);
  assert.equal(validateHandler({ handlers: undefined }), null);
  assert.equal(validateHandler(null), null);
  assert.equal(validateHandler("string"), null);
});

test("validateHandler throws when `handlers` is the wrong shape", () => {
  assert.throws(() => validateHandler({ handlers: 42 }), /must be a function or a method-map/);
});

// ---------- validatePage ----------

test("validatePage returns the default export when it is a function", () => {
  const Page = () => null;
  assert.equal(validatePage({ default: Page }), Page);
});

test("validatePage returns null when there is no default export", () => {
  assert.equal(validatePage({}), null);
  assert.equal(validatePage({ default: undefined }), null);
  assert.equal(validatePage({ default: null }), null);
  assert.equal(validatePage(null), null);
});

test("validatePage throws when the default export is not a function", () => {
  assert.throws(() => validatePage({ default: 42 }), /must be a page component \(function\)/);
});

// ---------- validateMiddleware ----------

test("validateMiddleware returns the default-exported function", () => {
  const fn = (ctx: unknown) => ctx;
  const result = validateMiddleware({ default: fn });
  assert.equal(result, fn);
});

test("validateMiddleware rejects arrays — only a single function is allowed", () => {
  assert.throws(
    () => validateMiddleware({ default: [() => "a", () => "b"] }),
    /must `export default` a function, got object/,
  );
});

test("validateMiddleware rejects modules whose default is the wrong shape", () => {
  assert.throws(() => validateMiddleware({ default: 42 }), /must `export default` a function/);
  assert.throws(() => validateMiddleware({}), /must `export default` a function/);
});

test("validateMiddleware rejects non-object modules", () => {
  assert.throws(() => validateMiddleware(null), TypeError);
});

// ---------- validateLayout ----------

test("validateLayout returns the default-exported function", () => {
  const fn = () => null as never;
  assert.equal(validateLayout({ default: fn }), fn);
});

test("validateLayout throws when the module has no default export", () => {
  // No silent pass-through — an empty `_layout.tsx` is an error so it shows
  // up immediately rather than rendering an unwrapped page.
  for (const empty of [{}, { default: null }, { default: undefined }]) {
    assert.throws(() => validateLayout(empty), /must `export default` a function/);
  }
});

test("validateLayout throws for non-object modules", () => {
  assert.throws(() => validateLayout(null), TypeError);
  assert.throws(() => validateLayout(undefined), TypeError);
});

test("validateLayout throws when default export is the wrong shape", () => {
  assert.throws(
    () => validateLayout({ default: 42 }),
    /must `export default` a function, got number/,
  );
});
