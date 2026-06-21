// Shared, type-only helpers. Kept apart from `./modules.ts` (runtime
// validators) so that the auto-generated `.fresh/types/<route>/$<file>.ts`
// typings files can pull the typing helpers without dragging in any runtime
// values.

import type { ComponentChildren, VNode } from "preact";
import type { ServerRuntimeContext } from "srvx";

/** Strict structural equality check at the type level. */
export type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;

interface Params {}

/**
 * Deployment-target-specific request context, surfaced as `ctx.runtime`. This
 * is srvx's normalized {@link ServerRuntimeContext} — the same object every
 * Nitro target rides on — so the per-target fields are already typed: discriminate
 * on `runtime.name`, then read e.g. `runtime.cloudflare.env` (typed from your
 * `cloudflare:workers` bindings) or `runtime.deno.info` (a `Deno.ServeHandlerInfo`).
 *
 * Modelled as an extendable interface (rather than a bare re-export) so a project
 * can `declare module "fresh/types" { interface RuntimeContext { ... } }` to add
 * target shapes Fresh doesn't ship.
 *
 * May be `undefined` when the host didn't provide one (e.g. a request synthesized
 * outside a srvx server) — narrow before use.
 */
// deno-lint-ignore no-empty-interface
export interface RuntimeContext extends ServerRuntimeContext {}

/**
 * The default state type used when no middleware has declared one. Modelled
 * as an empty interface (rather than `Record<string, never>`) so users can
 * `interface State extends EmptyState { ... }` and add their own properties.
 */
// deno-lint-ignore no-empty-interface
export interface EmptyState {}

export interface HandlerContext<P extends Params = Params, S = EmptyState> {
  req: Request;
  /** Parsed `req.url`. */
  url: URL;
  params: P;
  state: S;
  /**
   * `true` when this is a client-driven partial navigation: the request
   * carries the `Fresh-Partial` header and `Sec-Fetch-*` metadata consistent
   * with a same-origin fetch. The framework renders only the `<Partial>`
   * regions for these; handlers may also branch on it to skip work that isn't
   * needed for a partial update.
   */
  isPartial: boolean;
  /**
   * Deployment-target-specific request context (Cloudflare per-request `env`
   * + `ExecutionContext`, Deno's `ServeHandlerInfo`, the Node req/res, …),
   * normalized by srvx. `undefined` when the host didn't provide one. Narrow
   * on `runtime.name` before reaching into a per-target field.
   */
  runtime: RuntimeContext | undefined;
  /**
   * Hand the host a promise that should keep the invocation alive past the
   * response (e.g. Cloudflare/Deno `waitUntil`). On hosts without one (Node
   * dev), the promise still runs — it just isn't tracked.
   */
  waitUntil(promise: Promise<unknown>): void;
  next: (state?: unknown) => Promise<Response>;
  /**
   * Build a 302 (configurable) redirect response. Protocol-relative paths
   * (`//example.com/x`) are collapsed to a single `/` so a trusted path
   * input can't be turned into a cross-origin redirect.
   */
  redirect(pathOrUrl: string, status?: number): Response;
}

/**
 * Successful render result returned by a handler. The framework will render
 * the route's default-exported page component with `data` (and propagate
 * `headers` / `status` onto the eventual HTTP response).
 */
export interface HandlerResult<Data = unknown> {
  data: Data;
  headers?: HeadersInit;
  status?: number;
}

/** A handler may return either a fully-formed Response, or a render result. */
export type HandlerReturn<Data = unknown> = Response | HandlerResult<Data>;

export type RequestHandler<P extends Params = Params, S extends EmptyState = EmptyState> = (
  ctx: HandlerContext<P, S>,
) => HandlerReturn | Promise<HandlerReturn>;

export type HttpMethod = "GET" | "HEAD" | "POST" | "PUT" | "DELETE" | "PATCH" | "OPTIONS";

export type MethodHandlers<P extends Params = Params, S extends EmptyState = EmptyState> = Partial<
  Record<HttpMethod, RequestHandler<P, S>>
>;

export type Handler<P extends Params = Params, S extends EmptyState = EmptyState> =
  | RequestHandler<P, S>
  | MethodHandlers<P, S>;

/**
 * Context passed to a middleware. `ParentS` is the state declared by the
 * next-higher middleware (or `EmptyState` for the root middleware). `OwnS`
 * is the state this middleware produces — when it differs from `ParentS`
 * the `next` call requires a `{ state }` argument.
 */
export interface MiddlewareContext<ParentS, OwnS extends ParentS = ParentS> {
  req: Request;
  /** Parsed `req.url`. */
  url: URL;
  state: ParentS;
  /** `true` for a client-driven partial navigation request. See {@link HandlerContext}. */
  isPartial: boolean;
  /** Deployment-target-specific request context. See {@link HandlerContext.runtime}. */
  runtime: RuntimeContext | undefined;
  /** Keep the invocation alive past the response. See {@link HandlerContext.waitUntil}. */
  waitUntil(promise: Promise<unknown>): void;
  // `next` always accepts the *entire* new state. When `OwnS` is the same as
  // `ParentS` (the middleware adds nothing), `next()` is optional; otherwise
  // the full `OwnS` must be passed.
  next: Equal<ParentS, OwnS> extends true
    ? (state?: OwnS) => Promise<Response>
    : (state: OwnS) => Promise<Response>;
  /**
   * Build a 302 (configurable) redirect response. Protocol-relative paths
   * (`//example.com/x`) are collapsed to a single `/` so a trusted path
   * input can't be turned into a cross-origin redirect.
   */
  redirect(pathOrUrl: string, status?: number): Response;
}

/** The function signature a user-authored middleware must satisfy. */
export type MiddlewareFn<ParentS = EmptyState, OwnS extends ParentS = ParentS> = (
  ctx: MiddlewareContext<ParentS, OwnS>,
) => Response | Promise<Response>;

/** Alias for {@link MiddlewareFn} — older imports keep working. */
export type Middleware<ParentS = EmptyState, OwnS extends ParentS = ParentS> = MiddlewareFn<
  ParentS,
  OwnS
>;

// ---------- Pages ----------

/** Props handed to a route's default-exported page component. */
export interface PageProps<Data = unknown, P extends Params = Params, S = EmptyState> {
  data: Data;
  req: Request;
  /** Parsed `req.url`. */
  url: URL;
  state: S;
  params: P;
  /** Deployment-target-specific request context. See {@link HandlerContext.runtime}. */
  runtime: RuntimeContext | undefined;
}

/** A page component renders a Preact `VNode` (i.e. JSX). */
export type PageComponent<Data = unknown, P extends Params = Params, S = EmptyState> = (
  props: PageProps<Data, P, S>,
) => VNode;

// ---------- Error page ----------

/**
 * Context passed to `routes/_error.tsx`'s handler. Extends `HandlerContext`
 * with the `error` that triggered this dispatch — either a framework-thrown
 * `HttpError` (`NotFoundError`, `MethodNotAllowedError`) or whatever the
 * route's handler/page threw.
 */
export interface ErrorHandlerContext<
  P extends Params = Params,
  S = EmptyState,
> extends HandlerContext<P, S> {
  error: unknown;
}

/**
 * The single-function form of an error-page handler — same shape as
 * {@link RequestHandler} but with an {@link ErrorHandlerContext} (carrying
 * the thrown `error`) instead of the base `HandlerContext`.
 */
export type ErrorRequestHandler<P extends Params = Params, S extends EmptyState = EmptyState> = (
  ctx: ErrorHandlerContext<P, S>,
) => HandlerReturn | Promise<HandlerReturn>;

/** Method-map form of an error-page handler. */
export type ErrorMethodHandlers<
  P extends Params = Params,
  S extends EmptyState = EmptyState,
> = Partial<Record<HttpMethod, ErrorRequestHandler<P, S>>>;

/**
 * Error-page equivalent of {@link Handler}: either a single function (each
 * HTTP method invokes it) or a method-map. Both shapes receive an
 * {@link ErrorHandlerContext} so the user can inspect `ctx.error`.
 */
export type ErrorHandler<P extends Params = Params, S extends EmptyState = EmptyState> =
  | ErrorRequestHandler<P, S>
  | ErrorMethodHandlers<P, S>;

/** Props handed to the `_error` page component — `PageProps` + the `error`. */
export interface ErrorPageProps<
  Data = unknown,
  P extends Params = Params,
  S = EmptyState,
> extends PageProps<Data, P, S> {
  error: unknown;
}

export type ErrorPageComponent<Data = unknown, P extends Params = Params, S = EmptyState> = (
  props: ErrorPageProps<Data, P, S>,
) => VNode;

// ---------- Layout ----------

/**
 * Props handed to a `routes/.../_layout.tsx` component. `Component` renders the
 * next inner layout, or — at the innermost layer — the page itself. Use it as
 * `<Component />` in JSX. The other fields mirror page props for ergonomic
 * access from layouts.
 */
export interface LayoutProps<Data = unknown, P extends Params = Params, S = EmptyState> {
  /** The next inner layer (next layout, or the page). Render with `<Component />`. */
  Component: () => VNode;
  data: Data;
  req: Request;
  url: URL;
  state: S;
  params: P;
  /** Deployment-target-specific request context. See {@link HandlerContext.runtime}. */
  runtime: RuntimeContext | undefined;
}

/** A `routes/.../_layout.tsx` component — default export wrapped by the `layout` helper. */
export type LayoutComponent<Data = unknown, P extends Params = Params, S = EmptyState> = (
  props: LayoutProps<Data, P, S>,
) => VNode;

// ---------- App wrapper ----------

/**
 * Props handed to the project's `_app` wrapper component. The wrapper
 * receives the rendered page tree as `children` and is responsible for the
 * outer `<html>` / `<head>` / `<body>` shell.
 */
export interface AppProps {
  children: ComponentChildren;
}

/**
 * The `_app` wrapper component. Default export of `routes/_app.tsx`.
 * When absent, Fresh falls back to a minimal default html/head/body shell.
 */
export type AppComponent = (props: AppProps) => VNode;

/**
 * Walks a handler's return type and pulls out the `data` field. Used in the
 * generated `$<route>.ts` to thread the data type from `handlers` into
 * `define.page`'s props.
 *
 * `DataFromAwaited` is split out so the conditional distributes over each
 * member of an awaited union — a handler that returns `Response | { data }`
 * (e.g. one branch redirects, another renders) keeps the `data` shape on the
 * page instead of collapsing to `never`.
 */
type DataFromAwaited<X> = X extends HandlerResult<infer D> ? D : never;
type DataFromReturn<R> = DataFromAwaited<Awaited<R>>;
type DataFromFn<F> = F extends (...args: never[]) => infer R ? DataFromReturn<R> : never;
export type InferData<H> = H extends (...args: never[]) => unknown
  ? DataFromFn<H>
  : H extends Record<string, unknown>
    ? { [K in keyof H]: DataFromFn<H[K]> }[keyof H]
    : never;
