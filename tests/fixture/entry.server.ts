import { App } from "fresh";

// Programmatic server entry. The exported `app`'s middlewares run ahead of
// every route, like a rootmost `routes/_middleware`. This one tags every
// response with a header so the integration suite can prove it ran.
export const app = new App();

app.use(async (ctx) => {
  const res = await ctx.next();
  const headers = new Headers(res.headers);
  headers.set("x-app-middleware", "ran");
  return new Response(res.body, {
    status: res.status,
    statusText: res.statusText,
    headers,
  });
});
