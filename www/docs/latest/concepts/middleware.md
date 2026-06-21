---
description: |
  Add middleware to intercept requests before they reach a route. For
  authentication, logging, response headers, or computing typed state that
  flows down to handlers and pages.
---

A middleware is defined in a `_middleware.tsx` file inside the `routes/` directory. It intercepts the request before the route's [handler](/docs/concepts/routes) runs. This lets you perform custom logic before or after the handler, modify or inspect the request and response. Common use cases are logging, authentication, setting response headers, and computing state that the rest of the chain can read.

Each middleware receives a `ctx` argument. Call `ctx.next()` to invoke the next middleware (or the route handler, if this is the last one). Whatever that returns is the eventual `Response`. The same `ctx` has a `state` property used to pass arbitrary data downstream. Handlers, pages, and layouts below this middleware can read `ctx.state` (or, in components, `props.state`). State flows along the chain by passing a new object to `next`, like `ctx.next({ user })`. The shape is typed by the `State` interface you export. The generated `ParentState` type carries forward whatever state ancestors already added. See [Type checking](/docs/advanced/type-checking).

```tsx routes/_middleware.tsx
import { middleware } from "./$_middleware.ts";

export interface State {
  startedAt: number;
}

export default middleware(async (ctx) => {
  const res = await ctx.next({ startedAt: Date.now() });
  res.headers.set("server", "fresh");
  return res;
});
```

```tsx routes/index.tsx
import { page } from "./$index.ts";

export default page((props) => {
  // props.state.startedAt is typed from the middleware's State
  return <p>Request started at {props.state.startedAt}.</p>;
});
```

Middlewares are scoped and can be layered. A project can have any number of middleware files, each covering a different set of routes. If multiple middlewares cover the same route, all of them run, in order of specificity (least specific first).

For example, take a project with the following routes:

```txt-files Project structure
└── <root>/routes
    ├── _middleware.tsx
    ├── index.tsx
    └── admin
        ├── _middleware.tsx
        ├── index.tsx
        └── signin.tsx
```

For a request to `/`, the flow is:

1. `routes/_middleware.tsx` runs.
2. Calling `ctx.next()` invokes the `routes/index.tsx` handler.

For a request to `/admin`, the flow is:

1. `routes/_middleware.tsx` runs.
2. Calling `ctx.next()` invokes `routes/admin/_middleware.tsx`.
3. Calling `ctx.next()` invokes the `routes/admin/index.tsx` handler.

For a request to `/admin/signin`, the flow is:

1. `routes/_middleware.tsx` runs.
2. Calling `ctx.next()` invokes `routes/admin/_middleware.tsx`.
3. Calling `ctx.next()` invokes the `routes/admin/signin.tsx` handler.

Middleware also has access to route parameters. If you have a `routes/[tenant]/admin/_middleware.tsx` like the following, and the request is for `mysaas.com/acme/admin/`, then `ctx.params.tenant` is `"acme"` inside the middleware.

```tsx routes/[tenant]/admin/_middleware.tsx
import { middleware } from "./$_middleware.ts";

export default middleware(async (ctx) => {
  const currentTenant = ctx.params.tenant;
  // do something with the tenant
  return ctx.next();
});
```

## Short-circuiting

Returning a `Response` instead of calling `ctx.next()` stops the chain. The rest of the middlewares and the route handler are skipped, and the response goes straight back to the client. This is how you implement auth gates.

```tsx routes/admin/_middleware.tsx
import { middleware } from "./$_middleware.ts";

export default middleware((ctx) => {
  if (!isLoggedIn(ctx.req)) {
    return ctx.redirect("/login", 303);
  }
  return ctx.next();
});
```

To redirect from middleware, prefer [`ctx.redirect`](/docs/concepts/context). It guards against protocol-relative URLs. If you'd rather build the response yourself:

```tsx routes/_middleware.tsx
import { middleware } from "./$_middleware.ts";

export default middleware(() => {
  return new Response("", {
    status: 307,
    headers: { Location: "/my/new/relative/path" },
  });
});
```

`307` is a temporary redirect. Use `301` (or `308`) for a permanent one.

## Extending state

`ctx.next(state)` passes the **entire** new state. There is no automatic merging. If your middleware should add fields to whatever the parent middlewares already added, spread the existing state or extend `ParentState`.

```tsx routes/admin/_middleware.tsx
import { middleware, ParentState } from "./$_middleware.ts";

export interface State extends ParentState {
  user: { id: string; isAdmin: boolean };
}

export default middleware(async (ctx) => {
  const user = await loadUser(ctx);
  if (!user.isAdmin) return new Response("Forbidden", { status: 403 });
  return ctx.next({ ...ctx.state, user });
});
```

Routes nested under `admin/` then see both the parent state and `ctx.state.user`, fully typed.

## Global middleware

To run middleware for every route, ahead of all file-based middleware, export an `App` from a root `entry.server.ts` and register callbacks with `app.use()`.

```ts entry.server.ts
import { App } from "fresh";

export const app = new App().use((ctx) => {
  // Redirect an old host to the new one.
  if (ctx.url.hostname === "old.example.com") {
    const url = new URL(ctx.url);
    url.hostname = "example.com";
    return Response.redirect(url, 308);
  }
  return ctx.next();
});
```

Each `app.use(fn)` runs like a rootmost `_middleware`, before any route's file-based middleware. `app.use()` is chainable, so you can register several callbacks in a row.
