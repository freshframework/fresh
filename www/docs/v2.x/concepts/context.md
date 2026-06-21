---
description: The Context object is shared across all middlewares and provides access to the request, URL, params, state, and response helpers.
---

The `Context` instance is shared across all
[middlewares](/docs/concepts/middleware) in Fresh. Use it to respond with HTML,
trigger redirects, access the incoming
[`Request`](https://developer.mozilla.org/en-US/docs/Web/API/Request) or read
other metadata.

## `.config`

Contains the resolved Fresh configuration.

```ts
app.get("/", (ctx) => {
  console.log("Config: ", ctx.config);
  return new Response("hey");
});
```

## `.url`

Contains a [`URL`](https://developer.mozilla.org/en-US/docs/Web/API/URL)
instance of the requested url.

```ts
app.get("/", (ctx) => {
  console.log("path: ", ctx.url.pathname);

  const hasParam = ctx.url.searchParams.has("q");
  return new Response(`Has q param: ${hasParam}`);
});
```

## `.req`

Contains the incoming
[`Request`](https://developer.mozilla.org/en-US/docs/Web/API/Request) instance.

```ts
app.get("/", (ctx) => {
  console.log("Request: ", ctx.req);

  if (ctx.req.headers.has("X-Foo")) {
    // do something
  }

  return new Response("hello");
});
```

## `.route`

Contains the matched route pattern as a `string`. Will be `null` if no pattern
matched.

```ts
app.get("/foo/:id", (ctx) => {
  console.log(ctx.route); // Logs: "/foo/:id"
  // ...
});
```

## `.params`

Contains the params of the matched route pattern.

```ts
app.get("/foo/:id", (ctx) => {
  console.log("id: ", ctx.params.id);

  return new Response(`Accessed: /foo/${ctx.params.id}`);
});
```

## `.state`

Pass data to the next middlewares with state. Every request has its own state
object.

```ts
interface State {
  text?: string;
}

const app = new App<State>();

app.use((ctx) => {
  ctx.state.text = "foo";
  return ctx.next();
});
app.use((ctx) => {
  console.log(ctx.state.text); // Logs: "foo"
  return ctx.next();
});
```

## `.error`

If an error was thrown, this property will hold the caught value (default:
`null`). This is typically used mainly on an
[error page](/docs/advanced/error-handling).

```ts
app.onError((ctx) => {
  const message = ctx.error instanceof Error
    ? ctx.error.message
    : String(ctx.error);

  return new Response(message, { status: 500 });
});
```

## `.redirect()`

Trigger a redirect from a middleware:

```ts
app.get("/old-url", (ctx) => {
  return ctx.redirect("/new-url");
});
```

Set a custom status code (default is `302`):

```ts
app.get("/old-url", (ctx) => {
  return ctx.redirect("/new-url", 307);
});
```

## `.render()`

Render JSX and create a HTML `Response`.

```tsx
app.get("/", (ctx) => {
  return ctx.render(<h1>hello world</h1>);
});
```

Set custom response headers or other metadata:

```tsx
app.get("/teapot", (ctx) => {
  return ctx.render(<h1>I'm a teapot</h1>, {
    status: 418,
    headers: {
      "X-Foo": "abc",
    },
  });
});
```
