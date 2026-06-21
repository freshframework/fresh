---
description: |
  CORS enabling routes in your Fresh project.
---

So you've encountered some CORS problems and are on the hunt for the solution?
You're in the right spot.

Here's a good [resource](https://developer.mozilla.org/en-US/docs/Web/HTTP/CORS)
talking about CORS in general, in case you don't fully understand what's wrong.

## Simple CORS -- Middleware

As per the above link, "simple" requests involve `GET`, `HEAD`, or `POST`
requests. You can CORS enable all the routes affected by some `middleware` by
doing the following:

```ts routes/_middleware.ts
import { FreshContext } from "$fresh/server.ts";

export async function handler(req: Request, ctx: FreshContext) {
  const origin = req.headers.get("Origin") || "*";
  const resp = await ctx.next();
  const headers = resp.headers;

  headers.set("Access-Control-Allow-Origin", origin);
  headers.set("Access-Control-Allow-Credentials", "true");
  headers.set(
    "Access-Control-Allow-Headers",
    "Content-Type, Content-Length, Accept-Encoding, X-CSRF-Token, Authorization, accept, origin, Cache-Control, X-Requested-With",
  );
  headers.set(
    "Access-Control-Allow-Methods",
    "POST, OPTIONS, GET, PUT, DELETE",
  );

  return resp;
}
```

## Complex CORS -- Middleware

What about for one of the other HTTP methods? Then you'll need to be able to
deal with "preflight requests". Let's imagine you're trying to support a
`DELETE` route. Then you'd need to do something like this:

```ts routes/_middleware.ts
import { FreshContext } from "$fresh/server.ts";

export async function handler(req: Request, ctx: FreshContext) {
  if (req.method == "OPTIONS") {
    const resp = new Response(null, {
      status: 204,
    });
    const origin = req.headers.get("Origin") || "*";
    const headers = resp.headers;
    headers.set("Access-Control-Allow-Origin", origin);
    headers.set("Access-Control-Allow-Methods", "DELETE");
    return resp;
  }
  const origin = req.headers.get("Origin") || "*";
  const resp = await ctx.next();
  const headers = resp.headers;

  headers.set("Access-Control-Allow-Origin", origin);
  headers.set("Access-Control-Allow-Credentials", "true");
  headers.set(
    "Access-Control-Allow-Headers",
    "Content-Type, Content-Length, Accept-Encoding, X-CSRF-Token, Authorization, accept, origin, Cache-Control, X-Requested-With",
  );
  headers.set(
    "Access-Control-Allow-Methods",
    "POST, OPTIONS, GET, PUT, DELETE",
  );

  return resp;
}
```

These complex results require a two step process:

1. the browser makes an `OPTIONS` request to find out about the allowed methods
2. the browser makes the actual request

So you can see the middleware has some special handling to deal with `OPTIONS`
requests.

## CORS in Routes

Of course there's no reason why you need to use middleware in order to solve
this. The headers can be set directly in the
[handler](/docs/1.x/getting-started/custom-handlers) as well.
