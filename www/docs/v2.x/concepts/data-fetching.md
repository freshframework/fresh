---
description: |
  Load data on the server in handlers and pass it to page components with full type safety.
---

Data fetching in Fresh happens on the server. Handlers load data and pass it to
page components via the `page()` helper. This keeps API keys, database
connections, and sensitive logic out of the browser.

## Handlers and page components

A handler fetches data and returns it with `page()`. The page component receives
it in `props.data`:

```tsx routes/projects/[id].tsx
import { HttpError, page } from "fresh";
import { define } from "@/utils.ts";

interface Data {
  project: { name: string; stars: number };
}

export const handler = define.handlers({
  async GET(ctx) {
    const project = await db.projects.findOne(ctx.params.id);
    if (!project) {
      throw new HttpError(404);
    }
    return page({ project });
  },
});

export default define.page<typeof handler>(({ data }) => {
  return (
    <div>
      <h1>{data.project.name}</h1>
      <p>{data.project.stars} stars</p>
    </div>
  );
});
```

The `define.page<typeof handler>` generic links the handler's return type to the
component's props, giving you full autocompletion on `data`.

## Setting response headers and status

Pass options to `page()` to customize the HTTP response:

```ts
return page(data, {
  status: 201,
  headers: { "Cache-Control": "public, max-age=3600" },
});
```

## Async page components

For simpler cases, you can fetch data directly in an async component without a
separate handler:

```tsx routes/projects/[id].tsx
import { HttpError } from "fresh";
import { define } from "@/utils.ts";

export default define.page(async (ctx) => {
  const project = await db.projects.findOne(ctx.params.id);
  if (!project) {
    throw new HttpError(404);
  }

  return (
    <div>
      <h1>{project.name}</h1>
      <p>{project.stars} stars</p>
    </div>
  );
});
```

This is convenient for pages where you don't need the type-safe data bridge
between handler and component.

## Passing state from middleware

[Middleware](/docs/concepts/middleware) can set values on `ctx.state` that are
available to all downstream handlers and components:

```ts routes/_middleware.ts
import { define } from "@/utils.ts";

export default define.middleware(async (ctx) => {
  const session = await getSession(ctx.req);
  ctx.state.user = session?.user ?? null;
  return ctx.next();
});
```

```tsx routes/dashboard.tsx
import { page } from "fresh";
import { define } from "@/utils.ts";

export const handler = define.handlers({
  GET(ctx) {
    if (!ctx.state.user) {
      return ctx.redirect("/login");
    }
    return page();
  },
});

export default define.page((ctx) => {
  return <h1>Welcome, {ctx.state.user.name}</h1>;
});
```

## What's available in page props

Page components receive these properties:

| Property    | Type                     | Description                               |
| ----------- | ------------------------ | ----------------------------------------- |
| `data`      | `Data`                   | Data returned by the handler via `page()` |
| `url`       | `URL`                    | The request URL                           |
| `params`    | `Record<string, string>` | Route parameters (e.g. `:id`)             |
| `req`       | `Request`                | The original HTTP request                 |
| `state`     | `State`                  | Shared state set by middleware            |
| `config`    | `ResolvedFreshConfig`    | The resolved Fresh configuration          |
| `route`     | `string \| null`         | The matched route pattern                 |
| `info`      | `Deno.ServeHandlerInfo`  | Server connection info                    |
| `error`     | `unknown \| null`        | Caught error (on error pages)             |
| `isPartial` | `boolean`                | Whether this is a partial request         |
| `Component` | `FunctionComponent`      | Child component (in layouts)              |
