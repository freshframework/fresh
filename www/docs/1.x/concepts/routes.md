---
description: |
  Routes are the basic building block of Fresh applications. They are used to define the behaviour the application when a given path is requested.
---

At their core, routes describe how a request for a given path should be handled,
and what the response should be. To do this, routes have two main parts: the
handler, and the component. A route can have either one, or both, but never
neither.

The handler is a function that is called for every request to the route. It
needs to return a response that is then sent to the client. The response could
be anything: a plain text string, a JSON object, an HTML page, a WebSocket
connection, a streaming file, or pretty much anything else. The handler is
passed a `render` function that it can call to invoke rendering a component.

The component is the template for a page. It is a JSX element that is rendered
on the server. The page component gets passed props that can be used by it to
determine exactly what should be rendered. By default components receive props
consisting of: the request URL, the matching route (as a string), the matches
from the URL pattern match, any state set by middleware, and any data passed to
the handler's `render` function.

## Handler route

Let's look at a basic route that returns a plain text string:

```tsx routes/plain.tsx
import { FreshContext, Handlers } from "$fresh/server.ts";

export const handler: Handlers = {
  GET(_req: Request, _ctx: FreshContext) {
    return new Response("Hello World");
  },
};
```

To define a handler, one needs to export a `handler` function or object from the
route module. If the handler is an object, each key in the object is the name of
the HTTP method that the handler should be called for. For example the `GET`
handler above is called for `GET` requests. If the handler is a function, it is
called for all requests regardless of the method. If an HTTP method does not
have a corresponding handler, a 405 HTTP error is returned.

## Component route

Now, let's render some HTML using the route component:

```tsx routes/html.tsx
import { PageProps } from "$fresh/server.ts";

export default function Page(props: PageProps) {
  return <div>You are on the page '{props.url.href}'.</div>;
}
```

The page component needs to be the default export of the route module. It is
passed props that can be used to render the page.

As you can see in the second example, if no handler is explicitly defined a
default handler is used that just renders out the page component if present. You
can also override the default handler though to modify how exactly rendering
should work.

## Mixed handler and component route

In the below example, a custom handler is used to add a custom header to the
response after rendering the page component.

```tsx routes/html.tsx
import { FreshContext, Handlers, PageProps } from "$fresh/server.ts";

export const handler: Handlers = {
  async GET(_req: Request, ctx: FreshContext) {
    const resp = await ctx.render();
    resp.headers.set("X-Custom-Header", "Hello World");
    return resp;
  },
};

export default function Page(props: PageProps) {
  return <div>You are on the page '{props.url.href}'.</div>;
}
```

## Async route components

Having a separate route handler and component function is nice, when you want to
test these in isolation, but can become a bit cumbersome to maintain. They
require some additional indirection of declaring an interface for the component
`Data` when you're passing it around through `ctx.render()`.

```tsx routes/page.tsx
interface Data {
  foo: number;
}

export const handler: Handlers<Data> = {
  async GET(req, ctx) {
    const value = await loadFooValue();
    return ctx.render({ foo: value });
  },
};

export default function MyPage(props: PageProps<Data>) {
  return <p>foo is: {props.data.foo}</p>;
}
```

When a route has both a component and a `GET` handler, they are typically very
closely coupled. With async route components you can merge the two together and
avoid having to create the `Data` interface boilerplate.

```tsx routes/page.tsx
// Async route component
export default async function MyPage(req: Request, ctx: RouteContext) {
  const value = await loadFooValue();
  return <p>foo is: {value}</p>;
}
```

The code gets a little shorter with async route components. Conceptually, you
can think of async route components inlining the `GET` handler into the
component function. Note, that you can still add additional HTTP handlers in the
same file like before.

```tsx routes/page.tsx
export const handler: Handlers = {
  async POST(req) {
    // ... do something here
  },
};

export default async function MyPage(req: Request, ctx: RouteContext) {
  const value = await loadFooValue();
  return <p>foo is: {value}</p>;
}
```

### Returning Response objects

Quite often a route handler needs to render a 404 page or bail out of rendering
in another manner. This can be done by returning a `Response` object.

```tsx route/page.tsx
// Async route component
export default async function MyPage(req: Request, ctx: RouteContext) {
  const value = await loadFooValue();

  // Return 404 if `value` is null
  if (value === null) {
    return ctx.renderNotFound();
  }

  // Returning a response object directly works too
  if (value === "redirect") {
    const headers = new Headers();
    headers.set("location", "/some-other-page");
    return new Response(null, {
      status: 302,
      headers,
    });
  }

  return <p>foo is: {value}</p>;
}
```

### Define helper

To make it a little quicker to write async routes, Fresh ships with a
`defineRoute` helper which automatically infers the correct types for the
function arguments.

```tsx routes/hello.tsx
import { defineRoute } from "$fresh/server.ts";

export default defineRoute(async (req, ctx) => {
  const data = await loadData();

  return (
    <div class="page">
      <h1>Hello {data.name}</h1>
    </div>
  );
});
```
