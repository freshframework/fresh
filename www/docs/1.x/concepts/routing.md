---
description: |
  File based routing is the simplest way to do routing in Fresh apps. Additionally custom patterns can be configured per route.
---

Routing is the mechanism that determines what route a given incoming request is
handled by. Fresh routes requests based on their URL path. By default routes
specify which paths they are invoked for using the name of the file. Routes can
also define a custom [URL pattern][urlpattern] to match against for more
advanced use cases.

The file based routing in Fresh is very similar to the file based routing seen
in other frameworks, namely Next.js. File names are used to determine which
route a given request should be handled by. The pattern is determined based on
the path of the file on disk, relative to the `routes/` directory.

File names are mapped to route patterns as follows:

- File extensions are ignored.
- Literals in the file path are treated as string literals to match.
- Files named `<path>/index.<ext>` behave identically to a file named
  `<path>.<ext>`.
- Path segments can be made dynamic by surrounding an identifier with `[` and
  `]`.
- Paths where the last path segment follows the structure `[...<ident>]` are
  treated as having a wildcard suffix.

Here is a table of file names, which route patterns they map to, and which paths
they might match:

| File name                   | Route pattern          | Matching paths                          |
| --------------------------- | ---------------------- | --------------------------------------- |
| `index.ts`                  | `/`                    | `/`                                     |
| `about.ts`                  | `/about`               | `/about`                                |
| `blog/index.ts`             | `/blog`                | `/blog`                                 |
| `blog/[slug].ts`            | `/blog/:slug`          | `/blog/foo`, `/blog/bar`                |
| `blog/[slug]/comments.ts`   | `/blog/:slug/comments` | `/blog/foo/comments`                    |
| `old/[...path].ts`          | `/old/:path*`          | `/old/foo`, `/old/bar/baz`              |
| `docs/[[version]]/index.ts` | `/docs{/:version}?`    | `/docs`, `/docs/latest`, `/docs/canary` |

Advanced use-cases can require that a more complex pattern be used for matching.
A custom [URL pattern][urlpattern] can be specified in the route configuration.
This pattern will be used instead of the file path based pattern:

```ts routes/x.ts
import { RouteConfig } from "$fresh/server.ts";

export const config: RouteConfig = {
  routeOverride: "/x/:module@:version/:path*",
};

// ...
```

## Route Groups

When working with [layouts](/docs/1.x/concepts/layouts) or
[middlewares](/docs/1.x/concepts/middleware), you'll sometimes come across a
situation where you want your routes to inherit from a layout other than what's
suggested by the URL segment.

Let's illustrate that with an example:

```txt Example page layout
/about -> layout A
/career -> layout A
/archive -> layout B
/contact -> layout B
```

Without any way to group routes this is a problem because every route segment
can only have one `_layout` file.

```txt-files Project structure
<project root>
└── routes
    ├── _layout.tsx  # applies to all routes here :(
    ├── about.tsx
    ├── career.tsx
    ├── archive.tsx
    └── contact.tsx
```

We can solve this problem with route groups. A route group is a folder which has
a name that is wrapped in parentheses. For example `(info)` would be considered
a route group and so would `(marketing)`. This enables us to group related
routes in a folder and use a different `_layout` file for each group.

```txt-files Project structure
└── <root>/routes
    ├── (marketing)
    │   ├── _layout.tsx  # only applies to about.tsx and career.tsx
    │   ├── about.tsx
    │   └── career.tsx
    └── (info)
        ├── _layout.tsx  # only applies to archive.tsx and contact.tsx
        ├── archive.tsx
        └── contact.tsx
```

> [warn]: Be careful about routes in different groups which match to the same
> URL. Such scenarios will lead to ambiguity as to which route file should be
> picked.
>
> ```txt-files Project structure
> └── <root>/routes
>     ├── (group-1)
>     │   └── about.tsx  # Bad: Maps to same `/about` url
>     └── (group-2)
>         └── about.tsx  # Bad: Maps to same `/about` url
> ```

[urlpattern]: https://developer.mozilla.org/en-US/docs/Web/API/URL_Pattern_API

## Co-location

If you want to store components and islands closer to their routes, you may want
to use co-location.

When the name of a route group folder starts with an underscore, like
`(_components)`, Fresh will ignore that folder and it’s effectively treated as
private. This means you can use these private route folders to store components
related to a particular route.

Following the above example, say you have some components you only want to use
in your marketing pages, you could create a route group folder `(_components)`
to house these.

The one special name is `(_islands)` which tells Fresh to treat all files in
that folder as an island.

```txt-files Project structure
└── <root>/routes
    ├── (marketing)
    │   ├── _layout.tsx
    │   ├── about.tsx
    │   ├── career.tsx
    │   ├── (_components)
    │   │   └── newsletter-cta.tsx
    │   └── (_islands)
    │       └── interactive-stats.tsx # Fresh treats this as an island
    └── shop
        ├── (_components)
        │   └── product-card.tsx
        └── (_islands)
            └── cart.tsx # Fresh treats this as an island
```

Combined together, this gives you the ability to organise your code on a feature
basis and put all related components, islands or anything else into a shared
folder.
