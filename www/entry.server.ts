import { App } from "fresh";

export const app = new App().use(async (ctx) => {
  // Redirect the legacy fresh.deno.dev origin to usefresh.dev.
  if (ctx.url.origin === "https://fresh.deno.dev") {
    const newUrl = new URL(ctx.url);
    newUrl.hostname = "usefresh.dev";
    return Response.redirect(newUrl, 307);
  }

  // Never serve trailing slashes (except the root path).
  if (ctx.url.pathname !== "/" && ctx.url.pathname.endsWith("/")) {
    const newUrl = new URL(ctx.url);
    newUrl.pathname = newUrl.pathname.replace(/\/+$/, "");
    return Response.redirect(newUrl, 308);
  }

  return await ctx.next();
});
