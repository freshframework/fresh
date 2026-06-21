---
description: |
  Every handler and middleware receives a context object with the request,
  URL, route params, state, and helpers like redirect and next.
---

Every [handler](/docs/concepts/routes) and [middleware](/docs/concepts/middleware) receives a context object as its only argument. It is conventionally named `ctx`. The context carries the request, a few derived properties, the typed route params, the state set by middleware, and a small number of helpers.

```tsx
export const handlers = handler((ctx) => {
  ctx.req; // the Request
  ctx.url; // the parsed URL
  ctx.params; // route params
  ctx.state; // shared state from middleware
  return { data: null };
});
```

## Properties

| Property | Type | Description |
| --- | --- | --- |
| `req` | `Request` | The incoming request. Read the body with `req.formData()`, `req.json()`, and so on. |
| `url` | `URL` | `req.url` parsed once. Read the path with `url.pathname` and the query with `url.searchParams`. |
| `params` | `Record<string, string>` | Route parameters, typed from the file's `[bracket]` segments. |
| `state` | `S` | Shared state, typed from the closest [`_middleware`](/docs/concepts/middleware). |
| `error` | `unknown` | The thrown value. Only set when the route was reached via the [error page](/docs/concepts/error-pages). |
| `isPartial` | `boolean` | `true` for a client-driven [partial navigation](/docs/advanced/partials). |
| `runtime` | `RuntimeContext \| undefined` | Deployment-target request context (a host's bindings or env). `undefined` when the host provides none. |

## Reading request data

Reading the body, the query string, and headers is plain Fetch API. The context is just a thin layer over a normal `Request`.

```tsx
export const handlers = handler({
  async POST(ctx) {
    const form = await ctx.req.formData(); // form submissions
    const body = await ctx.req.json(); // JSON body
    const q = ctx.url.searchParams.get("q"); // ?q=
    const auth = ctx.req.headers.get("authorization");
    // ...
    return { data: null };
  },
});
```

## Methods

### `redirect(pathOrUrl, status?)`

Builds a redirect `Response`. The default status is `302`. Pass `303` after a form `POST`. Pass `307` or `308` to preserve the method.

```tsx
return ctx.redirect("/dashboard"); // 302
return ctx.redirect("/login", 303); // after a POST
```

Protocol-relative paths like `//evil.com/x` are collapsed to a single `/`. This means a trusted path coming from your own code can't be turned into a cross-origin redirect by user-supplied input.

### `next(state?)`

Available on middleware only. Calls the next middleware in the chain, or the route handler if this is the last one. [Middleware](/docs/concepts/middleware) uses it to continue the chain and to pass state forward.

```tsx
export default middleware((ctx) => {
  return ctx.next({ ...ctx.state, user: getUser(ctx.req) });
});
```

### `waitUntil(promise)`

Hands the host a promise that should keep the invocation alive past the response. Use it for logging, analytics, or cache writes that should not block the response itself.

```tsx
ctx.waitUntil(logAnalytics(ctx.req));
```

On hosts without a native `waitUntil` (Node in dev, for example), the promise still runs. It just isn't tracked.
