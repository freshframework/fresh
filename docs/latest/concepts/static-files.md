---
description: |
  Fresh has built-in support for serving static files. This is useful for serving images, CSS, and other static assets.
---

Static assets placed in the `static/` directory are served at the root of the
webserver via the `staticFiles()` middleware. They are streamed directly from
disk for optimal performance with
[`ETag`](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/ETag)
headers.

```ts main.ts
import { staticFiles } from "fresh";

const app = new App()
  .use(staticFiles());
```

## Imported assets vs static files

When using Fresh with [Vite](/docs/advanced/vite) (now the default), **files
that you import in your JavaScript/TypeScript code should not be placed in the
`static/` folder**. This prevents file duplication during the build process.

```tsx
// Don't import from static/
import "./static/styles.css";

// Import from outside static/ (e.g., assets/)
import "./assets/styles.css";
```

**Rule of thumb:**

- Files **imported in code** (CSS, icons, etc.): place outside `static/` (e.g.,
  in an `assets/` folder)
- Files **referenced by URL path** (favicon.ico, fonts, robots.txt, PDFs, etc.):
  place in `static/`

> [tip]: Always use root-relative URLs (starting with `/`) when referencing
> static files in HTML. For example, use `src="/image/photo.png"` instead of
> `src="image/photo.png"`. Relative paths resolve against the browser's current
> URL, which breaks when navigating between routes.

When you import a file in your code, Vite processes it through its build
pipeline, optimizes it, and adds a content hash to the filename for cache
busting. Keeping these files outside `static/` ensures they're only included
once in your build output.

## Multiple static directories

You can serve files from more than one directory by passing an array to the
`staticDir` option. When the same filename exists in multiple directories, the
first directory in the array takes precedence.

```ts vite.config.ts
import { defineConfig } from "vite";
import { fresh } from "@fresh/plugin-vite";

export default defineConfig({
  plugins: [
    fresh({
      staticDir: ["static", "generated"],
    }),
  ],
});
```

This is useful when you have a build step that generates assets into a separate
directory and you want to keep them apart from hand-authored static files.

> [info]: If you're using the [Builder](/docs/advanced/builder) API instead of
> Vite, the same `staticDir` option accepts a string or an array of strings.

## Caching headers

By default, Fresh adds caching headers for the `src` and `srcset` attributes on
`<img>` and `<source>` tags.

```ts
// Caching headers will be automatically added
app.get("/user", (ctx) => ctx.render(<img src="/user.png" />));
```

You can always opt out of this behaviour per tag, by adding the
`data-fresh-disable-lock` attribute.

```ts
// Opt-out of automatic caching headers
app.get(
  "/user",
  (ctx) => ctx.render(<img src="/user.png" data-fresh-disable-lock />),
);
```

## Adding caching headers manually

Use the `asset()` function to add caching headers manually. It will be served
with a cache lifetime of one year.

```tsx routes/about.tsx
import { asset } from "fresh/runtime";

export default function About() {
  // Adding caching headers manually
  return <a href={asset("/brochure.pdf")}>View brochure</a>;
}
```

For `<img>` tags with a `srcset` attribute, use `assetSrcSet()`:

```tsx routes/gallery.tsx
import { assetSrcSet } from "fresh/runtime";

export default function Gallery() {
  return (
    <img
      src="/photo.jpg"
      srcset={assetSrcSet("/photo-640.jpg 640w, /photo-1280.jpg 1280w")}
    />
  );
}
```

## Content-addressed static files

By default, `asset()` appends a cache-bust key based on the current build ID.
This means **every deploy invalidates every cached static file**, even if the
file content hasn't changed. For small files this is fine, but for large assets
like WASM binaries, fonts, or media files, re-downloading unchanged files on
every deploy is wasteful.

The `contentAddressedStatic` option lets you specify glob patterns for files
that should use their **content hash** as the cache-bust key instead of the
build ID. The URL only changes when the file content changes — surviving deploys
unchanged.

```ts vite.config.ts
import { defineConfig } from "vite";
import { fresh } from "@fresh/plugin-vite";

export default defineConfig({
  plugins: [
    fresh({
      contentAddressedStatic: ["**/*.wasm", "**/*.bin"],
    }),
  ],
});
```

> [info]: If you're using the [Builder](/docs/advanced/builder) API, the same
> option is available on the `Builder` constructor.

With this config, `asset("/module.wasm")` produces a URL like
`/module.wasm?__frsh_c=<content-hash>` instead of
`/module.wasm?__frsh_c=<build-id>`. The middleware serves it with a one-year
immutable cache header. On the next deploy, if the file hasn't changed, the
content hash (and therefore the URL) stays the same — the browser uses its
cache.

> [info]: The content hash is computed at build time from the file contents
> using SHA-256. It's the same hash Fresh already computes for ETag headers.

## Image optimization

Fresh does not include a built-in image optimization pipeline, but since Fresh 2
uses Vite, you can use Vite plugins or external services to optimize images.

### Build-time optimization with Vite

[vite-imagetools](https://github.com/JonasKruckenberg/imagetools) lets you
import images with query parameters to resize, convert formats, and generate
`srcset` at build time:

```ts
deno add -D npm:vite-imagetools
```

```ts vite.config.ts
import { defineConfig } from "vite";
import { fresh } from "@fresh/plugin-vite";
import { imagetools } from "vite-imagetools";

export default defineConfig({
  plugins: [fresh(), imagetools()],
});
```

Then import optimized images directly:

```tsx
import heroAvif from "../static/hero.jpg?format=avif&w=800";

export default function Page() {
  return <img src={heroAvif} alt="Hero" width={800} />;
}
```

### CDN image services

For dynamic optimization without a build step, use a CDN image service that
transforms images on-the-fly:

- [Cloudflare Images](https://developers.cloudflare.com/images/)
- [imgix](https://imgix.com/)
- [Cloudinary](https://cloudinary.com/)

These services resize, compress, and convert images to modern formats (WebP,
AVIF) based on URL parameters, with automatic caching at the edge.

### Best practices

- Use modern formats (WebP, AVIF) with `<picture>` fallbacks
- Provide responsive images with `srcset` and `sizes` attributes
- Set `width` and `height` on `<img>` tags to prevent layout shift
- Use `loading="lazy"` for below-the-fold images
- Use `asset()` / `assetSrcSet()` for cache-busted URLs
