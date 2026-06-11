import { expect } from "@std/expect/expect";
import type { Span } from "@opentelemetry/api";
import { SpanStatusCode } from "@opentelemetry/api";
import { recordSpanError } from "./otel.ts";

/** Creates a trackable Span mock without external mock libraries. */
function mockSpan() {
  const calls: Record<string, unknown[][]> = {};

  return {
    _calls: calls,
    span: {
      recordException(err: Error) {
        (calls.recordException ??= []).push([err]);
      },
      setStatus(status: { code: number; message: string }) {
        (calls.setStatus ??= []).push([status]);
      },
    } as Span,
  };
}

Deno.test("otel - recordSpanError with Error calls recordException", () => {
  const err = new Error("test error");
  const { span, _calls } = mockSpan();

  recordSpanError(span, err);

  expect(_calls.recordException).toBeDefined();
  expect(_calls.recordException[0][0]).toBe(err);
  expect(_calls.setStatus).toBeUndefined();
});

Deno.test("otel - recordSpanError with string calls setStatus", () => {
  const { span, _calls } = mockSpan();

  recordSpanError(span, "something broke");

  expect(_calls.recordException).toBeUndefined();
  expect(_calls.setStatus).toBeDefined();
  expect(_calls.setStatus[0][0]).toEqual({
    code: SpanStatusCode.ERROR,
    message: "something broke",
  });
});

Deno.test("otel - recordSpanError with object calls setStatus", () => {
  const customErr = { custom: "problem" };
  const { span, _calls } = mockSpan();

  recordSpanError(span, customErr);

  expect(_calls.setStatus).toBeDefined();
  expect(_calls.setStatus[0][0]).toEqual({
    code: SpanStatusCode.ERROR,
    message: String(customErr),
  });
});

Deno.test("otel - recordSpanError with number calls setStatus", () => {
  const { span, _calls } = mockSpan();

  recordSpanError(span, 404);

  expect(_calls.setStatus).toBeDefined();
  expect(_calls.setStatus[0][0]).toEqual({
    code: SpanStatusCode.ERROR,
    message: "404",
  });
});
