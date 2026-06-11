/**
 * @module
 *
 * Fresh is a next-gen web framework for Deno, built on
 * [Preact](https://preactjs.com). It uses an island-based
 * client hydration model to ship zero JavaScript to the
 * client by default, with file-system routing and TypeScript
 * support out of the box.
 *
 * @example Quick start
 * ```ts
 * import { App, staticFiles } from "@fresh/core";
 *
 * const app = new App()
 *   .use(staticFiles())
 *   .fsRoutes();
 *
 * Deno.serve(app.handler());
 * ```
 */

// -- Core -----------------------------------------------------------
/** @category Core */
export { App, type ListenOptions } from "./app.ts";
/** @category Core */
export type {
  Context,
  FreshContext,
  Island,
  WebSocketHandlers,
  WebSocketUpgradeOptions,
} from "./context.ts";
/** @category Core */
export type { FreshConfig, ResolvedFreshConfig } from "./config.ts";
/** @category Core */
export { HttpError } from "./error.ts";
/** @category Core */
export type { PageProps } from "./render.ts";

// -- Routing --------------------------------------------------------
/** @category Routing */
export {
  type HandlerByMethod,
  type HandlerFn,
  page,
  type PageResponse,
  type RouteData,
  type RouteHandler,
} from "./handlers.ts";
/** @category Routing */
export type { LayoutConfig, Lazy, MaybeLazy, RouteConfig } from "./types.ts";
/** @category Routing */
export type { Method } from "./router.ts";
/** @category Routing */
export { createDefine, type Define } from "./define.ts";

// -- Middleware -----------------------------------------------------
/** @category Middleware */
export type { Middleware, MiddlewareFn } from "./middlewares/mod.ts";
/** @category Middleware */
export { trailingSlashes } from "./middlewares/trailing_slashes.ts";
/** @category Middleware */
export { staticFiles } from "./middlewares/static_files.ts";
/** @category Middleware */
export { csrf, type CsrfOptions } from "./middlewares/csrf.ts";
/** @category Middleware */
export { cors, type CORSOptions } from "./middlewares/cors.ts";
/** @category Middleware */
export {
  ipFilter,
  type IpFilterOptions,
  type IpFilterRules,
} from "./middlewares/ip_filter.ts";
/** @category Middleware */
export { csp, type CSPOptions } from "./middlewares/csp.ts";
