---
description: |
  Wrap pages in shared UI using _layout.tsx files. Layouts nest automatically, support async data loading, and can be skipped per route.
---

This page covers **file-based layouts** using `_layout.tsx` files. If you're
defining routes programmatically with `new App()`, see
[Layouts (programmatic)](/docs/advanced/layouts) instead.

Layouts let you wrap groups of pages in shared UI - navigation bars, sidebars,
footers, or any common structure. They are defined in `_layout.tsx` files and
nest automatically based on the directory tree.

## How layouts work

Place a `_layout.tsx` file in any directory under `routes/`. It wraps every page
in that directory and its subdirectories. You can have one layout per directory.

```txt-files Project structure
<project root>
└── routes
    ├── _app.tsx           # App wrapper (outermost HTML shell)
    ├── _layout.tsx        # Root layout - wraps all pages
    ├── index.tsx
    ├── about.tsx
    ├── blog
    │   ├── _layout.tsx    # Blog layout - wraps blog pages
    │   ├── index.tsx
    │   └── [slug].tsx
    └── admin
        ├── _layout.tsx    # Admin layout - wraps admin pages
        └── dashboard.tsx
```

When a user visits `/blog/my-post`, Fresh renders these components from the
outside in:

1. `_app.tsx` - the outer `<html>`/`<head>`/`<body>` shell
2. `routes/_layout.tsx` - root layout (e.g. site header and footer)
3. `routes/blog/_layout.tsx` - blog layout (e.g. blog sidebar)
4. `routes/blog/[slug].tsx` - the page itself

## Basic layout

A layout receives `Component` (the child to wrap) and other props like `state`
and `url`. Any state set by [middleware](/docs/concepts/middleware) is available
via `props.state`.

```tsx routes/_layout.tsx
import { define } from "@/utils.ts";

export default define.layout(({ Component, state, url }) => {
  return (
    <div class="layout">
      <nav>
        <a href="/" class={url.pathname === "/" ? "active" : ""}>Home</a>
        <a href="/about">About</a>
        {state.user && <span>Hi, {state.user.name}</span>}
      </nav>
      <main>
        <Component />
      </main>
      <footer>&copy; 2026</footer>
    </div>
  );
});
```

## Async layouts

Layouts can be async to fetch data before rendering:

```tsx routes/blog/_layout.tsx
import { define } from "@/utils.ts";

export default define.layout(async (ctx) => {
  const categories = await db.categories.list();

  return (
    <div class="blog-layout">
      <aside>
        <h2>Categories</h2>
        <ul>
          {categories.map((c) => (
            <li>
              <a href={`/blog?cat=${c.slug}`}>{c.name}</a>
            </li>
          ))}
        </ul>
      </aside>
      <article>
        <ctx.Component />
      </article>
    </div>
  );
});
```

## Opting out of layout inheritance

Sometimes a route needs completely different chrome - a login page, a
full-screen dashboard, or a print view. Use `skipInheritedLayouts` in the route
config to skip all layouts inherited from parent directories:

```tsx routes/login.tsx
import { type RouteConfig } from "fresh";
import { define } from "@/utils.ts";

export const config: RouteConfig = {
  skipInheritedLayouts: true,
};

export default define.page(() => {
  return (
    <div class="login-page">
      <h1>Sign in</h1>
      <form method="POST">
        <input type="email" name="email" placeholder="Email" />
        <input type="password" name="password" placeholder="Password" />
        <button type="submit">Sign in</button>
      </form>
    </div>
  );
});
```

You can also skip inherited layouts from within a layout file itself. This is
useful when a section of your site needs a completely different shell:

```tsx routes/admin/_layout.tsx
import { type LayoutConfig } from "fresh";
import { define } from "@/utils.ts";

export const config: LayoutConfig = {
  skipInheritedLayouts: true,
};

export default define.layout(({ Component, state }) => {
  return (
    <div class="admin-shell">
      <aside class="admin-sidebar">
        <a href="/admin/dashboard">Dashboard</a>
        <a href="/admin/users">Users</a>
      </aside>
      <main>
        <Component />
      </main>
    </div>
  );
});
```

## Layout vs app wrapper

The [app wrapper](/docs/concepts/app) (`_app.tsx`) and layouts serve different
purposes:

- **App wrapper** - the outermost `<html>`/`<head>`/`<body>` structure. There is
  only one, and it wraps everything.
- **Layouts** - reusable UI shells that nest based on directory structure. There
  can be many, and they sit between the app wrapper and the page component.
