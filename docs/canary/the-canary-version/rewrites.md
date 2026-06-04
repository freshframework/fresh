---
description: |
  Use ctx.rewrite() to internally resolve a different route without redirecting the client.
---

Use `ctx.rewrite()` to handle a request under a different route internally,
without sending an HTTP redirect to the browser. The browser URL stays the same,
but Fresh rematches and handles the rewritten path.

```ts
app.use((ctx) => {
  if (ctx.url.pathname.startsWith("/legacy/")) {
    const pathname = ctx.url.pathname.replace("/legacy", "");
    return ctx.rewrite(pathname);
  }

  return ctx.next();
});
```

## Same-origin only

`ctx.rewrite()` only accepts same-origin targets. Passing a cross-origin URL
throws an error.

## Query parameters

When the target is a string without a `?query`, Fresh keeps the current query
parameters on the rewritten request.

## basePath

When `basePath` is configured, absolute string targets (starting with `/`) are
automatically prefixed with the basePath. You only need to include the basePath
yourself when passing a `URL` object.

```ts
// With basePath: "/app", this rewrites to /app/new
app.use((ctx) => ctx.rewrite("/new"));

// URL targets must include the full path with basePath
app.use((ctx) => ctx.rewrite(new URL("/app/new", ctx.url)));
```

## Body ownership

Calling `ctx.rewrite()` transfers the request body to the rewritten request.
Middleware cannot read `ctx.req` body after initiating a rewrite — attempting to
do so throws an error.

## Loop prevention

Fresh limits rewrites to 8 hops per request. Exceeding this limit throws a
`"Too many internal rewrites"` error.

## Middleware use-cases

Use `ctx.rewrite()` in a middleware to implement:

- **i18n routing** — strip a locale prefix and dispatch to the locale-neutral
  route:

  ```ts
  const LOCALES = new Set(["de", "en", "fr"]);

  app.use((ctx) => {
    const [, first, ...rest] = ctx.url.pathname.split("/");
    if (LOCALES.has(first)) {
      ctx.state.locale = first;
      return ctx.rewrite(`/${rest.join("/")}`);
    }
    return ctx.next();
  });
  ```

- **Strangler fig** — transparently forward legacy paths to their new
  counterparts while keeping URLs stable for clients.

- **Canonical routes** — consolidate several aliases into one handler without
  issuing 301s.
