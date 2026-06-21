---
description: |
  The ability to configure the core Fresh server leads to its flexibility.
---

In this page we discuss how the server can be configured during startup.

The signature of the primary method looks like this:

```ts main.ts
export async function start(manifest: Manifest, config: FreshConfig = {});
```

## Configuration

`Manifest` comes from `fresh.gen.ts`, so nothing to do there. `config` is where
things get interesting.
[`FreshConfig`](https://deno.land/x/fresh/server.ts?s=FreshConfig) looks like
this:

```ts fresh 🍋
export interface FreshConfig {
  build?: {
    /**
     * The directory to write generated files to when `dev.ts build` is run.
     * This can be an absolute path, a file URL or a relative path.
     */
    outDir?: string;
    /**
     * This sets the target environment for the generated code. Newer
     * language constructs will be transformed to match the specified
     * support range. See https://esbuild.github.io/api/#target
     * @default {"es2022"}
     */
    target?: string | string[];
  };
  render?: RenderFunction;
  plugins?: Plugin[];
  staticDir?: string;
  router?: RouterOptions;
  server?: Partial<Deno.ServeTlsOptions>;
}
```

And for completeness here are the remaining two types:

```ts fresh 🍋
export type RenderFunction = (
  ctx: RenderContext,
  render: InnerRenderFunction,
) => void | Promise<void>;

export interface RouterOptions {
  /**
   *  Controls whether Fresh will append a trailing slash to the URL.
   *  @default {false}
   */
  trailingSlash?: boolean;
  /**
   *  Configures the pattern of files to ignore in islands and routes.
   *
   *  By default Fresh will ignore test files,
   *  for example files with a `.test.ts` or a `_test.ts` suffix.
   *
   *  @default {/(?:[^/]*_|[^/]*\.|)test\.(?:ts|tsx|mts|js|mjs|jsx|)\/*$/}
   */
  ignoreFilePattern?: RegExp;
  /**
   * Serve fresh from a base path instead of from the root.
   *   "/foo/bar" -> http://localhost:8000/foo/bar
   * @default {undefined}
   */
  basePath?: string;
}
```

## Build

### outDir

As the comment suggests, this can be used to configure where generated files are
written:

```tsx dev.ts
await dev(import.meta.url, "./main.ts", {
  build: {
    outDir: Deno.env.get("FRESH_TEST_OUTDIR") ?? undefined,
  },
});
```

### target

This should be a valid ES Build target.

```tsx dev.ts
await dev(import.meta.url, "./main.ts", {
  build: {
    target: "es2015",
  },
});
```

## Plugins

See the [docs](/docs/1.x/concepts/plugins) on this topic for more detail. But as
a quick example, you can do something like this to load plugins:

```ts main.ts
await start(manifest, { plugins: [twindPlugin(twindConfig)] });
```

## StaticDir

This allows you to specify the location where your site's static assets are
stored. Here's an example:

```ts main.ts
await start(manifest, { staticDir: "./custom_static" });
```

## Render

This is by far the most complicated option currently available. It allows you to
configure how your components get rendered.

## RouterOptions

### TrailingSlash

By default Fresh uses URLs like `https://www.example.com/about`. If you'd like,
you can configure this to `https://www.example.com/about/` by using the
`trailingSlash` setting.

```ts main.ts
await start(manifest, { router: { trailingSlash: true } });
```

### ignoreFilePattern

By default Fresh ignores test files which are co-located next routes and
islands. If you want, you can change the pattern Fresh uses ignore these files

### basePath

This setting allows you to serve a Fresh app from sub-path of a domain. A value
of `/foo/bar` would serve the app from `http://localhost:8000/foo/bar` instead
of `http://localhost:8000/` for example.

The `basePath` will be automatically applied to absolute links in your app. For
example, when the `basePath` is `/foo/bar`, linking to `/about` will
automatically become `/foo/bar/about`.

```tsx
<a href="/about">About</a>;
```

Rendered HTML:

```html
<a href="/foo/bar/about">About</a>
```

The `basePath` is also applied to the `src` and `srcset` attribute of
`<img>`-tags, the `href` attribute of `<link>` and the `src` attribute of
`<script>` tags.

## Server

Now that Deno has stabilized
[Deno.serve](https://docs.deno.com/api/deno/~/Deno.serve) and Fresh has switched
to using this API, all server configuration options are embedded in `server`
inside the `FreshConfig`. The fully expanded set of parameters looks like this:

```ts
server: {
  /** Server private key in PEM format */
  cert: string;

  /** Cert chain in PEM format */
  key: string;

  /** The port to listen on.
   *
   * @default {8000} */
  port?: number;

  /** A literal IP address or host name that can be resolved to an IP address.
   *
   * __Note about `0.0.0.0`__ While listening `0.0.0.0` works on all platforms,
   * the browsers on Windows don't work with the address `0.0.0.0`.
   * You should show the message like `server running on localhost:8080` instead of
   * `server running on 0.0.0.0:8080` if your program supports Windows.
   *
   * @default {"0.0.0.0"} */
  hostname?: string;

  /** An {@linkcode AbortSignal} to close the server and all connections. */
  signal?: AbortSignal;

  /** Sets `SO_REUSEPORT` on POSIX systems. */
  reusePort?: boolean;

  /** The handler to invoke when route handlers throw an error. */
  onError?: (error: unknown) => Response | Promise<Response>;

  /** The callback which is called when the server starts listening. */
  onListen?: (params: { hostname: string; port: number }) => void;
}
```

Use these to configure your server as you see fit.
