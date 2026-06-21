---
description: |
  Customize the page that is shown when a request does not match a route,
  hits an unsupported method, or when a handler throws an error.
---

Fresh renders a single error page for the things that can go wrong in a request. These are: a request to a path that does not match any route, a request for a method the route does not handle, and any error thrown inside a middleware, handler, or page.

The error page is defined in a `_error.tsx` file in the `routes/` folder. It is a normal [route](/docs/concepts/routes) file with a handler and a page component, but it receives the triggering error on the context as `ctx.error` and on the page as `props.error`.

```tsx routes/_error.tsx
import { handler, page } from "./$_error.ts";
import { HttpError } from "fresh/errors";

export const handlers = handler({
  GET(ctx) {
    const status = ctx.error instanceof HttpError ? ctx.error.status : 500;
    return { data: { status }, status };
  },
});

export default page((props) => {
  const status = props.data.status;
  return (
    <div>
      <h1>{status}</h1>
      <p>{status === 404 ? "Page not found" : "Something went wrong"}</p>
      <a href="/">Back home</a>
    </div>
  );
});
```

The handler sets the HTTP `status` on the response. The page renders the body. If you omit `handlers`, Fresh supplies one that uses `error.status ?? 500`.

If `routes/_error.tsx` is absent, Fresh falls back to a plain `Response` with the error's status and message.

## What triggers the error page

| Trigger                                             | Error                         |
| --------------------------------------------------- | ----------------------------- |
| No route matched                                    | `NotFoundError` (404)         |
| Method not handled by the route                     | `MethodNotAllowedError` (405) |
| Anything thrown from a handler, middleware, or page | the thrown value              |

In the handler, `ctx.error instanceof HttpError` is reliable for branching on status. In the page component, prefer reading fields structurally (for example, `props.error?.message`). The thrown value may cross a module-realm boundary during rendering, so `instanceof Error` can be `false` even for real errors.

## Throwing errors

Throw an `HttpError` from any handler or middleware to render a specific status. This is the usual way to render a 404 from inside a matched route when the underlying resource does not exist.

```tsx routes/admin/[id].tsx
import { handler, page } from "./$[id].ts";
import { HttpError } from "fresh/errors";

export const handlers = handler({
  async GET(ctx) {
    const item = await getItem(ctx.params.id);
    if (!item) throw new HttpError(404);
    if (!ctx.state.user) throw new HttpError(403);
    return { data: item };
  },
});

export default page((props) => <h1>{props.data.name}</h1>);
```

## Error classes

`fresh/errors` exports a small set of error classes.

| Class                                      | Status                                           |
| ------------------------------------------ | ------------------------------------------------ |
| `HttpError(status, message?)`              | the given status (default message keyed by code) |
| `NotFoundError(message?)`                  | 404 (an `HttpError`)                             |
| `MethodNotAllowedError(allowed, message?)` | 405. Carries the `allowed` methods.              |
