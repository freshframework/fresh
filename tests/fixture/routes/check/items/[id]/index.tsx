import { handler } from "./$index.ts";

// Surfaces both the route's own `ctx.params.id` and the `state.item` the
// dynamic-folder `_middleware.tsx` seeded from that same param, proving the
// param reached the middleware.
export const handlers = handler({
  GET(ctx) {
    return Response.json({ id: ctx.params.id, item: ctx.state.item });
  },
});
