import { expect } from "@std/expect/expect";
import { isHandlerByMethod, page } from "./handlers.ts";

Deno.test("handlers - page() with no args returns undefined data", () => {
  const result = page();
  expect(result.data).toBeUndefined();
  expect(result.status).toBeUndefined();
  expect(result.headers).toBeUndefined();
});

Deno.test("handlers - page() with data returns that data", () => {
  const result = page("hello");
  expect(result.data).toBe("hello");
});

Deno.test("handlers - page() with null data returns undefined", () => {
  // `null ?? undefined` evaluates to `undefined` due to the ?? operator
  const result = page(null);
  expect(result.data).toBeUndefined();
});

Deno.test("handlers - page() with options returns status and headers", () => {
  const result = page({ msg: "hi" }, {
    headers: { "X-Custom": "1" },
    status: 201,
  });
  expect(result.data).toEqual({ msg: "hi" });
  expect(result.status).toBe(201);
  expect(result.headers).toEqual({ "X-Custom": "1" });
});

Deno.test("handlers - page() with partial options", () => {
  const result = page({ msg: "hi" }, { status: 404 });
  expect(result.data).toEqual({ msg: "hi" });
  expect(result.status).toBe(404);
  expect(result.headers).toBeUndefined();
});

// -- isHandlerByMethod -------------------------------------------------

Deno.test("handlers - isHandlerByMethod with object returns true", () => {
  const handler = { GET: () => new Response("ok") };
  expect(isHandlerByMethod(handler)).toBe(true);
});

Deno.test("handlers - isHandlerByMethod with empty object returns true", () => {
  // An empty object is still technically an object — the type guard
  // distinguishes between functions and method maps.
  expect(isHandlerByMethod({})).toBe(true);
});

Deno.test("handlers - isHandlerByMethod with function returns false", () => {
  const handler = () => new Response("ok");
  expect(isHandlerByMethod(handler)).toBe(false);
});

Deno.test("handlers - isHandlerByMethod with array returns false", () => {
  expect(isHandlerByMethod([])).toBe(false);
});

Deno.test("handlers - isHandlerByMethod with null returns false", () => {
  expect(isHandlerByMethod(null)).toBe(false);
});
