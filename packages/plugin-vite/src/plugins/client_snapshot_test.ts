import { expect } from "@std/expect/expect";
import * as path from "@std/path";
import { isIslandPath } from "./client_snapshot.ts";
import type { ResolvedFreshViteConfig } from "../utils.ts";

const ROOT = path.join(path.SEPARATOR, "project");

const options = {
  islandsDir: path.join(ROOT, "islands"),
  routeDir: path.join(ROOT, "routes"),
} as ResolvedFreshViteConfig;

Deno.test("client snapshot - isIslandPath detects the islands dir", () => {
  expect(isIslandPath(options, path.join(ROOT, "islands", "Counter.tsx")))
    .toBe(true);
  expect(
    isIslandPath(options, path.join(ROOT, "islands", "nested", "Counter.tsx")),
  ).toBe(true);
});

Deno.test("client snapshot - isIslandPath detects local island folders", () => {
  expect(
    isIslandPath(options, path.join(ROOT, "routes", "(_islands)", "Foo.tsx")),
  ).toBe(true);
  // Inside a route group.
  expect(
    isIslandPath(
      options,
      path.join(ROOT, "routes", "(marketing)", "(_islands)", "Foo.tsx"),
    ),
  ).toBe(true);
  // And inside a plain route folder.
  expect(
    isIslandPath(
      options,
      path.join(ROOT, "routes", "shop", "(_islands)", "Cart.tsx"),
    ),
  ).toBe(true);
});

Deno.test("client snapshot - isIslandPath ignores everything else", () => {
  expect(isIslandPath(options, path.join(ROOT, "routes", "index.tsx")))
    .toBe(false);
  // Another route group is not an island folder.
  expect(
    isIslandPath(
      options,
      path.join(ROOT, "routes", "(_components)", "Head.tsx"),
    ),
  ).toBe(false);
  // `(_islands)` has to be a path segment, not a substring.
  expect(
    isIslandPath(options, path.join(ROOT, "routes", "(_islands)x", "Foo.tsx")),
  ).toBe(false);
  // Outside both dirs, even when the name matches.
  expect(isIslandPath(options, path.join(ROOT, "(_islands)", "Foo.tsx")))
    .toBe(false);
});
