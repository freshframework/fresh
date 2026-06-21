import { test } from "vitest";
import assert from "node:assert/strict";

import { HttpError, MethodNotAllowedError, NotFoundError } from "./errors.ts";

test("HttpError carries the status and a default message per code", () => {
  const e = new HttpError(401);
  assert.equal(e.status, 401);
  assert.equal(e.message, "Unauthorized");
  assert.equal(e.name, "HttpError");
  assert.ok(e instanceof Error);
});

test("HttpError uses a custom message when supplied", () => {
  const e = new HttpError(403, "Nope");
  assert.equal(e.message, "Nope");
});

test("HttpError falls back to `HTTP <status>` for unknown codes", () => {
  assert.equal(new HttpError(418).message, "HTTP 418");
});

test("NotFoundError is a 404 HttpError", () => {
  const e = new NotFoundError();
  assert.ok(e instanceof HttpError);
  assert.ok(e instanceof NotFoundError);
  assert.equal(e.status, 404);
  assert.equal(e.message, "Not Found");
  assert.equal(e.name, "NotFoundError");
});

test("MethodNotAllowedError carries the allowed methods + 405 status", () => {
  const e = new MethodNotAllowedError(["GET", "POST"]);
  assert.ok(e instanceof HttpError);
  assert.equal(e.status, 405);
  assert.equal(e.message, "Method Not Allowed");
  assert.deepEqual([...e.allowed], ["GET", "POST"]);
});
