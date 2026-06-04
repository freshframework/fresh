import { App, staticFiles, trailingSlashes } from "fresh";

export const app = new App()
  .use(async (ctx) => {
    // redirect fresh.deno.dev to usefresh.dev
    if (ctx.url.origin === "https://fresh.deno.dev") {
      const newUrl = new URL(ctx.url);
      newUrl.hostname = "usefresh.dev";
      return Response.redirect(newUrl, 307);
    }
    return await ctx.next();
  })
  .use(staticFiles())
  .use(trailingSlashes("never"))
  .fsRoutes();
