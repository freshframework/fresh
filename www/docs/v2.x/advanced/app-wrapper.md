---
description: |
  The app wrapper defines the outermost HTML shell shared by all pages - the <html>, <head>, and <body> tags.
---

The app wrapper is the outermost component in Fresh's rendering hierarchy. It
defines the `<html>`, `<head>`, and `<body>` tags that every page shares. It is
only rendered on the server.

## When to use an app wrapper

Use an app wrapper when you need to:

- Set the document language (`<html lang="en">`)
- Include global `<meta>` tags, fonts, or stylesheets
- Add analytics scripts or structured data to every page
- Set a global `<body>` class or data attribute
- Provide a consistent HTML skeleton without repeating it in every layout

If you're using [file-based routing](/docs/concepts/file-routing), create a
`routes/_app.tsx` file. Otherwise, register it programmatically with
`app.appWrapper()`.

## Basic example

```tsx routes/_app.tsx
import { define } from "../utils.ts";

export default define.page(({ Component, url }) => {
  return (
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>My App</title>
        <link rel="stylesheet" href="/styles.css" />
      </head>
      <body>
        <Component />
      </body>
    </html>
  );
});
```

## Programmatic registration

When building your app with `new App()` instead of file-based routing:

```tsx
function AppWrapper({ Component }) {
  return (
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <title>My App</title>
      </head>
      <body>
        <Component />
      </body>
    </html>
  );
}

app.appWrapper(AppWrapper);
```

Only one app wrapper is supported per [`App`](/docs/concepts/app) instance.

## How it fits in the render hierarchy

When Fresh renders a page, the components nest like this:

1. **App wrapper** (`_app.tsx`) - outermost, provides `<html>`/`<head>`/`<body>`
2. **[Layouts](/docs/concepts/layouts)** (`_layout.tsx`) - shared page chrome
   (nav, sidebar, footer)
3. **Page component** - the route itself

The app wrapper wraps everything. Layouts sit inside it and wrap the page.

## Accessing request data

The app wrapper receives the same props as page components - `url`, `state`,
`params`, and more. This is useful for conditional logic:

```tsx routes/_app.tsx
import { define } from "../utils.ts";

export default define.page(({ Component, url, state }) => {
  return (
    <html lang="en" data-theme={state.theme ?? "light"}>
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>My App</title>
        <meta property="og:url" content={url.href} />
        <link rel="canonical" href={url.href} />
      </head>
      <body>
        <Component />
      </body>
    </html>
  );
});
```

## Skipping the app wrapper

Some routes may need to bypass the app wrapper entirely - for example, API
routes that return JSON, or pages that need a completely different HTML
structure. Use `skipAppWrapper` in the route config:

```tsx routes/embed.tsx
import { type RouteConfig } from "fresh";
import { define } from "../utils.ts";

export const config: RouteConfig = {
  skipAppWrapper: true,
};

export default define.page(() => {
  return (
    <html>
      <head>
        <title>Embed</title>
      </head>
      <body>
        <div id="widget">Embeddable widget</div>
      </body>
    </html>
  );
});
```

When using programmatic layouts, pass `skipAppWrapper` as an option:

```ts main.ts
app.layout("/embed", EmbedLayout, { skipAppWrapper: true });
```
