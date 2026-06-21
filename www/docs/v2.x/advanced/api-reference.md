---
description: |
  Quick reference for all public exports from Fresh's entry points: fresh, fresh/runtime, and fresh/dev.
---

This page lists all public exports from Fresh's entry points.

> [info]: You can also explore Fresh's full API documentation on JSR:
> [`@fresh/core`](https://jsr.io/@fresh/core/doc)

## `fresh`

The main entry point for server-side code.

```ts
import { App, createDefine, HttpError, page, staticFiles } from "fresh";
```

| Export                                                                | Kind     | Description                                                                                        |
| --------------------------------------------------------------------- | -------- | -------------------------------------------------------------------------------------------------- |
| [`App`](https://jsr.io/@fresh/core/doc/~/App)                         | Class    | The main application class. See [App](/docs/concepts/app).                                         |
| [`staticFiles`](https://jsr.io/@fresh/core/doc/~/staticFiles)         | Function | Middleware for serving static files. See [Static Files](/docs/concepts/static-files).              |
| [`createDefine`](https://jsr.io/@fresh/core/doc/~/createDefine)       | Function | Create type-safe `define.*` helpers. See [Define Helpers](/docs/advanced/define).                  |
| [`page`](https://jsr.io/@fresh/core/doc/~/page)                       | Function | Return data from a handler to a page component. See [Data Fetching](/docs/concepts/data-fetching). |
| [`HttpError`](https://jsr.io/@fresh/core/doc/~/HttpError)             | Class    | Throw HTTP errors with status codes. See [Error Handling](/docs/advanced/error-handling).          |
| [`cors`](https://jsr.io/@fresh/core/doc/~/cors)                       | Function | CORS middleware. See [cors](/docs/plugins/cors).                                                   |
| [`csrf`](https://jsr.io/@fresh/core/doc/~/csrf)                       | Function | CSRF protection middleware. See [csrf](/docs/plugins/csrf).                                        |
| [`csp`](https://jsr.io/@fresh/core/doc/~/csp)                         | Function | Content Security Policy middleware. See [csp](/docs/plugins/csp).                                  |
| [`trailingSlashes`](https://jsr.io/@fresh/core/doc/~/trailingSlashes) | Function | Trailing slash enforcement middleware. See [trailingSlashes](/docs/plugins/trailing-slashes).      |

**Types:**

| Export                                                                                                                                        | Kind      | Description                                                                 |
| --------------------------------------------------------------------------------------------------------------------------------------------- | --------- | --------------------------------------------------------------------------- |
| [`Context`](https://jsr.io/@fresh/core/doc/~/Context) / [`FreshContext`](https://jsr.io/@fresh/core/doc/~/FreshContext)                       | Interface | The request context passed to all middlewares and handlers.                 |
| [`PageProps`](https://jsr.io/@fresh/core/doc/~/PageProps)                                                                                     | Type      | Props received by page components (`data`, `url`, `params`, `state`, etc.). |
| [`Middleware`](https://jsr.io/@fresh/core/doc/~/Middleware) / [`MiddlewareFn`](https://jsr.io/@fresh/core/doc/~/MiddlewareFn)                 | Type      | Middleware function type.                                                   |
| [`HandlerFn`](https://jsr.io/@fresh/core/doc/~/HandlerFn)                                                                                     | Type      | Single handler function type.                                               |
| [`HandlerByMethod`](https://jsr.io/@fresh/core/doc/~/HandlerByMethod)                                                                         | Type      | Object with per-method handler functions.                                   |
| [`RouteHandler`](https://jsr.io/@fresh/core/doc/~/RouteHandler)                                                                               | Type      | Union of `HandlerFn` and `HandlerByMethod`.                                 |
| [`PageResponse`](https://jsr.io/@fresh/core/doc/~/PageResponse)                                                                               | Type      | Return type of `page()`.                                                    |
| [`RouteConfig`](https://jsr.io/@fresh/core/doc/~/RouteConfig)                                                                                 | Interface | Route configuration (`routeOverride`, `skipInheritedLayouts`, etc.).        |
| [`LayoutConfig`](https://jsr.io/@fresh/core/doc/~/LayoutConfig)                                                                               | Interface | Layout configuration (`skipInheritedLayouts`, `skipAppWrapper`).            |
| [`Define`](https://jsr.io/@fresh/core/doc/~/Define)                                                                                           | Interface | Type of the object returned by `createDefine()`.                            |
| [`FreshConfig`](https://jsr.io/@fresh/core/doc/~/FreshConfig) / [`ResolvedFreshConfig`](https://jsr.io/@fresh/core/doc/~/ResolvedFreshConfig) | Interface | App configuration types.                                                    |
| [`ListenOptions`](https://jsr.io/@fresh/core/doc/~/ListenOptions)                                                                             | Interface | Options for `app.listen()`.                                                 |
| [`Island`](https://jsr.io/@fresh/core/doc/~/Island)                                                                                           | Type      | Island component type.                                                      |
| [`Method`](https://jsr.io/@fresh/core/doc/~/Method)                                                                                           | Type      | HTTP method union type.                                                     |
| [`RouteData`](https://jsr.io/@fresh/core/doc/~/RouteData)                                                                                     | Type      | Data type returned by route handlers via `page()`.                          |
| [`Lazy`](https://jsr.io/@fresh/core/doc/~/Lazy) / [`MaybeLazy`](https://jsr.io/@fresh/core/doc/~/MaybeLazy)                                   | Type      | Utility types for lazily-loaded routes and middleware.                      |
| [`CORSOptions`](https://jsr.io/@fresh/core/doc/~/CORSOptions)                                                                                 | Interface | Options for `cors()`.                                                       |
| [`CsrfOptions`](https://jsr.io/@fresh/core/doc/~/CsrfOptions)                                                                                 | Interface | Options for `csrf()`.                                                       |
| [`CSPOptions`](https://jsr.io/@fresh/core/doc/~/CSPOptions)                                                                                   | Interface | Options for `csp()`.                                                        |

## `fresh/runtime`

Shared runtime utilities for both server and client code. Safe to import in
[islands](/docs/concepts/islands).

```ts
import {
  asset,
  assetSrcSet,
  Head,
  HttpError,
  IS_BROWSER,
  Partial,
} from "fresh/runtime";
```

| Export                                                                | Kind      | Description                                                                                    |
| --------------------------------------------------------------------- | --------- | ---------------------------------------------------------------------------------------------- |
| [`IS_BROWSER`](https://jsr.io/@fresh/core/doc/runtime/~/IS_BROWSER)   | Constant  | `true` in the browser, `false` on the server. Use to guard browser-only code.                  |
| [`asset`](https://jsr.io/@fresh/core/doc/runtime/~/asset)             | Function  | Add cache-busting query params to asset URLs. See [Static Files](/docs/concepts/static-files). |
| [`assetSrcSet`](https://jsr.io/@fresh/core/doc/runtime/~/assetSrcSet) | Function  | Apply `asset()` to all URLs in a `srcset` string.                                              |
| [`Partial`](https://jsr.io/@fresh/core/doc/runtime/~/Partial)         | Component | Mark a region for partial updates. See [Partials](/docs/advanced/partials).                    |
| [`Head`](https://jsr.io/@fresh/core/doc/runtime/~/Head)               | Component | Add elements to the document `<head>`. See [<head> element](/docs/advanced/head).              |
| [`HttpError`](https://jsr.io/@fresh/core/doc/runtime/~/HttpError)     | Class     | HTTP error class (re-exported from `fresh`).                                                   |

## `fresh/dev`

Development and build tools. Only used in `dev.ts` (legacy) or build scripts.

```ts
import { Builder } from "fresh/dev";
```

| Export                                                    | Kind  | Description                                                            |
| --------------------------------------------------------- | ----- | ---------------------------------------------------------------------- |
| [`Builder`](https://jsr.io/@fresh/core/doc/dev/~/Builder) | Class | Pre-Vite build system (legacy). See [Builder](/docs/advanced/builder). |

**Types:**

| Export                                                                                                                                                                                                                          | Kind      | Description                   |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- | ----------------------------- |
| [`BuildOptions`](https://jsr.io/@fresh/core/doc/dev/~/BuildOptions)                                                                                                                                                             | Interface | Options for `new Builder()`.  |
| [`ResolvedBuildConfig`](https://jsr.io/@fresh/core/doc/dev/~/ResolvedBuildConfig)                                                                                                                                               | Interface | Resolved build configuration. |
| [`OnTransformArgs`](https://jsr.io/@fresh/core/doc/dev/~/OnTransformArgs) / [`OnTransformOptions`](https://jsr.io/@fresh/core/doc/dev/~/OnTransformOptions) / [`TransformFn`](https://jsr.io/@fresh/core/doc/dev/~/TransformFn) | Type      | Build plugin hook types.      |
