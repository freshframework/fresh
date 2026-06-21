---
description: "Create re-usable layouts across routes"
---

This page covers **programmatic layouts** defined via `app.layout()`. If you're using file-based routing, see [Layouts (file-based)](/docs/concepts/layouts) instead.

Layouts are plain Preact components that are inherited based on the matching pattern. When you have a section on your site where all pages share the same HTML structure and only the content changes, a layout is a neat way to abstract this. Layouts only ever render on the server. The passed `Component` value represents the children of this component.

```tsx
function PageLayout({ Component }) {
  return (
    <div>
      <Component />
      <aside>Here is some sidebar content</aside>
    </div>
  );
}

const app = new App().layout("*", PageLayout).get("/", (ctx) => ctx.render(<h1>hello</h1>));
```

If you browse to the `/` route, Fresh will render the following HTML

```html Response body
<div>
  <h1>hello world</h1>
  <aside>Here is some sidebar content</aside>
</div>
```

## Multiple layouts

You can register multiple layouts for different paths. Layouts are inherited from parent paths - a layout at `"*"` applies to all routes, and more specific layouts are added on top:

```ts
const app = new App()
  .layout("*", MainLayout) // Applied to all routes
  .layout("/admin/*", AdminLayout) // Added on top for /admin/* routes
  .get("/", (ctx) => ctx.render(<h1>Home</h1>))
  .get("/admin/dashboard", (ctx) => ctx.render(<h1>Dashboard</h1>));
```

For `/admin/dashboard`, both `MainLayout` and `AdminLayout` will wrap the page component (MainLayout as the outer wrapper, AdminLayout as the inner).

## Overriding layouts

Use `skipInheritedLayouts` to replace all inherited layouts with a single one:

```ts main.ts
const app = new App()
  .layout("*", MainLayout)
  .layout("/landing", LandingLayout, { skipInheritedLayouts: true })
  .get("/", (ctx) => ctx.render(<h1>Home</h1>)) // Uses MainLayout
  .get("/landing", (ctx) => ctx.render(<h1>Landing</h1>)); // Uses only LandingLayout
```

## Options

Ignore the [app wrapper](/docs/concepts/app) component:

```ts
app.layout("/foo/bar", MyComponent, { skipAppWrapper: true });
```
