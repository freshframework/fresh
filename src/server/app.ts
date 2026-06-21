// The programmatic `App` builder.
//
// A project may add a root-level `entry.server.ts` that constructs an `App`
// and exports it as `app`:
//
//   import { App } from "fresh";
//   export const app = new App();
//   app.use(async (ctx) => {
//     ctx.state.startedAt = Date.now();
//     return ctx.next();
//   });
//
// At build time the generated per-route module imports this `app` and prepends
// its middlewares to the route's own chain, so an `app.use(...)` callback runs
// exactly like a rootmost `routes/_middleware` — before every route's file-based
// middlewares, handler, and render.

import type { EmptyState, MiddlewareFn } from "./types.ts";

// Reader for `App`'s private middleware list, captured from inside the class
// body by its static block (a `#`-private field is only reachable there). The
// exported `getMiddleware` delegates here, so the list stays off the public
// instance surface while the build's generated route modules can still read it.
let readMiddlewares: (app: App) => readonly MiddlewareFn[];

export class App {
  /** Registered middlewares, in registration order. Private — see `getMiddleware`. */
  #middlewares: MiddlewareFn[] = [];

  static {
    readMiddlewares = (app) => app.#middlewares;
  }

  /**
   * Register a middleware that runs for every route, ahead of any file-based
   * `_middleware`. The callback receives the same `MiddlewareContext` a
   * rootmost `routes/_middleware` would, and must either return a `Response` or
   * call `ctx.next()` to continue the chain. Returns `this` for chaining.
   */
  use(middleware: MiddlewareFn<EmptyState, EmptyState>): this {
    this.#middlewares.push(middleware);
    return this;
  }
}

/**
 * Read an app's registered middlewares, in registration order. Internal API
 * consumed by the build's generated route modules; not part of the user-facing
 * surface.
 */
export function getMiddleware(app: App): readonly MiddlewareFn[] {
  return readMiddlewares(app);
}
