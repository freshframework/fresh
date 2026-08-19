import { expect } from "@std/expect";
import { joinViteQuery, splitViteQuery } from "./utils.ts";

Deno.test("splitViteQuery - keeps specifier and query apart", () => {
  expect(splitViteQuery("@/assets/icons/plus.svg?raw")).toEqual({
    specifier: "@/assets/icons/plus.svg",
    query: "?raw",
  });
  expect(splitViteQuery("/abs/debug.module.js?v=ff8da874")).toEqual({
    specifier: "/abs/debug.module.js",
    query: "?v=ff8da874",
  });
  expect(splitViteQuery("file:///tmp/foo.js")).toEqual({
    specifier: "file:///tmp/foo.js",
    query: "",
  });
});

Deno.test("joinViteQuery - reattaches Vite queries", () => {
  expect(joinViteQuery("/abs/plus.svg", "?raw")).toBe("/abs/plus.svg?raw");
  expect(joinViteQuery("/abs/plus.svg", "")).toBe("/abs/plus.svg");
});
