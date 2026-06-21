---
description: |
  Error pages can be used to customize the page that is shown when an error occurs in the application.
---

Fresh supports customizing the `404 Not Found`, and the
`500 Internal Server Error` pages. These are shown when a request is made but no
matching route exists, and when a middleware, route handler, or page component
throws an error respectively.

### 404: Not Found

The 404 page can be customized by creating a `_404.tsx` file in the `routes/`
folder. The file must have a default export that is a regular Preact component.
A props object of type `PageProps` is passed in as an argument.

```tsx routes/_404.tsx
import { PageProps } from "$fresh/server.ts";

export default function NotFoundPage({ url }: PageProps) {
  return <p>404 not found: {url.pathname}</p>;
}
```

#### Manually render 404 pages

The `_404.tsx` file will be invoked automatically when no route matches the URL.
In some cases, one needs to manually trigger the rendering of the 404 page, for
example when the route did match, but the requested resource does not exist.
This can be achieved with `ctx.renderNotFound`.

```tsx routes/blog/[slug].tsx
import { Handlers, PageProps } from "$fresh/server.ts";

export const handler: Handlers = {
  async GET(req, ctx) {
    const blogpost = await fetchBlogpost(ctx.params.slug);
    if (!blogpost) {
      return ctx.renderNotFound({
        custom: "prop",
      });
    }
    return ctx.render({ blogpost });
  },
};

export default function BlogpostPage({ data }) {
  return (
    <article>
      <h1>{data.blogpost.title}</h1>
      {/* rest of your page */}
    </article>
  );
}
```

This can also be achieved by throwing an error, if you're uninterested in
passing specific data to your 404 page:

```tsx routes/missing-page.tsx
import { Handlers } from "$fresh/server.ts";

export const handler: Handlers = {
  GET(_req, _ctx) {
    throw new Deno.errors.NotFound();
  },
};
```

### 500: Internal Server Error

The 500 page can be customized by creating a `_500.tsx` file in the `routes/`
folder. The file must have a default export that is a regular Preact component.
A props object of type `PageProps` is passed in as an argument.

```tsx routes/_500.tsx
import { PageProps } from "$fresh/server.ts";

export default function Error500Page({ error }: PageProps) {
  return <p>500 internal error: {(error as Error).message}</p>;
}
```
