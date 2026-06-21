import { test } from "vitest";

import type { Handler, InferData } from "./types.ts";

// Compile-time `Expect<true>` style. If the conditional resolves to `false`,
// the parameter type below errors at type-check.
type Equal<A, B> =
  (<_T>() => _T extends A ? 1 : 2) extends <_T>() => _T extends B ? 1 : 2 ? true : false;
function assertEq<_T extends true>(): void {}

interface Params {}
interface State {}

// Identity helper that mirrors the generated `$<route>.ts` shape.
function handler<H extends Handler<Params, State>>(h: H): H {
  return h;
}

test("InferData picks up `{ data }` even when a sibling method returns `Response`", () => {
  const handlers = handler({
    GET() {
      return new Response("ok");
    },
    POST() {
      return { data: { sent: true as const } };
    },
  });

  type D = InferData<typeof handlers>;
  assertEq<Equal<D, { sent: true }>>();
});

test("InferData picks up `{ data }` when a single handler may return `Response | { data }`", () => {
  const handlers = handler({
    GET(ctx) {
      if (ctx.url.searchParams.get("redirect")) {
        return ctx.redirect("/login", 303);
      }
      return { data: { topic: ctx.url.searchParams.get("topic") } };
    },
  });

  type D = InferData<typeof handlers>;
  assertEq<Equal<D, { topic: string | null }>>();
});

test("InferData unwraps Promise<Response | { data }> on async handlers", () => {
  const handlers = handler({
    async POST(ctx) {
      const form = await ctx.req.formData();
      if (!form.get("ok")) return new Response(null, { status: 400 });
      return { data: { saved: true as const } };
    },
  });

  type D = InferData<typeof handlers>;
  assertEq<Equal<D, { saved: true }>>();
});

test("InferData resolves to `never` when no handler returns `{ data }`", () => {
  const handlers = handler({
    GET(ctx) {
      return ctx.redirect("/", 302);
    },
    POST() {
      return new Response("created", { status: 201 });
    },
  });

  type D = InferData<typeof handlers>;
  assertEq<Equal<D, never>>();
});
