import { handler } from "./$redirect.ts";

// The handler 303-redirects (regardless of method) to `?to=` (default
// /partials/about). A partial fetch follows the redirect transparently and
// swaps in the target's region; for a plain navigation the client then corrects
// the committed history entry to the redirect target, while an `f-partial`
// navigation deliberately keeps its committed URL at the link's `href`.
export const handlers = handler((ctx) => {
  const to = ctx.url.searchParams.get("to") ?? "/partials/about";
  return Response.redirect(new URL(to, ctx.url), 303);
});
