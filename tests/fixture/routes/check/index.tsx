import { handler } from "./$index.ts";

// Reads the state seeded by `check/_middleware.tsx` — proves middleware → handler
// state propagation. Handlers-only (no page): the Response is passed through.
export const handlers = handler({
  GET(ctx) {
    return Response.json({ user: ctx.state.user });
  },
});
