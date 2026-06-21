---
description: |
  Add components like <title> or <meta> to a <head> tag using Fresh's <Head> component.
---

We can use the `<Head />` component in `$fresh/runtime.ts` to add elements as
children of the `<head>` element. By adding elements as children of Fresh's
`<Head />` tag, these automatically get injected into the `<head>` element of
the web page. Some uses include:

- Setting the document title using `<title>`
- Specifying page metadata using `<meta>`
- Linking to resources like stylesheets using `<link>`
- Including third-party JavaScript code using `<script>`

```tsx routes/index.tsx
import { Head } from "$fresh/runtime.ts";

export default function Home() {
  return (
    <>
      <Head>
        <meta charset="UTF-8" />
        <title>Fresh App</title>
        <meta
          name="description"
          content="This is a brief description of Fresh"
        />
        <link rel="stylesheet" href="styles.css" />
        <script src="script.js"></script>
      </Head>
      <div class="p-4 mx-auto max-w-screen-md">
        <h1>Hello World</h1>
      </div>
    </>
  );
}
```

## Avoiding duplicate tags

You might end up with duplicate tags, when multiple `<Head />` components are
rendered on the same page. This can happen when you render `<Head />` in a route
and another `<Head />` in another component for example.

```tsx routes/page-a.tsx
<Head>
  <meta name="og:title" content="This is a title" />
</Head>;
```

```tsx components/MyTitle.tsx
<Head>
  <meta name="og:title" content="Other title" />
</Head>;
```

To ensure that the tag is not duplicated, Fresh supports setting the `key` prop.
By giving matching elements the same `key` prop, only the last one will be
rendered.

```diff routes/page-a.tsx
  <Head>
-   <meta name="og:title" content="This is a title" />
+   <meta name="og:title" content="This is a title" key="title" />
  </Head>
```

```diff components/MyTitle.tsx
  <Head>
-   <meta name="og:title" content="Other title" />
+   <meta name="og:title" content="Other title" key="title" />
  </Head>
```

The rendered page will only include the `<meta>`-tag with `"Other title"`.

> [info]: The `<title>`-tag is automatically deduplicated, even without a `key`
> prop.
