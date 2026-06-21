---
description: |
  Routes are the basic building block of a Fresh application. They describe how
  a request for a given path is served — through a handler, a page component,
  or both.
---

A route describes how a request for a given path should be served, and what the response should look like. To do this, a route file has two main parts: a **handler** and a **page component**. A route can have either one, or both, but never neither.

The handler is a function (or a set of functions, one per HTTP method) that runs on the server for every request to the route. It decides what happens: it can return a `Response` directly — for a JSON API, a download, or a redirect — or it can return `{ data }` to hand off to the page component for rendering. If a route doesn't export a handler, Fresh supplies a default `GET` that just renders the page.

The page component is a Preact component rendered to HTML on the server. It receives `props` containing the request URL, captured route params, any state set by [middleware](/docs/concepts/middleware), and any `data` returned from the handler. If a route doesn't export a page component, it's a pure API route.

Both `handler` and `page` come from the generated `./$<name>.ts` helper next to your route, which types `ctx` and `props.data` for you — see [Type checking](/docs/advanced/type-checking).

## Component-only route

The simplest possible route is just a page component. Fresh's default `GET` handler renders it on every request:

```tsx routes/about.tsx
import { page } from "./$about.ts";

export default page(() => {
  return (
    <main>
      <h1>About</h1>
      <p>This page is server-rendered. No client JavaScript was shipped.</p>
    </main>
  );
});
```

Use this for routes that don't need to load anything or vary by request.

## Handler-only route

If a route has no page component, it's a plain HTTP endpoint — useful for JSON APIs, file downloads, webhooks, RSS feeds, and sitemaps. Export a handler keyed by HTTP method and return a `Response` from each one:

```ts routes/api/health.ts
import { handler } from "./$health.ts";

export const handlers = handler({
  GET() {
    return Response.json({ ok: true, time: new Date().toISOString() });
  },
});
```

Any method you don't list returns a **405** through the [error page](/docs/concepts/error-pages); `HEAD` falls back to `GET` automatically.

## Mixed handler and page route

The most common shape is a route that does both: the handler loads data, returns `{ data }`, and the page component renders it. `props.data` is typed end-to-end from the handler's return.

```tsx routes/users/[id].tsx
import { handler, page } from "./$[id].ts";

interface User {
  id: number;
  name: string;
  email: string;
}

export const handlers = handler({
  async GET(ctx) {
    const res = await fetch(`https://example.com/api/users/${ctx.params.id}`);
    if (!res.ok) throw new Error(`Upstream ${res.status}`);
    const user: User = await res.json();
    return { data: user };
  },
});

export default page((props) => {
  // props.data is typed as User
  const { name, email } = props.data;
  return (
    <article>
      <h1>{name}</h1>
      <p>{email}</p>
    </article>
  );
});
```

You can also use a handler to wrap the rendered response — for example, to set a custom header — by letting Fresh render and then attaching headers via the `{ data, headers }` return:

```ts
return { data: user, headers: { "Cache-Control": "public, max-age=60" } };
```

## Handling multiple methods

To handle more than one method, add more keys to the handler object. The page renders on whichever method returned `{ data }` — here `GET` shows the form and `POST` processes it and renders a thank-you state, using the same page component for both:

```tsx routes/contact.tsx
import { handler, page } from "./$contact.ts";

export const handlers = handler({
  GET() {
    return { data: { sent: false } };
  },
  async POST(ctx) {
    const form = await ctx.req.formData();
    await sendMessage(String(form.get("message") ?? ""));
    return { data: { sent: true } };
  },
});

export default page((props) => {
  if (props.data.sent) {
    return <p>Thanks — your message is on its way.</p>;
  }
  return (
    <form method="post">
      <textarea name="message" required />
      <button type="submit">Send</button>
    </form>
  );
});

async function sendMessage(_text: string) {
  // ...
}
```

`props.data` is inferred as `{ sent: boolean }` from the union of the two handler returns — no explicit type annotation needed.

If you'd rather redirect after a successful POST (the classic post/redirect/get pattern, which prevents a duplicate submit on refresh), use [`ctx.redirect`](/docs/concepts/context) instead of returning data:

```tsx
async POST(ctx) {
  const form = await ctx.req.formData();
  await sendMessage(String(form.get("message") ?? ""));
  return ctx.redirect("/contact?sent=1", 303);
},
```

## Catch-all handler

Pass a single function instead of an object to handle **every** method on the route with the same code. Useful for endpoints that genuinely don't care about the method (e.g. logging a beacon, or a webhook that the sender may issue as `GET` or `POST`):

```ts routes/api/echo.ts
import { handler } from "./$echo.ts";

export const handlers = handler((ctx) => {
  return Response.json({ method: ctx.req.method, path: ctx.url.pathname });
});
```

## Return values

A handler can return one of:

| Return | Result |
| --- | --- |
| `{ data, headers?, status? }` | The page renders with `data`; `headers` / `status` apply to the HTTP response. |
| a `Response` | Passed through verbatim — use it for redirects, JSON, files, streams. |
| (throw) | Routed to the [error page](/docs/concepts/error-pages) with the thrown value as `ctx.error`. |

## Next steps

- [**Context**](/docs/concepts/context) — everything `ctx` exposes.
- [**Middleware**](/docs/concepts/middleware) — share logic and state across handlers.
- [**Error pages**](/docs/concepts/error-pages) — handle thrown errors and bad methods.
- [**Type checking**](/docs/advanced/type-checking) — how the generated `$` helpers give you typed `ctx` and `props.data`.
