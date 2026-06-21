---
description: |
  How Fresh processes requests: the flow from incoming request through middleware, routing, handlers, layouts, and island hydration.
---

Fresh is a server-first web framework. Pages are rendered on the server and only
the interactive parts ([islands](/docs/concepts/islands)) ship JavaScript to the
browser. This page explains how a request flows through the framework.

## Request lifecycle

![Request lifecycle flow diagram](/docs/architecture-flow-v2.svg)

## Key concepts

### Server-first rendering

Every page is fully rendered to HTML on the server before being sent to the
browser. This means:

- Pages are visible immediately - no blank loading screens
- Search engines see complete content
- Pages work without JavaScript enabled

### Islands architecture

Fresh uses the
[islands architecture](https://jasonformat.com/islands-architecture/). Only
components in the `islands/` directory are [hydrated](/docs/concepts/islands) in
the browser. Everything else is static HTML that never runs JavaScript on the
client.

This means a page with a single interactive button only ships the JavaScript for
that button - not for the entire page.

### Middleware chain

Middlewares execute in registration order, wrapping the handler. Each middleware
calls `ctx.next()` to pass control to the next middleware (or handler). This
creates an onion-like pattern where middlewares can act on both the request
(before `ctx.next()`) and the response (after `ctx.next()`):

```ts
app.use(async (ctx) => {
  // Before: runs on the way in
  console.log("Request:", ctx.url.pathname);

  const response = await ctx.next();

  // After: runs on the way out
  console.log("Status:", response.status);
  return response;
});
```

Scoped middleware runs only for requests that match a specific path prefix. Pass
a path pattern as the first argument to `app.use()`:

```ts
app.use("/admin/*", async (ctx) => {
  // Only runs for /admin/* routes
  const user = ctx.state.user;
  if (!user?.isAdmin) return new Response("Forbidden", { status: 403 });
  return ctx.next();
});
```

Global middleware runs on every request; scoped middleware lets you apply logic
like authentication or logging to a subset of routes.

### Layout inheritance

[Layouts](/docs/concepts/layouts) wrap page components and are inherited from
parent directories. A page at `routes/blog/post.tsx` inherits layouts from:

1. `routes/_layout.tsx` (root layout)
2. `routes/blog/_layout.tsx` (section layout)

Layouts nest from the outside in: the root layout is outermost, each deeper
layout wraps closer to the page, and the innermost layout directly wraps the
page component. The [app wrapper](/docs/concepts/app) (`_app.tsx`) wraps
everything.

### Build and deploy

Fresh uses [Vite](https://vite.dev/) to bundle island JavaScript for production.
The `deno task build` command:

1. Discovers all islands and their dependencies
2. Bundles client-side JavaScript with code splitting
3. Generates a server entry point (`_fresh/server.js`)
4. Hashes assets for cache busting

In production, `_fresh/server.js` serves the pre-built assets. In development,
Vite provides Hot Module Replacement for instant feedback.
