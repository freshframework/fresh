---
description: |
  Robustly handle user inputs using HTML `<form>` elements client side, and form
  submission handlers server side.
---

Forms are a common mechanism for letting users interact with applications. In
the last few years it has become more and more common for web applications to
move form submission entirely to the client. This can have useful properties for
interactivity, but it is much worse for resiliency and user experience as a
whole. Browsers have great built in systems for form submission, revolving
around the HTML `<form>` element.

Fresh builds the core of its form submission infrastructure around the native
`<form>` element. This page explains how to use `<form>` in Fresh, and the next
chapter explains how to progressively enhance your forms with client side
JavaScript to make them more interactive.

The way forms work in the browser, is that they perform an HTML navigation
action when the user submits the form. In most cases this means that when the
form is submitted, a `GET` or `POST` request is sent to the server with the form
data, which then responds with a new page to render.

Fresh can handle both `GET` and `POST` requests through the
[custom handlers][custom-handlers] feature of routes. The handlers can perform
any necessary processing on the form data, and then pass data to the
`ctx.render()` call to render a new page.

Here is an example implementing a search form that filters an array of names
server side:

```tsx routes/search.tsx
import { Handlers, PageProps } from "$fresh/server.ts";

const NAMES = ["Alice", "Bob", "Charlie", "Dave", "Eve", "Frank"];

interface Data {
  results: string[];
  query: string;
}

export const handler: Handlers<Data> = {
  GET(req, ctx) {
    const url = new URL(req.url);
    const query = url.searchParams.get("q") || "";
    const results = NAMES.filter((name) => name.includes(query));
    return ctx.render({ results, query });
  },
};

export default function Page({ data }: PageProps<Data>) {
  const { results, query } = data;
  return (
    <div>
      <form>
        <input type="text" name="q" value={query} class="border p-1" />
        <button type="submit" class="ml-1 px-2 py-1 bg-gray-100 border">
          Search
        </button>
      </form>
      <ul>
        {results.map((name) => <li key={name}>{name}</li>)}
      </ul>
    </div>
  );
}
```

When the user submits the form, the browser will navigate to `/search` with the
query set as the `q` query parameter in the URL. The `GET` handler will then
filter the names array based on the query, and pass it to the page component for
rendering.

[Learn more about using forms in Fresh][concepts-forms].

<!-- TODO(lucacasonato): link to todo app example when that is built again -->

[custom-handlers]: /docs/1.x/getting-started/custom-handlers
[concepts-forms]: /docs/1.x/concepts/forms
