---
description: |
  The <Head> component lets any route, layout, component, or island contribute
  to the document <head> — title, meta tags, stylesheets, and scripts.
---

`<Head>` (from `fresh/runtime`) lets any component — a route, layout, shared component, or even an island — contribute elements to the document `<head>`. Whatever you render inside it is hoisted out of its inline position and into the real `<head>`.

```tsx routes/about.tsx
import { page } from "./$about.ts";
import { Head } from "fresh/runtime";

export default page(() => {
  return (
    <>
      <Head>
        <title>About — My Site</title>
        <meta name="description" content="Everything about us." />
        <link rel="canonical" href="https://example.com/about" />
      </Head>
      <h1>About</h1>
    </>
  );
});
```

This is the answer to "the [app shell](/docs/concepts/app-shell) can't see my route's data." Keep the static head in `_app.tsx`; put per-page, data-driven tags in `<Head>`.

## What can go in `<Head>`

Any head-eligible intrinsic element: `<title>`, `<meta>`, `<link>`, `<script>`, `<style>`, `<base>`, `<noscript>`, `<template>`.

## Deduplication

When two components contribute the "same" head element, the **last one wins**. Fresh dedupes by:

- `<title>` — always replaces any other title.
- a `key` prop, then an `id` prop.
- `<meta name="…">` — by name.
- `<link rel="canonical">` / `<link rel="manifest">` — by rel.
- `<base>` — singleton.

So a layout can set a default title and a page can override it:

```tsx routes/_layout.tsx
<Head>
  <title>My Site</title>
</Head>
```

```tsx routes/about.tsx
<Head>
  <title>About — My Site</title>
</Head> // wins
```

Anything that doesn't match a dedup rule (e.g. two different `<meta property="og:image">`) is kept as-is.

## From inside an island

`<Head>` works inside islands too. Because the island re-renders on the client, the real `<head>` stays in sync — useful for a live document title:

```tsx islands/Counter.tsx
import { useSignal } from "@preact/signals";
import { Head } from "fresh/runtime";

export function Counter() {
  const count = useSignal(0);
  return (
    <>
      <Head>
        <title>Count: {count}</title>
      </Head>
      <button type="button" onClick={() => count.value++}>
        +
      </button>
    </>
  );
}
```

## Next steps

- [**App shell**](/docs/concepts/app-shell) — the static document around the head.
- [**Partials**](/docs/advanced/partials) — `<Head>` updates also sync across partial navigations.
