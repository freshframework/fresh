import { handler } from "./$[...path].ts";

// Catch-all: `[...path]` compiles to rou3's named-greedy `:path*`, so the
// remainder of the URL lands in `ctx.params.path`.
export const handlers = handler({
  GET(ctx) {
    return Response.json({ path: ctx.params.path });
  },
});
