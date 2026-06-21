---
description: |
  Add an app shell to provide the outer HTML document — html, head, and body —
  that wraps every page in your application.
---

The app shell is defined in an `_app.tsx` file in the `routes/` folder. It typically contains the outer HTML structure of the document. The file must have a default export wrapped in the generated `app` helper. Only one such file is allowed per application. If you don't define one, Fresh uses a minimal default shell.

The component receives a `children` prop containing the rendered page (already wrapped in any [layouts](/docs/concepts/layouts)). Render `children` where the page body should appear.

```tsx routes/_app.tsx
import { app } from "./$_app.ts";

export default app(({ children }) => {
  return (
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>My Fresh app</title>
      </head>
      <body>{children}</body>
    </html>
  );
});
```

## Global stylesheets

Import your global CSS from the app shell so it ships as part of the document on first paint. Vite processes the file (bundling, Tailwind, etc.) and Fresh injects the resulting `<link>` into every page.

```tsx routes/_app.tsx
import { app } from "./$_app.ts";
import "../style.css";

export default app(({ children }) => (
  <html>
    <head>
      <meta charset="utf-8" />
    </head>
    <body>{children}</body>
  </html>
));
```

Static files placed in `public/` are served as-is from the root. For example, `public/logo.svg` becomes `/logo.svg`.

## Per-page title and meta

The app shell renders once per request and receives only `children`. It has no access to the current route's data, URL, or state. So per-page `<title>` and `<meta>` tags don't belong here.

Instead, render them from a page or layout with [`<Head>`](/docs/advanced/head). It hoists its children into the document `<head>`.

```tsx routes/about.tsx
import { page } from "./$about.ts";
import { Head } from "fresh/runtime";

export default page(() => {
  return (
    <>
      <Head>
        <title>About — My Site</title>
        <meta name="description" content="About this site." />
      </Head>
      <h1>About</h1>
    </>
  );
});
```

A good rule of thumb. Keep the static parts of the head (charset, viewport, font preloads, a theme `<script>`) in `_app.tsx`. Put the dynamic, per-route tags inside `<Head>`.
