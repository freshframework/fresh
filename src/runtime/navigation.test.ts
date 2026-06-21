import { test } from "vitest";
import assert from "node:assert/strict";

import { navigating, navSettled, navStarted } from "./navigation.ts";

// `navigating` is a `makeComputed` factory; calling it builds a read-only
// signal over the shared in-flight counter. Each call returns a fresh computed,
// but they all observe the same source — so reading `.value` reflects live
// navigation state regardless of which instance we hold.

test("navigating() starts false", () => {
  assert.equal(navigating().value, false);
});

test("navigating() is true while a navigation is in flight, false once it settles", () => {
  navStarted();
  assert.equal(navigating().value, true);
  navSettled();
  assert.equal(navigating().value, false);
});

test("overlapping navigations keep navigating true until the last one settles", () => {
  navStarted();
  navStarted();
  assert.equal(navigating().value, true);
  navSettled();
  // One still in flight.
  assert.equal(navigating().value, true);
  navSettled();
  assert.equal(navigating().value, false);
});

test("settling more than started never gets stuck truthy (underflow guard)", () => {
  navSettled();
  navSettled();
  assert.equal(navigating().value, false);
  // And a subsequent start/settle still behaves.
  navStarted();
  assert.equal(navigating().value, true);
  navSettled();
  assert.equal(navigating().value, false);
});

test("a freshly-built navigating() signal reflects the current state, and tracks changes", () => {
  const a = navigating();
  assert.equal(a.value, false);
  navStarted();
  // The existing computed tracks the source; a new one agrees.
  assert.equal(a.value, true);
  assert.equal(navigating().value, true);
  navSettled();
  assert.equal(a.value, false);
});
