import { App } from "fresh";

export const app = new App().use(async (ctx) => {
  console.log("Middleware ran for", ctx.req.url);
  return ctx.next();
});
