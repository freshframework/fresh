---
description: |
  Add a layout to wrap a group of routes with shared UI. Navigation, sidebars,
  footers, and other chrome that should persist across pages.
---

A layout is defined in a `_layout.tsx` file in any sub directory (at any level) under the `routes/` folder. It must contain a default export that is a regular Preact component wrapped in the generated `layout` helper. Only one such layout is allowed per sub directory.

```txt-files Project structure
<project root>
└── routes
    ├── sub
    │   ├── page.tsx
    │   └── index.tsx
    ├── other
    │   ├── _layout.tsx  # will be applied on top of `routes/_layout.tsx`
    │   └── page.tsx
    ├── _layout.tsx  # will be applied to all routes
    └── _app.tsx
```

The component to be wrapped is received via the `Component` prop. The layout renders it where the inner page should appear. This lets you build a wrapper template that can read state and route data. Any state set by [middleware](/docs/concepts/middleware) is available as `props.state`, and route params as `props.params`.

```tsx routes/sub/_layout.tsx
import { layout } from "./$_layout.ts";

export default layout(({ Component, state }) => {
  // do something with state here
  return (
    <div class="layout">
      <Component />
    </div>
  );
});
```

Layouts compose outermost-first, following the folder tree. A request to `/other/page` is wrapped by `routes/_layout.tsx` first, then by `routes/other/_layout.tsx`, with the page rendered in the innermost `<Component />` slot.

## Layout props

A layout receives the same props a [page](/docs/concepts/routes) does, plus `Component`.

| Prop        | Description                                                                  |
| ----------- | ---------------------------------------------------------------------------- |
| `Component` | The next inner layer. Render it with `<Component />`.                        |
| `state`     | Shared state from the closest [middleware](/docs/concepts/middleware) chain. |
| `url`       | The current `URL`. Handy for marking the active nav link.                    |
| `params`    | Route parameters.                                                            |
| `data`      | The handler's data for the matched route.                                    |

```tsx routes/_layout.tsx
import { layout } from "./$_layout.ts";

export default layout(({ Component, url, state }) => {
  return (
    <div>
      <nav>
        <a href="/" class={url.pathname === "/" ? "active" : ""}>
          Home
        </a>
        {state.user && <span>Hi, {state.user.name}</span>}
      </nav>
      <Component />
    </div>
  );
});
```

## Layout vs. app shell

A layout renders inside the `<body>`. The outer `<html>`, `<head>`, and `<body>` document is the [app shell](/docs/concepts/app-shell), defined in `_app.tsx`. Use the app shell for the HTML document. Use layouts for page chrome.

Pair layouts with [route groups](/docs/concepts/routing) to share UI across routes without nesting them under a URL segment. For example, `routes/(app)/_layout.tsx` applies to every route in the `(app)` group while leaving the URL paths untouched.
