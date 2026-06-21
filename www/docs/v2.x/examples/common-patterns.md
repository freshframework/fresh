---
description: |
  Common patterns and recipes for Fresh applications: authentication, redirects, content negotiation, cookies, and more.
---

This page collects common patterns you'll encounter when building Fresh apps.

## Protected routes

Use [middleware](/docs/concepts/middleware) to check authentication and redirect
unauthenticated users:

```ts routes/dashboard/_middleware.ts
import { define } from "@/utils.ts";

export default define.middleware(async (ctx) => {
  const session = await getSession(ctx.req);
  if (!session) {
    return ctx.redirect("/login");
  }
  ctx.state.user = session.user;
  return ctx.next();
});
```

All routes under `routes/dashboard/` are now protected. The user data is
available in any downstream handler or component via `ctx.state.user`.

## Redirect old URLs

Handle URL migrations with middleware:

```ts routes/_middleware.ts
import { define } from "@/utils.ts";

const REDIRECTS: Record<string, string> = {
  "/old-page": "/new-page",
  "/blog/old-slug": "/blog/new-slug",
};

export default define.middleware((ctx) => {
  const redirect = REDIRECTS[ctx.url.pathname];
  if (redirect) {
    return ctx.redirect(redirect, 301);
  }
  return ctx.next();
});
```

> [info]: `ctx.redirect()` includes protection against open redirect attacks.
> Protocol-relative URLs like `//evil.com` are rejected.

## Content negotiation

Return different formats based on the `Accept` header:

```ts routes/api/users/[id].ts
import { HttpError } from "fresh";
import { define } from "@/utils.ts";

export const handler = define.handlers({
  async GET(ctx) {
    const user = await db.users.find(ctx.params.id);
    if (!user) {
      throw new HttpError(404);
    }

    const accept = ctx.req.headers.get("Accept") ?? "";
    if (accept.includes("text/html")) {
      return ctx.render(<UserProfile user={user} />);
    }
    return Response.json(user);
  },
});
```

## Setting cookies

Use the `@std/http` cookie utilities:

```ts routes/_middleware.ts
import { getCookies, setCookie } from "@std/http";
import { define } from "@/utils.ts";

export default define.middleware(async (ctx) => {
  const cookies = getCookies(ctx.req.headers);
  ctx.state.theme = cookies["theme"] ?? "light";

  const response = await ctx.next();

  // Set a cookie on the response
  setCookie(response.headers, {
    name: "theme",
    value: ctx.state.theme,
    path: "/",
    httpOnly: true,
    sameSite: "Lax",
    maxAge: 60 * 60 * 24 * 365, // 1 year
  });

  return response;
});
```

See [Session management](/docs/examples/session-management) for a complete
session example.

## Reading query parameters

Access URL search params from the context:

```ts routes/search.tsx
import { page } from "fresh";
import { define } from "@/utils.ts";

export const handler = define.handlers({
  GET(ctx) {
    const query = ctx.url.searchParams.get("q") ?? "";
    const pageNum = Number(ctx.url.searchParams.get("page") ?? "1");
    const results = search(query, pageNum);
    return page({ query, results });
  },
});
```

## Adding response headers

Set custom headers in middleware:

```ts routes/_middleware.ts
import { define } from "@/utils.ts";

export default define.middleware(async (ctx) => {
  const response = await ctx.next();
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("X-Content-Type-Options", "nosniff");
  return response;
});
```

Or set headers on a specific route using `page()`:

```ts
import { page } from "fresh";

return page(data, {
  headers: { "Cache-Control": "public, max-age=3600" },
});
```

## Streaming responses

Return a streaming response from a handler:

```ts routes/api/stream.ts
import { define } from "@/utils.ts";

export const handler = define.handlers({
  GET() {
    const body = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode("Hello "));
        setTimeout(() => {
          controller.enqueue(new TextEncoder().encode("World!"));
          controller.close();
        }, 1000);
      },
    });
    return new Response(body, {
      headers: { "Content-Type": "text/plain" },
    });
  },
});
```

## WebSockets

Fresh provides first-class WebSocket support via `ctx.upgrade()`. See the full
[WebSocket guide](/docs/advanced/websockets) for all options.

## Subdomain routing

Use middleware with `URLPattern` to route based on subdomains:

```ts routes/_middleware.ts
import { define } from "@/utils.ts";

const SUBDOMAIN_PATTERN = new URLPattern({ hostname: ":sub.example.com" });

export default define.middleware(async (ctx) => {
  const match = SUBDOMAIN_PATTERN.exec(ctx.req.url);
  if (match) {
    const sub = match.hostname.groups["sub"];
    ctx.state.subdomain = sub;

    // Route to different handlers based on subdomain
    if (sub === "api") {
      return ctx.next(); // Let API routes handle it
    }
    if (sub !== "www") {
      // Tenant-specific logic
      ctx.state.tenant = await getTenant(sub);
    }
  }
  return ctx.next();
});
```

## Proxying requests

Forward requests to an upstream server from a route handler:

```ts routes/api/[...path].ts
import { define } from "@/utils.ts";

const UPSTREAM = "https://api.example.com";

export const handler = define.handlers({
  async GET(ctx) {
    const url = new URL(ctx.params.path, UPSTREAM);
    url.search = ctx.url.search;

    const response = await fetch(url, {
      headers: ctx.req.headers,
    });

    return new Response(response.body, {
      status: response.status,
      headers: response.headers,
    });
  },
});
```

This is useful for proxying to backend services or working around CORS
restrictions during development.

## Lazy-loading island content

Use Preact's `lazy()` and `<Suspense>` to code-split heavy components inside an
island, so their JavaScript is only loaded when needed:

```tsx islands/HeavyFeature.tsx
import { lazy, Suspense } from "preact/compat";

const Chart = lazy(() => import("../components/Chart.tsx"));

export function HeavyFeature() {
  return (
    <Suspense fallback={<p>Loading chart...</p>}>
      <Chart />
    </Suspense>
  );
}
```

The `Chart` component's code is split into a separate chunk and only fetched
when `HeavyFeature` renders in the browser.

## Timing middleware

Measure how long request processing takes:

```ts routes/_middleware.ts
import { define } from "@/utils.ts";

export default define.middleware(async (ctx) => {
  const start = performance.now();
  const response = await ctx.next();
  const duration = performance.now() - start;
  response.headers.set("Server-Timing", `total;dur=${duration.toFixed(1)}`);
  return response;
});
```
