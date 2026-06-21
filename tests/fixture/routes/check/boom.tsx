import { handler } from "./$boom.ts";

// A handler that throws a plain error — routed through `_error` and rendered as
// a 500 with the error attached as `ctx.error` / `props.error`.
export const handlers = handler({
  GET() {
    throw new Error("kaboom");
  },
});
