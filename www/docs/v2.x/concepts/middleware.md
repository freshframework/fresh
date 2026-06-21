---
description: |
  Add middleware routes to intercept requests or responses for analytics purposes, access control, or anything else.
---

A middleware is a function that receives a [`Context`](/docs/concepts/context)
object with the
[`Request`](https://developer.mozilla.org/en-US/docs/Web/API/Request) and
returns a
[`Response`](https://developer.mozilla.org/en-US/docs/Web/API/Response). They
are typically used to set HTTP Headers, measure response times or fetch data and
pass it to another middleware.

```tsx main.ts
const app = new App<{ greeting: string }>()
  .use((ctx) => {
    // Middleware to pass data
    ctx.state.greeting = "Hello world";
    return ctx.next();
  })
  .use(async (ctx) => {
    // Middleware to add a HTTP header
    const res = await ctx.next();
    res.headers.set("server", "fresh server");
    return res;
  })
  // A handler is a form of middleware that responds. Here we
  // render HTML and return it.
  .get("/", (ctx) => {
    return ctx.render(<h1>{ctx.state.greeting}</h1>);
  });
```

Middlewares can be chained and combined in whatever way you desire. They are an
excellent way to make http-related logic reusable on the server.

## Middleware helper

Use the `define.middleware()` helper to get typings out of the box:

```ts middleware/my-middleware.ts
import { define } from "../utils.ts";

const middleware = define.middleware(async (ctx) => {
  console.log("my middleware");
  return await ctx.next();
});
```

## Included middlewares

Fresh ships with the following middlewares built-in:

- [cors()](/docs/plugins/cors) - Set CORS HTTP headers
- [csrf()](/docs/plugins/csrf) - CSRF protection
- [csp()](/docs/plugins/csp) - Content Security Policy headers
- [trailingSlashes()](/docs/plugins/trailing-slashes) - Enforce trailing slashes

## Filesystem-based middlewares

With [file system based routing](/docs/concepts/file-routing) you can define a
middleware in a `_middleware.ts` file inside the `routes/` folder or any of its
subfolders.

```ts routes/_middleware.ts
import { define } from "../utils.ts";

export default define.middleware(async (ctx) => {
  console.log("my middleware");
  return await ctx.next();
});
```

You can also export an array of middlewares:

```ts routes/_middleware.ts
import { define } from "../utils.ts";

const middleware1 = define.middleware(async (ctx) => {
  console.log("A");
  return await ctx.next();
});

const middleware2 = define.middleware(async (ctx) => {
  console.log("B");
  return await ctx.next();
});

export default [middleware1, middleware2];
```
