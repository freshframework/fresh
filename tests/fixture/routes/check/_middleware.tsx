import { middleware, ParentState } from "./$_middleware.ts";

// Exercises three middleware capabilities at once:
//   * short-circuit  — returns a Response without calling `next` (on `?block`),
//     so the route handler never runs;
//   * state seeding  — passes new state forward via `next(state)`;
//   * post-process   — awaits `next()` and mutates the resulting Response.
export default middleware(async function (ctx) {
  if (ctx.url.searchParams.has("block")) {
    return new Response("blocked by middleware", { status: 403 });
  }
  const res = await ctx.next({ ...ctx.state, user: "ada" });
  res.headers.set("x-check-mw", "ran");
  return res;
});

export interface State extends ParentState {
  user: string;
}
