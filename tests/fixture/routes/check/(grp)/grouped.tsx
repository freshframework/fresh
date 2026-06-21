import { handler } from "./$grouped.ts";

// Route group: the `(grp)` folder is dropped from the URL but kept in the
// middleware/layout chain, so this resolves at `/check/grouped` while still
// running `check/_middleware.tsx`.
export const handlers = handler({
  GET(ctx) {
    return Response.json({ grouped: true, user: ctx.state.user });
  },
});
