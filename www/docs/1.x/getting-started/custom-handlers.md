---
description: |
  Add custom handlers to a route to customize HTTP headers, implement API
  routes, do data fetching for a rendered page, or handle form submissions.
---

Routes actually consist of two parts: handlers, and the page component. Up to
now, only the page component has been discussed in this chapter.

Handlers are functions in the form of `Request => Response` or
`Request => Promise<Response>` that are called when a request is made to a
particular route. There can be one handler that covers all HTTP methods or one
handler per method.

The handler has access to the `Request` object that backs the request to the
route and must return a `Response` object. The response object can either be
created manually (for example a JSON response for an API route), or it can be
created by rendering the page component. By default, all routes that don't
define a custom handler use a default handler that just renders the page
component.

To define a handler in a route module, one must export it as a named export with
the name `handler`. Handlers can have two forms: a plain function (catchall for
all HTTP methods) or a plain object where each property is a function named by
the HTTP method it handles.

Here is an example of a custom `GET` handler that renders the page component and
then adds a custom header to the response before returning it:

```tsx routes/about.tsx
import { Handlers } from "$fresh/server.ts";

export const handler: Handlers = {
  async GET(_req, ctx) {
    const resp = await ctx.render();
    resp.headers.set("X-Custom-Header", "Hello");
    return resp;
  },
};

export default function AboutPage() {
  return (
    <main>
      <h1>About</h1>
      <p>This is the about page.</p>
    </main>
  );
}
```

Note that handlers do not need to call `ctx.render()`. This feature can be used
to create API routes. Here is an API route that returns a random UUID as a JSON
response:

```ts routes/api/random-uuid.ts
import { Handlers } from "$fresh/server.ts";

export const handler: Handlers = {
  GET(_req) {
    const uuid = crypto.randomUUID();
    return new Response(JSON.stringify(uuid), {
      headers: { "Content-Type": "application/json" },
    });
  },
};
```

Handlers can do much more, including fetching data from a database or external
API and passing it to their route.
