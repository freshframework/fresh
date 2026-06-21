---
description: |
  Create JSON API endpoints by defining handler-only routes without a page component.
---

A route that exports only `handlers` (no default component export) becomes an API endpoint - it returns responses directly instead of rendering HTML.

## Basic JSON API

```ts routes/api/users.ts
import { define } from "@/utils.ts";

export const handlers = define.handlers({
  GET(ctx) {
    const users = [
      { id: 1, name: "Alice" },
      { id: 2, name: "Bob" },
    ];
    return Response.json(users);
  },
});
```

A `GET /api/users` request returns:

```json
[
  { "id": 1, "name": "Alice" },
  { "id": 2, "name": "Bob" }
]
```

## Method-specific handlers

Define different logic per HTTP method. Methods you don't define will automatically return `405 Method Not Allowed`:

```ts routes/api/posts/[id].ts
import { define } from "@/utils.ts";

export const handlers = define.handlers({
  async GET(ctx) {
    const post = await db.posts.find(ctx.params.id);
    if (!post) {
      return Response.json({ error: "Not found" }, { status: 404 });
    }
    return Response.json(post);
  },

  async PUT(ctx) {
    const body = await ctx.req.json();
    const post = await db.posts.update(ctx.params.id, body);
    return Response.json(post);
  },

  async DELETE(ctx) {
    await db.posts.delete(ctx.params.id);
    return new Response(null, { status: 204 });
  },
});
```

## Catch-all handler

Export a single function instead of a method object to handle all HTTP methods:

```ts routes/api/health.ts
import { define } from "@/utils.ts";

export const handlers = define.handlers((ctx) => {
  return Response.json({ status: "ok", method: ctx.req.method });
});
```

## Programmatic API routes

API routes can also be defined directly on the app without [file-based routing](/docs/concepts/file-routing):

```ts main.ts
const app = new App()
  .get("/api/time", () => Response.json({ time: new Date().toISOString() }))
  .post("/api/echo", async (ctx) => {
    const body = await ctx.req.text();
    return new Response(body);
  });
```
