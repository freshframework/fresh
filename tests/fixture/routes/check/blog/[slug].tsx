import { handler } from "./$[slug].ts";

// Dynamic segment: `/check/blog/:slug` → `ctx.params.slug`.
export const handlers = handler({
  GET(ctx) {
    return Response.json({ slug: ctx.params.slug });
  },
});
