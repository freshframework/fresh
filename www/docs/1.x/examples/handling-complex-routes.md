---
description: |
  Sometimes URL based routing isn't enough.
---

The page on [routing](/docs/1.x/concepts/routing) hints at complex routing based
on URL patterns using a `RouteConfig` object. Let's dive into this in a bit more
detail.

A `RouteConfig` has a `routeOverride` string property, which makes use of the
[URL Pattern API](https://developer.mozilla.org/en-US/docs/Web/API/URL_Pattern_API).
Here you can define named groups, wildcards, regex groups, and other bits.

## Simple Route Config

Let's look at the example from the routing page more closely. We'll flesh out
the handler so that we end up with something like the following:

```ts routes/x.tsx
import { FreshContext, RouteConfig } from "$fresh/server.ts";

export const handler = {
  GET(_req: Request, { params }: FreshContext) {
    console.log(params);
    return new Response(params.path);
  },
};

export const config: RouteConfig = {
  routeOverride: "/x/:module@:version/:path*",
};
```

Now if we hit the server with a request like
`http://localhost:8000/x/bestModule@1.33.7/asdf`, then logging the params will
show the following:

```txt Console output
{
  module: "bestModule",
  version: "1.33.7",
  path: "asdf"
}
```

## Complex Route Config

Let's look at something a bit more complex:

```ts routes/api.tsx
import { FreshContext, RouteConfig } from "$fresh/server.ts";

export const handler = {
  GET(_req: Request, { params }: FreshContext) {
    console.log(params);
    return new Response(params.path);
  },
};

export const config: RouteConfig = {
  routeOverride: "/api/db/:resource(jobs?|bar)/:id(\\d+)?",
};
```

Values are available via `params.resource` and `params.id`.

Here are some example URLs that match this:

- `/api/db/bar/1`
- `/api/db/jobs/1`
- `/api/db/job/1`
- `/api/db/job`
- `/api/db/jobs`
- `/api/db/bar`

Here are some that don't:

- `/api/db/other/123`
- `/api/db/jobs/abc`
- `/api/db`

## Regex

At this point is should be clear that this is essentially an exercise in
understanding regex. There are [numerous](https://regexr.com/)
[resources](https://regex101.com/) [available](https://chat.openai.com/) for
getting assistance with regex.
