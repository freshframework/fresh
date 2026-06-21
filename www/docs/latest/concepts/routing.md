---
description: |
  File-based routing is the simplest way to do routing in Fresh apps. The name
  of a file under routes/ determines the URL pattern it matches.
---

Routing is the mechanism that determines which route a given incoming request is served by. Fresh routes requests based on their URL path. Routes specify which paths they apply to using the **name of the file** — the path of the file on disk, relative to the `routes/` directory, becomes the URL pattern.

The file-based routing in Fresh is similar to file-based routing seen in other frameworks, namely Next.js. File names are used to determine which route should serve a given request.

File names are mapped to route patterns as follows:

- File extensions are ignored.
- Literal characters in the file path are matched as string literals.
- Files named `<path>/index.<ext>` behave identically to a file named `<path>.<ext>`.
- A path segment can be made **dynamic** by surrounding an identifier with `[` and `]` — for example, `[slug]` captures any single segment.
- A path whose last segment is `[...<ident>]` is treated as a **catch-all** suffix, matching one or more remaining segments.
- Files (and folders) whose name begins with `_` are not routes — they're either [special files](#special-files) or ignored.

Here is a table of file names, which route patterns they map to, and which paths they match:

| File name                 | Route pattern          | Matching paths                          |
| ------------------------- | ---------------------- | --------------------------------------- |
| `index.tsx`               | `/`                    | `/`                                     |
| `about.tsx`               | `/about`               | `/about`                                |
| `blog/index.tsx`          | `/blog`                | `/blog`                                 |
| `blog/[slug].tsx`         | `/blog/:slug`          | `/blog/hello`, `/blog/world`            |
| `blog/[slug]/comments.ts` | `/blog/:slug/comments` | `/blog/hello/comments`                  |
| `docs/[...path].tsx`      | `/docs/:path+`         | `/docs/intro`, `/docs/concepts/routing` |
| `[category]/[id].tsx`     | `/:category/:id`       | `/news/42`, `/posts/abc`                |

Captured segments are available on `ctx.params`, fully typed — `[slug]` becomes `ctx.params.slug: string`, `[...path]` becomes `ctx.params.path: string` (with `/`-joined segments). See [Routes](/docs/concepts/routes) for how to use them in a handler and page.

When multiple routes could match, the **more specific** one wins: given both `routes/docs/index.tsx` and `routes/docs/[...path].tsx`, the request `/docs` resolves to the index route, and `/docs/anything-else` falls through to the catch-all.

## Special files

A file whose name begins with `_` is not exposed as a URL. A handful of these names have a special meaning to Fresh; the rest are ignored, so you can keep helper files (`routes/_helpers.ts`) next to your routes without affecting routing.

| File | Purpose |
| --- | --- |
| `_app.tsx` | The [HTML shell](/docs/concepts/app-shell) wrapping every page (root only). |
| `_layout.tsx` | A [layout](/docs/concepts/layouts) wrapping every route in its folder and below. |
| `_middleware.tsx` | [Middleware](/docs/concepts/middleware) running for its folder and below. |
| `_error.tsx` | The [error page](/docs/concepts/error-pages) rendered when a handler throws (root only). |

## Route groups

When working with [layouts](/docs/concepts/layouts) or [middleware](/docs/concepts/middleware), you'll sometimes want a set of routes to share a layout or middleware that isn't suggested by their URL.

Take this example:

```txt Example page layout
/about    -> layout A
/career   -> layout A
/archive  -> layout B
/contact  -> layout B
```

Without a way to group routes, you'd be stuck — each folder can only have one `_layout.tsx`:

```txt-files Project structure
<project root>
└── routes
    ├── _layout.tsx  # applies to ALL routes here :(
    ├── about.tsx
    ├── career.tsx
    ├── archive.tsx
    └── contact.tsx
```

**Route groups** solve this. A route group is a folder whose name is wrapped in parentheses — for example, `(marketing)` or `(info)`. The group name is **stripped from the URL**, so it only affects organization (and which `_layout.tsx` / `_middleware.tsx` apply), not the public path.

```txt-files Project structure
└── <root>/routes
    ├── (marketing)
    │   ├── _layout.tsx  # only applies to about.tsx and career.tsx
    │   ├── about.tsx    # /about
    │   └── career.tsx   # /career
    └── (info)
        ├── _layout.tsx  # only applies to archive.tsx and contact.tsx
        ├── archive.tsx  # /archive
        └── contact.tsx  # /contact
```

> [warn]: Avoid creating routes in different groups that resolve to the same URL. The resulting ambiguity has no well-defined winner.
>
> ```txt-files Project structure
> └── <root>/routes
>     ├── (group-1)
>     │   └── about.tsx  # Bad: maps to /about
>     └── (group-2)
>         └── about.tsx  # Bad: maps to /about too
> ```

## Co-location

If you want to keep components and islands close to the routes that use them, use a **co-located folder**: a route group whose name begins with an underscore, like `(_components)` or `(_islands)`. Fresh ignores these folders for routing — nothing inside them becomes a URL — so they're effectively private to the surrounding route folder.

The one special name is `(_islands)`: Fresh treats every file in it as an island, the same as files under the top-level `islands/` directory. This means you can put an island next to the route that uses it instead of in the global islands tree.

```txt-files Project structure
└── <root>/routes
    ├── (marketing)
    │   ├── _layout.tsx
    │   ├── about.tsx
    │   ├── career.tsx
    │   ├── (_components)
    │   │   └── newsletter-cta.tsx       # private to marketing pages
    │   └── (_islands)
    │       └── interactive-stats.tsx    # Fresh treats this as an island
    └── shop
        ├── (_components)
        │   └── product-card.tsx
        └── (_islands)
            └── cart.tsx                 # Fresh treats this as an island
```

This lets you organize a feature's routes, components, and islands together in one folder, instead of spreading them across the project.

## Next steps

- [**Routes**](/docs/concepts/routes) — what a route file looks like: handler + page, return values, GET vs POST.
- [**Context**](/docs/concepts/context) — read params, query string, headers, and redirect.
- [**Layouts**](/docs/concepts/layouts) and [**Middleware**](/docs/concepts/middleware) — wrap groups of routes with shared markup and logic.
