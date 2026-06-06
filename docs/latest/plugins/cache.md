---
description: "Server-side response caching with the cache middleware"
---

The `cache()` middleware adds server-side response caching to your Fresh app
using the
[Web Cache API](https://developer.mozilla.org/en-US/docs/Web/API/Cache). Routes
opt into caching by setting standard `Cache-Control` headers on their responses.

```ts main.ts
import { App, cache, staticFiles } from "fresh";

const app = new App()
  .use(staticFiles())
  .use(cache())
  .get("/", (ctx) => {
    return new Response("hello", {
      headers: {
        "Cache-Control": "public, max-age=60",
      },
    });
  });
```

Only responses that are `public`, have a positive `max-age`, return status 200,
and don't set cookies are cached. Responses without `Cache-Control` or with
`private`/`no-store` pass through untouched.

## Opting in from a route

Routes control their own caching policy through standard `Cache-Control`
headers. Return them from your handler via `page()` or a raw `Response`:

```ts routes/blog/[slug].tsx
import { page } from "fresh";

export const handler = define.handlers({
  GET(ctx) {
    const post = getPost(ctx.params.slug);
    return page({ post }, {
      headers: {
        "Cache-Control": "public, max-age=60",
      },
    });
  },
});

export default define.page<typeof handler>(({ data }) => {
  return <article>{data.post.title}</article>;
});
```

## Stale-while-revalidate

For ISR-like behavior, use the `stale-while-revalidate` directive. This serves a
cached response immediately while regenerating a fresh one in the background:

```ts
"Cache-Control": "public, max-age=60, stale-while-revalidate=300"
```

This means: serve the cached version for 60 seconds, then for the next 5 minutes
serve the stale version while fetching a fresh one in the background. After the
stale window expires, the next request waits for a fresh response.

## Scoping to specific paths

You can scope caching to a subset of routes:

```ts main.ts
import { App, cache } from "fresh";

const app = new App()
  // Only cache blog pages
  .use("/blog/*", cache())
  .get("/blog/:slug", blogHandler);
```

## Manual invalidation

When content changes and you don't want to wait for the TTL to expire, use the
Web Cache API directly to purge entries:

```ts routes/blog/[slug].tsx
export const handler = define.handlers({
  async POST(ctx) {
    await updatePost(ctx.params.slug);

    // Purge the cached page
    const store = await caches.open("fresh");
    await store.delete(new URL(`/blog/${ctx.params.slug}`, ctx.url));

    return ctx.redirect(`/blog/${ctx.params.slug}`);
  },
});
```

## Options

| Option        | Type                    | Default   | Description                                             |
| ------------- | ----------------------- | --------- | ------------------------------------------------------- |
| `cacheName`   | `string`                | `"fresh"` | Name of the Web Cache API store                         |
| `methods`     | `string[]`              | `["GET"]` | HTTP methods to cache                                   |
| `shouldCache` | `(req, res) => boolean` | —         | Custom function to override default cacheability checks |

### Custom cacheability

By default, only 200 responses with `Cache-Control: public` and a positive
`max-age` are cached. Override this with `shouldCache`:

```ts
app.use(cache({
  shouldCache: (_req, res) => {
    return res.headers.get("X-Cache") === "yes";
  },
}));
```

When using a custom `shouldCache`, entries without a `max-age` are treated as
permanently fresh (no automatic expiry).
