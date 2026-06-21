import { handler } from "./$index.ts";

export const handlers = handler({
  GET(ctx) {
    return ctx.url.pathname === "/concepts/architechture"
      ? ctx.redirect("/docs/concepts/architecture")
      : ctx.redirect("/docs/introduction");
  },
});
