// Runtime composer for a Fresh route. Each generated per-route virtual module
// imports `freshHandler` and hands it the validated handler (or `null` when
// the route only has a page), the validated page component (or `null`), the
// flat middleware list, and the layouts.
//
// When a handler returns a `Response`, we hand that back as-is. When it
// returns a `{ data, headers?, status? }` render-result, we invoke the page
// component with `{ data, req, state, params }`, render it with
// preact-render-to-string, and wrap the HTML in a Response.

import { h, type VNode } from "preact";
import { renderPage, renderPartial } from "./render.ts";
import { PARTIAL_HEADER } from "../runtime/partial.ts";
import type { HandlerResult, Middleware, PageComponent, RouteHandler } from "./modules.ts";
import type { AppComponent, LayoutComponent } from "./types.ts";
import { MethodNotAllowedError } from "./errors.ts";
import { createHandlerContext, createMiddlewareContext, type HandlerCtx } from "./context.ts";

export {
  type HandlerResult,
  type HandlerReturn,
  type MethodHandlers,
  type Middleware,
  type PageComponent,
  type PageProps,
  type RequestHandler,
  type RouteHandler,
  validateHandler,
  validateLayout,
  validateMiddleware,
  validatePage,
} from "./modules.ts";

type ServerEvent = {
  req?: Request;
  method?: string;
  context?: { params?: Record<string, string> | null };
  /** Set by the server entrypoint when dispatching to the `_error` route. */
  error?: unknown;
};

type EventHandler = (event: ServerEvent) => Promise<unknown>;

const AUTO_GET_HANDLER: RouteHandler = {
  GET: () => ({ data: undefined as never }),
};

/** Asset descriptor returned by Vite's `?assets` query import. */
export interface ViteAssets {
  entry?: string;
  js?: ReadonlyArray<{ href: string }>;
  css?: ReadonlyArray<{ href: string }>;
}

export interface RenderConfig {
  dev: boolean;
  /** SSR-side asset bundles (handler + each layout + app). Their CSS is injected. */
  ssrAssets: readonly ViteAssets[];
  /** Client-side asset bundle for `entry.client.*`, or `null`. */
  clientAssets: ViteAssets | null;
  /**
   * Client-side asset bundle for the island hydration boot chunk
   * (`fresh:internal/client-boot`). Always present in build/dev — the boot
   * script is a no-op on pages that didn't render any islands.
   */
  clientBootAssets?: ViteAssets | null;
  /**
   * SSR-side islands map (`fresh:internal/islands`): specifier → loader for
   * the client asset descriptor. The renderer resolves each rendered
   * island's client `entry` URL through this to embed in the page state.
   */
  islands?: Map<string, () => Promise<ViteAssets>>;
  /**
   * The user's `_app` wrapper component (default export of `routes/_app.tsx`),
   * or `null` when the project has no `_app`. When `null`, `renderPage` falls
   * back to the minimal default html/head/body shell.
   */
  app?: AppComponent | null;
}

export function freshHandler(
  handler: RouteHandler | null,
  page: PageComponent | null,
  middlewares: Middleware[],
  layouts: ReadonlyArray<LayoutComponent>,
  renderConfig: RenderConfig = {
    dev: false,
    ssrAssets: [],
    clientAssets: null,
  },
): EventHandler {
  // If neither handlers nor a page is exported, the route is unusable.
  if (handler === null && page === null) {
    return () =>
      Promise.resolve(
        new Response("Route has no handlers and no page", {
          status: 500,
        }),
      );
  }
  // No handlers + page → auto GET that renders the page with no data.
  const resolvedHandler = handler ?? AUTO_GET_HANDLER;

  return (event) => {
    const method = (event.method ?? "GET").toUpperCase();
    const req = event.req;
    const params = (event.context && event.context.params) || {};
    const error = event.error;
    let state: unknown = {};
    let i = 0;
    const next = async (...args: [state?: unknown]): Promise<Response> => {
      if (args.length > 0) state = args[0];
      if (i < middlewares.length) {
        const fn = middlewares[i++];
        const mwCtx = createMiddlewareContext(req, next, {
          params,
          state,
          error,
        });
        return (await fn(mwCtx as Parameters<Middleware>[0])) as Response;
      }
      const handlerCtx = createHandlerContext(
        req,
        createMiddlewareContext(req, next, { params, state, error }),
      );
      return await invokeRoute(resolvedHandler, page, layouts, handlerCtx, method, renderConfig);
    };
    return next();
  };
}

async function invokeRoute(
  handler: RouteHandler,
  page: PageComponent | null,
  layouts: ReadonlyArray<LayoutComponent>,
  ctx: HandlerCtx,
  method: string,
  renderConfig: RenderConfig,
): Promise<Response> {
  const result = await dispatchHandler(handler, ctx, method);
  if (result instanceof Response) return result;

  // Render-result `{ data, headers?, status? }`.
  const render = (result ?? {}) as HandlerResult<unknown>;
  if (!page) {
    return Response.json(render.data ?? null, {
      status: render.status,
      headers: render.headers,
    });
  }
  const pageProps = {
    data: render.data,
    req: ctx.req!,
    url: ctx.url!,
    state: ctx.state,
    params: ctx.params,
    runtime: ctx.runtime,
    error: ctx.error,
  };
  const pageVNode = h(page, pageProps as never) as VNode;

  // Fold the page through the layouts inside-out. Each layout receives a
  // `Component` thunk that returns the next inner layer, plus the same
  // contextual props the page sees.
  let inner: VNode = pageVNode;
  for (let i = layouts.length - 1; i >= 0; i--) {
    const Layout = layouts[i];
    const captured = inner;
    inner = h(
      Layout as never,
      {
        ...pageProps,
        Component: () => captured,
      } as never,
    ) as VNode;
  }

  // Partial navigation: render just the `<Partial>` regions (no document
  // shell). If the page has no partials, fall through to a full render so
  // the client can complete the navigation normally.
  if (ctx.isPartial) {
    const partialBody = await renderPartial(inner, {
      app: renderConfig.app ?? undefined,
      renderConfig,
    });
    if (partialBody !== null) {
      const headers = new Headers(render.headers);
      headers.set("content-type", "text/html; charset=utf-8");
      // Same URL, different body shape depending on the request header — tell
      // caches so a fragment isn't served to a normal navigation.
      addVary(headers, PARTIAL_HEADER);
      return new Response(partialBody, { status: render.status ?? 200, headers });
    }
  }

  const body = await renderPage(inner, {
    app: renderConfig.app ?? undefined,
    renderConfig,
  });
  const headers = new Headers(render.headers);
  if (!headers.has("content-type")) {
    headers.set("content-type", "text/html; charset=utf-8");
  }
  addVary(headers, PARTIAL_HEADER);
  return new Response(body, { status: render.status ?? 200, headers });
}

/** Append a field to the `Vary` response header without dropping existing ones. */
function addVary(headers: Headers, field: string): void {
  const existing = headers.get("vary");
  if (existing === null || existing.trim() === "") {
    headers.set("vary", field);
    return;
  }
  const has = existing.split(",").some((f) => f.trim().toLowerCase() === field.toLowerCase());
  if (!has) headers.set("vary", `${existing}, ${field}`);
}

async function dispatchHandler(
  handler: RouteHandler,
  ctx: HandlerCtx,
  method: string,
): Promise<unknown> {
  const ctxAs = ctx as unknown as Parameters<Extract<RouteHandler, (...args: never) => unknown>>[0];
  if (typeof handler === "function") {
    return await handler(ctxAs);
  }
  const map = handler as Record<string, ((c: typeof ctxAs) => unknown) | undefined>;
  const fn = map[method] ?? (method === "HEAD" ? map.GET : undefined);
  if (fn) return await fn(ctxAs);
  // No entry for this method — throw so the `_error` route renders 405. The
  // allowed methods ride along on the error so the page can set `Allow`.
  throw new MethodNotAllowedError(Object.keys(handler).sort());
}
