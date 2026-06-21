import { test } from "vitest";
import assert from "node:assert/strict";

import { HEAD_KEY_ATTR, headDedupeSelector } from "./head-dedupe.ts";

// Build a `get` accessor from a plain attribute bag.
function from(attrs: Record<string, string>): (attr: string) => string | null {
  return (attr) => (attr in attrs ? attrs[attr] : null);
}

test("explicit key wins over everything else", () => {
  const sel = headDedupeSelector("meta", from({ id: "x", name: "description" }), "k1");
  assert.equal(sel, `[${HEAD_KEY_ATTR}="k1"]`);
});

test("id is used when there's no key", () => {
  assert.equal(headDedupeSelector("link", from({ id: "main" })), `[id="main"]`);
});

test("meta dedups by name, then property", () => {
  assert.equal(
    headDedupeSelector("meta", from({ name: "description" })),
    `meta[name="description"]`,
  );
  assert.equal(
    headDedupeSelector("meta", from({ property: "og:title" })),
    `meta[property="og:title"]`,
  );
});

test("meta name takes precedence over property", () => {
  assert.equal(
    headDedupeSelector("meta", from({ name: "description", property: "og:title" })),
    `meta[name="description"]`,
  );
});

test("only singleton link rels (canonical / manifest) dedup", () => {
  assert.equal(headDedupeSelector("link", from({ rel: "canonical" })), `link[rel="canonical"]`);
  assert.equal(headDedupeSelector("link", from({ rel: "manifest" })), `link[rel="manifest"]`);
  // A repeatable rel (stylesheet, preload, …) has no singleton slot.
  assert.equal(headDedupeSelector("link", from({ rel: "stylesheet", href: "/a.css" })), null);
});

test("base is a singleton", () => {
  assert.equal(headDedupeSelector("base", from({ href: "/app/" })), "base");
});

test("elements with no natural slot return null (additive)", () => {
  assert.equal(headDedupeSelector("script", from({ src: "/a.js" })), null);
  assert.equal(headDedupeSelector("meta", from({ charset: "utf-8" })), null);
  assert.equal(headDedupeSelector("style", from({})), null);
});

test("attribute values are escaped for the selector", () => {
  assert.equal(headDedupeSelector("meta", from({ name: `a"b\\c` })), `meta[name="a\\"b\\\\c"]`);
});
