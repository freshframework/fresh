---
description: |
  Error pages can be used to customize the page that is shown when an error occurs in the application.
---

Error pages are used to ensure that your app keeps working and display relevant
feedback to the one who made the request.

Fresh supports two kind of error pages:

1. Generic error pages
2. 404 Not found error pages

> [tip]: Be sure to return the appropriate
> [HTTP Status](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Status)
> code. This makes it a lot easier for clients of your app to act appropriately.
> It also makes it easier to find failed requests when going through traces.

## Generic error pages

To add an error page use [`app.onError()`](/docs/concepts/app#onerror).

```ts main.ts
import { App } from "fresh";

const app = new App()
  .onError("*", (ctx) => {
    console.log(`Error: ${ctx.error}`);
    return new Response("Oops!", { status: 500 });
  })
  .get("/thrower", () => {
    throw new Error("fail");
  });
```

When you access `/thrower` the error will be caught and the `onError` callback
will be invoked.

You can also nest error pages:

```ts
const app = new App()
  // Top level error page
  .onError("*", (ctx) => {
    return new Response("Oops!", { status: 500 });
  })
  .onError("/foo/bar", (ctx) => {
    return new Response("nested error!", { status: 500 });
  })
  .get("/foo/bar/thrower", () => {
    throw new Error("fail");
  });
```

## Not found error

Not found errors are often treated differently than generic errors. You can both
treat them with the `.onError()` way, but by adding a specific `.notFound()`
handler, Fresh ensures that every 404 error will invoke this callback.

```ts
const app = new App()
  // Top level error page
  .notFound((ctx) => {
    return new Response("Page not found", { status: 404 });
  })
  .get("/", () => new Response("foo"));
```

Accessing an unknown route like `/invalid` will trigger the `notFound`
[middleware](/docs/concepts/middleware). Contrary to generic error pages this
handler cannot be nested.

## Throwing HTTP errors

If you need to bail out of execution and need to respond with a particular HTTP
error code, you can use Fresh's `HttpError` class:

```ts
import { HttpError } from "fresh";
```

`HttpError` takes a status code and an optional message:

```ts middleware/auth.ts
import { HttpError } from "fresh";

async function authMiddleware(ctx) {
  const user = ctx.state.user;

  // Check if user is authenticated, throw 404 error if not
  if (!isAuthenticated(user)) {
    throw new HttpError(404);
  }

  // Forbidden with a custom message
  if (!isAdmin(user)) {
    throw new HttpError(403, "Admin access required");
  }

  return await ctx.next();
}
```

When an `HttpError` is thrown, Fresh catches it and invokes the error handler.
You can check the status code in your error handler:

```ts
import { HttpError } from "fresh";

app.onError("*", (ctx) => {
  if (ctx.error instanceof HttpError) {
    const status = ctx.error.status;
    return new Response("oops", { status });
  }

  // ...
});
```

`HttpError` is also available in the browser via `fresh/runtime` for use in
[island code](/docs/concepts/islands).
