---
description: Modify the document head in Fresh
---

The
[`<head>`](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/head)-element
is a crucial element in HTML to set metadata for a page. It allows you to:

- Set the document title with `<title>`
- Specify page metadata with `<meta>`
- Link to resources like stylesheets with `<link>`
- Include JavaScript code with `<script>`

> [info]: The outer HTML structure including `<head>` is typically created
> inside [`_app.tsx`](/docs/concepts/app).

## Passing metadata from `ctx.state`

For simple scenarios passing metadata along from a handler or a
[middleware](/docs/concepts/middleware) by writing to `ctx.state` is often
sufficient.

```tsx routes/_app.tsx
import { define } from "../util.ts";

export default define.page((ctx) => {
  return (
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <title>{ctx.state.title ?? "Welcome!"}</title>
      </head>
      <body>
        <ctx.Component />
      </body>
    </html>
  );
});
```

## Using the `<Head>`-component

For more complex scenarios, or to set page metadata from
[islands](/docs/concepts/islands), Fresh ships with the `<Head>`-component.

```tsx routes/about.tsx
import { Head } from "fresh/runtime";

export default define.page((ctx) => {
  return (
    <div>
      <Head>
        <title>About me</title>
      </Head>
      <h1>About me</h1>
      <p>I like Fresh!</p>
    </div>
  );
});
```

### Dynamic head updates from islands

The `<Head>` component works in [islands](/docs/concepts/islands) too. When
component state changes, the document head is updated automatically:

```tsx islands/MetaUpdater.tsx
import { useState } from "preact/hooks";
import { Head } from "fresh/runtime";

export default function MetaUpdater() {
  const [title, setTitle] = useState("Welcome");

  return (
    <div>
      <Head>
        <title>{title}</title>
      </Head>
      <button onClick={() => setTitle("Updated!")}>Change title</button>
    </div>
  );
}
```

### Avoiding duplicate tags

You might end up with duplicate tags, when multiple `<Head />` components are
rendered on the same page. Fresh will employ the following strategies to find
the matching element:

1. For `<title>` elements Fresh will set `document.title` directly
2. Check if an element with the same `key` exists
3. Check if an element with the same `id` attribute
4. Only for `<meta>` elements: Check if there is a `<meta>` element with the
   same `name` attribute
5. Only for `<link>` elements: Check if there is a `<link>` element with the
   same `rel` attribute
6. No matching element was found, Fresh will create a new one and append it to
   `<head>`

When multiple `<Head>` components render an element with the same key, the
**last one rendered wins**. Since Fresh renders top-down (app wrapper -> layout
-> route -> page component), a route page can override defaults set in
`_app.tsx` by using the same `key` prop.

> [info]: The `<title>`-tag is automatically deduplicated, even without a `key`
> prop.
