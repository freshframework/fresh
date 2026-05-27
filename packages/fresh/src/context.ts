import {
  type AnyComponent,
  type ComponentType,
  Fragment,
  type FunctionComponent,
  h,
  isValidElement,
  type VNode,
} from "preact";
import { jsxTemplate } from "preact/jsx-runtime";
import { SpanStatusCode } from "@opentelemetry/api";
import type { ResolvedFreshConfig } from "./config.ts";
import type { BuildCache } from "./build_cache.ts";
import { HttpError } from "./error.ts";
import type { LayoutConfig } from "./types.ts";
import {
  FreshScripts,
  RenderState,
  setRenderState,
} from "./runtime/server/preact_hooks.ts";
import { NONCE_SYMBOL } from "./middlewares/csp.ts";
import { DEV_ERROR_OVERLAY_URL, PARTIAL_SEARCH_PARAM } from "./constants.ts";
import { tracer } from "./otel.ts";
import {
  type ComponentDef,
  isAsyncAnyComponent,
  type PageProps,
  renderAsyncAnyComponent,
  renderRouteComponent,
} from "./render.ts";
import { renderToString } from "preact-render-to-string";

const ENCODER = new TextEncoder();

/**
 * Event handlers for a WebSocket connection upgraded via
 * {@linkcode Context.upgrade}.
 */
export interface WebSocketHandlers {
  /** Called when the WebSocket connection is established. */
  open?(socket: WebSocket): void;
  /** Called when a message is received. */
  message?(socket: WebSocket, event: MessageEvent): void;
  /** Called when the connection is closed. */
  close?(socket: WebSocket, code: number, reason: string): void;
  /** Called when an error occurs. */
  error?(socket: WebSocket, event: Event | ErrorEvent): void;
}

/**
 * Options forwarded to `Deno.upgradeWebSocket()`.
 */
export interface WebSocketUpgradeOptions {
  /** Automatically close the connection if no ping is received
   * within this many seconds. Default: 120. */
  idleTimeout?: number;
  /** The WebSocket sub-protocol to negotiate. */
  protocol?: string;
}

/**
 * Side channel used by `@fresh/plugin-vite` (and any other adapter sitting on
 * top of `node:http`) to hand a raw socket + buffered head to `ctx.upgrade()`.
 * `Deno.upgradeWebSocket()` normally pulls these off the request handled by
 * `Deno.serve`, but a request synthesized from `node:http` carries neither, so
 * the adapter stashes them here and `ctx.upgrade()` forwards them to Deno.
 *
 * Stored on `globalThis` so a single WeakMap is shared even when this module
 * is evaluated more than once (e.g. once by Deno for the Vite plugin and once
 * by Vite's SSR runner for the user's server code).
 */
const UPGRADE_SOURCE_KEY: unique symbol = Symbol.for(
  "fresh.upgradeSourceMap",
) as typeof UPGRADE_SOURCE_KEY;
// deno-lint-ignore no-explicit-any
type UpgradeSource = { socket: any; head: any };
// deno-lint-ignore no-explicit-any
const globalAny = globalThis as any;
export const upgradeSourceMap: WeakMap<Request, UpgradeSource> =
  globalAny[UPGRADE_SOURCE_KEY] ??
    (globalAny[UPGRADE_SOURCE_KEY] = new WeakMap<Request, UpgradeSource>());

/**
 * Duck-type check: treats the argument as managed-mode handlers when at least
 * one of the handler keys (`open`, `message`, `close`, `error`) is a
 * function.  This works because {@link WebSocketUpgradeOptions} only has
 * non-function fields (`idleTimeout`, `protocol`), so a plain options object
 * will never match.
 *
 * **Edge case:** an empty object `{}` satisfies `WebSocketHandlers` at the
 * type level (all keys are optional) but returns `false` here, so
 * `ctx.upgrade({})` enters bare mode. This is harmless — an empty handlers
 * object would be a no-op in managed mode anyway.
 *
 * If `WebSocketUpgradeOptions` ever gains a function-valued field whose name
 * collides with a handler key, this guard must be updated (or replaced with a
 * branded/sentinel approach).
 */
function isWebSocketHandlers(
  value: unknown,
): value is WebSocketHandlers {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return typeof v.open === "function" ||
    typeof v.message === "function" ||
    typeof v.close === "function" ||
    typeof v.error === "function";
}

export interface Island {
  file: string;
  name: string;
  exportName: string;
  fn: ComponentType;
  css: string[];
}

export type ServerIslandRegistry = Map<ComponentType, Island>;

export const internals: unique symbol = Symbol("fresh_internal");

export interface UiTree<Data, State> {
  app: AnyComponent<PageProps<Data, State>> | null;
  layouts: ComponentDef<Data, State>[];
}

/**
 * @deprecated Use {@linkcode Context} instead.
 */
export type FreshContext<State = unknown> = Context<State>;

export let getBuildCache: <T>(ctx: Context<T>) => BuildCache<T>;
export let getInternals: <T>(ctx: Context<T>) => UiTree<unknown, T>;
export let setAdditionalStyles: <T>(ctx: Context<T>, css: string[]) => void;

/**
 * The context passed to every middleware. It is unique for every request.
 */
export class Context<State> {
  #internal: UiTree<unknown, State> = {
    app: null,
    layouts: [],
  };
  /** Reference to the resolved Fresh configuration */
  readonly config: ResolvedFreshConfig;
  /**
   * The request url parsed into an `URL` instance. This is typically used
   * to apply logic based on the pathname of the incoming url or when
   * certain search parameters are set.
   */
  readonly url: URL;
  /** The original incoming {@linkcode Request} object. */
  req: Request;
  /** The matched route pattern. */
  readonly route: string | null;
  /** The url parameters of the matched route pattern. */
  readonly params: Record<string, string>;
  /** State object that is shared with all middlewares. */
  readonly state: State = {} as State;
  data: unknown = undefined;
  /** Error value if an error was caught (Default: null) */
  error: unknown | null = null;
  readonly info: Deno.ServeHandlerInfo;
  /**
   * Whether the current Request is a partial request.
   *
   * Partials in Fresh will append the query parameter
   * {@linkcode PARTIAL_SEARCH_PARAM} to the URL. This property can
   * be used to determine if only `<Partial>`'s need to be rendered.
   */
  readonly isPartial: boolean;

  /**
   * Call the next middleware.
   * ```ts
   * const myMiddleware: Middleware = (ctx) => {
   *   // do something
   *
   *   // Call the next middleware
   *   return ctx.next();
   * }
   *
   * const myMiddleware2: Middleware = async (ctx) => {
   *   // do something before the next middleware
   *   doSomething()
   *
   *   const res = await ctx.next();
   *
   *   // do something after the middleware
   *   doSomethingAfter()
   *
   *   // Return the `Response`
   *   return res
   * }
   */
  next: () => Promise<Response>;

  #buildCache: BuildCache<State>;
  #additionalStyles: string[] | null = null;

  Component!: FunctionComponent;

  static {
    // deno-lint-ignore no-explicit-any
    getInternals = <T>(ctx: Context<T>) => ctx.#internal as any;
    getBuildCache = <T>(ctx: Context<T>) => ctx.#buildCache;
    setAdditionalStyles = <T>(ctx: Context<T>, css: string[]) =>
      ctx.#additionalStyles = css;
  }

  constructor(
    req: Request,
    url: URL,
    info: Deno.ServeHandlerInfo,
    route: string | null,
    params: Record<string, string>,
    config: ResolvedFreshConfig,
    next: () => Promise<Response>,
    buildCache: BuildCache<State>,
  ) {
    this.url = url;
    this.req = req;
    this.info = info;
    this.params = params;
    this.route = route;
    this.config = config;
    this.isPartial = url.searchParams.has(PARTIAL_SEARCH_PARAM);
    this.next = next;
    this.#buildCache = buildCache;
  }

  /**
   * Return a redirect response to the specified path. This is the
   * preferred way to do redirects in Fresh.
   *
   * ```ts
   * ctx.redirect("/foo/bar") // redirect user to "<yoursite>/foo/bar"
   *
   * // Disallows protocol relative URLs for improved security. This
   * // redirects the user to `<yoursite>/evil.com` which is safe,
   * // instead of redirecting to `http://evil.com`.
   * ctx.redirect("//evil.com/");
   * ```
   */
  redirect(pathOrUrl: string, status = 302): Response {
    let location = pathOrUrl;

    // Disallow protocol relative URLs
    if (pathOrUrl !== "/" && pathOrUrl.startsWith("/")) {
      let idx = pathOrUrl.indexOf("?");
      if (idx === -1) {
        idx = pathOrUrl.indexOf("#");
      }

      const pathname = idx > -1 ? pathOrUrl.slice(0, idx) : pathOrUrl;
      const search = idx > -1 ? pathOrUrl.slice(idx) : "";

      // Remove double slashes to prevent open redirect vulnerability.
      location = `${pathname.replaceAll(/\/+/g, "/")}${search}`;
    }

    // Preserve the partial search param through redirects so that the
    // redirected page is still rendered in partial mode.
    if (this.isPartial) {
      const hashIdx = location.indexOf("#");
      const base = hashIdx > -1 ? location.slice(0, hashIdx) : location;
      const hash = hashIdx > -1 ? location.slice(hashIdx) : "";
      const separator = base.includes("?") ? "&" : "?";
      location = `${base}${separator}${PARTIAL_SEARCH_PARAM}=true${hash}`;
    }

    return new Response(null, {
      status,
      headers: {
        location,
      },
    });
  }

  /**
   * Render JSX and return an HTML `Response` instance.
   * ```tsx
   * ctx.render(<h1>hello world</h1>);
   * ```
   */
  async render(
    // deno-lint-ignore no-explicit-any
    vnode: VNode<any> | null,
    init: ResponseInit | undefined = {},
    config: LayoutConfig = {},
  ): Promise<Response> {
    if (arguments.length === 0) {
      throw new Error(`No arguments passed to: ctx.render()`);
    } else if (vnode !== null && !isValidElement(vnode)) {
      throw new Error(`Non-JSX element passed to: ctx.render()`);
    }

    const defs = config.skipInheritedLayouts ? [] : this.#internal.layouts;
    const appDef = config.skipAppWrapper ? null : this.#internal.app;
    const props = this as Context<State>;

    // Compose final vnode tree
    for (let i = defs.length - 1; i >= 0; i--) {
      const child = vnode;
      props.Component = () => child;

      const def = defs[i];

      const result = await renderRouteComponent(this, def, () => child);
      if (result instanceof Response) {
        return result;
      }

      vnode = result;
    }

    let appChild = vnode;
    // deno-lint-ignore no-explicit-any
    let appVNode: VNode<any>;

    let hasApp = true;

    if (isAsyncAnyComponent(appDef)) {
      props.Component = () => appChild;
      const result = await renderAsyncAnyComponent(appDef, props);
      if (result instanceof Response) {
        return result;
      }

      appVNode = result;
    } else if (appDef !== null) {
      appVNode = h(appDef, {
        Component: () => appChild,
        config: this.config,
        data: null,
        error: this.error,
        info: this.info,
        isPartial: this.isPartial,
        params: this.params,
        req: this.req,
        state: this.state,
        url: this.url,
        route: this.route,
      });
    } else {
      hasApp = false;
      appVNode = appChild ?? h(Fragment, null);
    }

    const headers = getHeadersFromInit(init);

    headers.set("Content-Type", "text/html; charset=utf-8");
    const responseInit: ResponseInit = {
      status: init.status ?? 200,
      headers,
      statusText: init.statusText,
    };

    let partialId = "";
    if (this.url.searchParams.has(PARTIAL_SEARCH_PARAM)) {
      partialId = crypto.randomUUID();
      headers.set("X-Fresh-Id", partialId);
    }

    let renderNonce = "";
    const html = tracer.startActiveSpan("render", (span) => {
      span.setAttribute("fresh.span_type", "render");
      const state = new RenderState(
        this,
        this.#buildCache,
        partialId,
      );

      if (this.#additionalStyles !== null) {
        for (let i = 0; i < this.#additionalStyles.length; i++) {
          const css = this.#additionalStyles[i];
          state.islandAssets.add(css);
        }
      }

      try {
        setRenderState(state);

        let html = renderToString(
          vnode ?? h(Fragment, null),
        );

        if (hasApp) {
          appChild = jsxTemplate([html]);
          html = renderToString(appVNode);
        }

        if (
          !state.renderedHtmlBody || !state.renderedHtmlHead ||
          !state.renderedHtmlTag
        ) {
          let fallback: VNode = jsxTemplate([html]);
          if (!state.renderedHtmlBody) {
            let scripts: VNode | null = null;

            if (
              this.url.pathname !== this.config.basePath + DEV_ERROR_OVERLAY_URL
            ) {
              scripts = h(FreshScripts, null) as VNode;
            }

            fallback = h("body", null, fallback, scripts);
          }
          if (!state.renderedHtmlHead) {
            fallback = h(
              Fragment,
              null,
              h("head", null, h("meta", { charset: "utf-8" })),
              fallback,
            );
          }
          if (!state.renderedHtmlTag) {
            fallback = h("html", null, fallback);
          }

          html = renderToString(fallback);
        }

        return `<!DOCTYPE html>${html}`;
      } catch (err) {
        if (err instanceof Error) {
          span.recordException(err);
        } else {
          span.setStatus({
            code: SpanStatusCode.ERROR,
            message: String(err),
          });
        }
        throw err;
      } finally {
        // Add preload headers only when client JS is actually emitted.
        const basePath = this.config.basePath;
        const linkParts: string[] = [];

        if (
          state.needsClientRuntime ||
          state.buildCache.hmrClientEntry !== undefined
        ) {
          const runtimeUrl = state.buildCache.clientEntry.startsWith(".")
            ? state.buildCache.clientEntry.slice(1)
            : state.buildCache.clientEntry;
          linkParts.push(
            `<${
              encodeURI(`${basePath}${runtimeUrl}`)
            }>; rel="modulepreload"; as="script"`,
          );
          state.islands.forEach((island) => {
            const specifier = `${basePath}${
              island.file.startsWith(".") ? island.file.slice(1) : island.file
            }`;
            linkParts.push(
              `<${encodeURI(specifier)}>; rel="modulepreload"; as="script"`,
            );
          });
        }

        if (linkParts.length > 0) {
          headers.append("Link", linkParts.join(", "));
        }

        renderNonce = state.nonce;
        state.clear();
        setRenderState(null);

        span.end();
      }
    });
    const response = new Response(html, responseInit);
    // Expose the nonce to CSP middleware via a symbol so it never
    // leaks as a response header.
    // deno-lint-ignore no-explicit-any
    (response as any)[NONCE_SYMBOL] = renderNonce;
    return response;
  }

  /**
   * Respond with text. Sets `Content-Type: text/plain`.
   * ```tsx
   * app.use(ctx => ctx.text("Hello World!"));
   * ```
   */
  text(content: string, init?: ResponseInit): Response {
    return new Response(content, init);
  }

  /**
   * Respond with html string. Sets `Content-Type: text/html`.
   * ```tsx
   * app.get("/", ctx => ctx.html("<h1>foo</h1>"));
   * ```
   */
  html(content: string, init?: ResponseInit): Response {
    const headers = getHeadersFromInit(init);
    headers.set("Content-Type", "text/html; charset=utf-8");

    return new Response(content, { ...init, headers });
  }

  /**
   * Respond with json string, same as `Response.json()`. Sets
   * `Content-Type: application/json`.
   * ```tsx
   * app.get("/", ctx => ctx.json({ foo: 123 }));
   * ```
   */
  // deno-lint-ignore no-explicit-any
  json(content: any, init?: ResponseInit): Response {
    return Response.json(content, init);
  }

  /**
   * Helper to stream a sync or async iterable and encode text
   * automatically.
   *
   * ```tsx
   * function* gen() {
   *   yield "foo";
   *   yield "bar";
   * }
   *
   * app.use(ctx => ctx.stream(gen()))
   * ```
   *
   * Or pass in the function directly:
   *
   * ```tsx
   * app.use(ctx => {
   *   return ctx.stream(function* gen() {
   *     yield "foo";
   *     yield "bar";
   *   });
   * );
   * ```
   */
  stream<U extends string | Uint8Array>(
    stream:
      | Iterable<U>
      | AsyncIterable<U>
      | (() => Iterable<U> | AsyncIterable<U>),
    init?: ResponseInit,
  ): Response {
    const raw = typeof stream === "function" ? stream() : stream;

    const body = ReadableStream.from(raw)
      .pipeThrough(
        new TransformStream({
          transform(chunk, controller) {
            if (chunk instanceof Uint8Array) {
              // deno-lint-ignore no-explicit-any
              controller.enqueue(chunk as any);
            } else if (chunk === undefined) {
              controller.enqueue(undefined);
            } else {
              const raw = ENCODER.encode(String(chunk));
              controller.enqueue(raw);
            }
          },
        }),
      );

    return new Response(body, init);
  }

  /**
   * Upgrade the request to a WebSocket connection.
   *
   * **Bare mode** — returns the socket and the upgrade response.
   * Wire events yourself and return `response` from your handler:
   *
   * ```ts
   * app.get("/ws", (ctx) => {
   *   const { socket, response } = ctx.upgrade();
   *   socket.onmessage = (e) => socket.send(e.data);
   *   return response;
   * });
   * ```
   *
   * **Managed mode** — pass handlers and receive the response directly:
   *
   * ```ts
   * app.get("/ws", (ctx) =>
   *   ctx.upgrade({
   *     message(socket, event) {
   *       socket.send(event.data);
   *     },
   *   })
   * );
   * ```
   */
  upgrade(
    options?: WebSocketUpgradeOptions,
  ): { socket: WebSocket; response: Response };
  upgrade(
    handlers: WebSocketHandlers,
    options?: WebSocketUpgradeOptions,
  ): Response;
  upgrade(
    handlersOrOptions?: WebSocketHandlers | WebSocketUpgradeOptions,
    maybeOptions?: WebSocketUpgradeOptions,
  ): { socket: WebSocket; response: Response } | Response {
    let handlers: WebSocketHandlers | undefined;
    let options: WebSocketUpgradeOptions | undefined;

    if (isWebSocketHandlers(handlersOrOptions)) {
      handlers = handlersOrOptions;
      options = maybeOptions;
    } else {
      options = handlersOrOptions;
    }

    if (this.req.headers.get("upgrade")?.toLowerCase() !== "websocket") {
      throw new HttpError(400, "Expected a WebSocket upgrade request");
    }

    const source = upgradeSourceMap.get(this.req);
    if (source !== undefined) upgradeSourceMap.delete(this.req);
    const upgradeOptions = source
      ? { ...options, socket: source.socket, head: source.head }
      : options;
    const { socket, response } = Deno.upgradeWebSocket(
      this.req,
      // deno-lint-ignore no-explicit-any
      upgradeOptions as any,
    );

    if (handlers === undefined) {
      return { socket, response };
    }

    if (handlers.open) {
      socket.addEventListener("open", () => handlers.open!(socket));
    }
    if (handlers.message) {
      socket.addEventListener(
        "message",
        (ev) => handlers.message!(socket, ev),
      );
    }
    if (handlers.close) {
      socket.addEventListener(
        "close",
        (ev) => handlers.close!(socket, ev.code, ev.reason),
      );
    }
    if (handlers.error) {
      socket.addEventListener("error", (ev) => handlers.error!(socket, ev));
    }

    return response;
  }
}

function getHeadersFromInit(init?: ResponseInit) {
  if (init === undefined) {
    return new Headers();
  }

  return init.headers !== undefined
    ? init.headers instanceof Headers ? init.headers : new Headers(init.headers)
    : new Headers();
}
