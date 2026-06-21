---
description: |
  How routing works in Fresh, including route patterns, matching priority, method-specific handlers, and URLPattern support.
---

Routing defines which middlewares and routes should respond to a particular
request.

```ts main.ts
import { App } from "fresh";

const app = new App()
  .get("/", () => new Response("hello")) // Responds to: GET /
  .get("/other", () => new Response("other")) // Responds to: GET /other
  .post("/upload", () => new Response("upload")) // Responds to: POST /upload
  .get("/books/:id", (ctx) => {
    // Responds to: GET /books/my-book, /books/cool-book, etc
    const id = ctx.params.id;
    return new Response(`Book id: ${id}`);
  })
  .get("/blog/:post/comments", (ctx) => {
    // Responds to: GET /blog/my-post/comments, /blog/hello/comments, etc
    const post = ctx.params.post;
    return new Response(`Blog post comments for post: ${post}`);
  })
  .get("/foo/*", (ctx) => {
    // Responds to: GET /foo/bar, /foo/bar/baz, etc
    return new Response("foo");
  });
```

Fresh supports the full
[`URLPattern`](https://developer.mozilla.org/en-US/docs/Web/API/URL_Pattern_API)
syntax for setting pathnames.

## Route matching priority

Routes are matched in the following order:

1. **Static routes** (exact path match like `/about`) are checked first and
   always take precedence.
2. **Dynamic routes** (patterns like `/posts/:id`) are checked in the order they
   were registered. The first matching route wins.

This means the registration order matters for dynamic routes:

```ts main.ts
const app = new App()
  // This is checked first since it's registered first
  .get("/posts/featured", () => new Response("Featured posts"))
  // This is checked second - won't match "/posts/featured" because it's
  // already handled above
  .get("/posts/:id", (ctx) => new Response(`Post: ${ctx.params.id}`));
```

## HTTP method handlers

Fresh provides method-specific route registration via `.get()`, `.post()`,
`.put()`, `.delete()`, `.head()`, `.patch()`, and `.options()`. Each method only
responds to its matching HTTP verb.

Use `.all()` to respond to any HTTP method:

```ts main.ts
app.all("/api/health", () => new Response("ok"));
```

If a route is registered for `GET` but receives a `POST` request, Fresh returns
a `405 Method Not Allowed` response. `HEAD` requests automatically fall back to
the `GET` handler if no dedicated `HEAD` handler is defined.

## File-based route handlers

In file-based routes, export a `handlers` object with method-specific functions:

```ts routes/api/users.ts
import { define } from "@/utils.ts";

export const handlers = define.handlers({
  GET(ctx) {
    return new Response(JSON.stringify({ users: [] }), {
      headers: { "Content-Type": "application/json" },
    });
  },
  POST(ctx) {
    return new Response("Created", { status: 201 });
  },
});
```

To handle all methods, export a single function instead:

```ts routes/api/health.ts
import { define } from "@/utils.ts";

export const handlers = define.handlers((ctx) => {
  return new Response(`Received a ${ctx.req.method} request`);
});
```

See [File routing](/docs/concepts/file-routing) for more on the file-based
routing convention.
