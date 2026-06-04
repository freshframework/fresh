import { trace } from "@opentelemetry/api";

import { DENO_DEPLOYMENT_ID } from "@fresh/build-id";
import * as colors from "@std/fmt/colors";
import type { MaybeLazyMiddleware, Middleware } from "./middlewares/mod.ts";
import {
  Context,
  type WebSocketHandlers,
  type WebSocketUpgradeOptions,
} from "./context.ts";
import { mergePath, type Method, UrlPatternRouter } from "./router.ts";
import type { FreshConfig, ResolvedFreshConfig } from "./config.ts";
import type { BuildCache } from "./build_cache.ts";
import { HttpError } from "./error.ts";
import { STATUS_TEXT } from "@std/http/status";
import type { LayoutConfig, MaybeLazy, Route, RouteConfig } from "./types.ts";
import type { RouteComponent } from "./segments.ts";
import {
  applyCommands,
  type Command,
  CommandType,
  DEFAULT_NOT_ALLOWED_METHOD,
  DEFAULT_NOT_FOUND,
  newAppCmd,
  newErrorCmd,
  newHandlerCmd,
  newLayoutCmd,
  newMiddlewareCmd,
  newNotFoundCmd,
  newRouteCmd,
} from "./commands.ts";
import { MockBuildCache } from "./test_utils.ts";

// TODO: Completed type clashes in older Deno versions
// deno-lint-ignore no-explicit-any
export const DEFAULT_CONN_INFO: any = {
  localAddr: { transport: "tcp", hostname: "localhost", port: 8080 },
  remoteAddr: { transport: "tcp", hostname: "localhost", port: 1234 },
};

const MAX_REWRITE_COUNT = 8;

function normalizeRequestUrl(req: Request, trustProxy: boolean): URL {
  const url = new URL(req.url);
  // Prevent open redirect attacks.
  url.pathname = url.pathname.replace(/\/+/g, "/");

  // Apply X-Forwarded-* headers when behind a reverse proxy.
  if (trustProxy) {
    const proto = req.headers.get("x-forwarded-proto");
    if (proto) {
      url.protocol = proto + ":";
    }
    const host = req.headers.get("x-forwarded-host");
    if (host) {
      url.host = host;
    }
  }

  return url;
}

function getRewriteUrl(
  currentUrl: URL,
  pathOrUrl: string | URL,
  basePath: string,
): URL {
  // Auto-prefix basePath for absolute string paths so that apps with a
  // basePath don't silently drop it when calling ctx.rewrite("/some/path").
  let target: string | URL = pathOrUrl;
  if (
    basePath !== "" &&
    typeof pathOrUrl === "string" &&
    pathOrUrl.startsWith("/") &&
    !pathOrUrl.startsWith(basePath)
  ) {
    target = basePath + pathOrUrl;
  }

  const rewritten = target instanceof URL
    ? new URL(target)
    : new URL(target, currentUrl);

  if (rewritten.origin !== currentUrl.origin) {
    throw new Error(
      `ctx.rewrite() only supports same-origin URLs. Expected "${currentUrl.origin}", got "${rewritten.origin}"`,
    );
  }

  // Keep existing query params unless the target explicitly sets a query.
  if (typeof pathOrUrl === "string" && !pathOrUrl.includes("?")) {
    rewritten.search = currentUrl.search;
  }

  return rewritten;
}

const defaultOptionsHandler = (methods: string[]): () => Promise<Response> => {
  return () =>
    Promise.resolve(
      new Response(null, {
        status: 204,
        headers: { Allow: methods.join(", ") },
      }),
    );
};
// deno-lint-ignore require-await
const DEFAULT_ERROR_HANDLER = async <State>(ctx: Context<State>) => {
  const { error } = ctx;

  if (error instanceof HttpError) {
    if (error.status >= 500) {
      // deno-lint-ignore no-console
      console.error(error);
    }
    const message = error.message || STATUS_TEXT[error.status];
    return new Response(message, { status: error.status });
  }

  // deno-lint-ignore no-console
  console.error(error);
  return new Response("Internal server error", { status: 500 });
};

export type ListenOptions =
  & Partial<
    Deno.ServeTcpOptions & Deno.TlsCertifiedKeyPem
  >
  & {
    remoteAddress?: string;
  };
export function createOnListen(
  basePath: string,
  options: ListenOptions,
): (localAddr: Deno.NetAddr) => void {
  return (params) => {
    // Don't spam logs with this on live deployments
    if (DENO_DEPLOYMENT_ID) return;

    const pathname = basePath + "/";
    const protocol = "key" in options && options.key && options.cert
      ? "https:"
      : "http:";

    let hostname = params.hostname;
    // Windows being windows...
    if (
      Deno.build.os === "windows" &&
      (hostname === "0.0.0.0" || hostname === "::")
    ) {
      hostname = "localhost";
    }
    // Work around https://github.com/denoland/deno/issues/23650
    hostname = hostname.startsWith("::") ? `[${hostname}]` : hostname;

    // deno-lint-ignore no-console
    console.log();
    // deno-lint-ignore no-console
    console.log(
      colors.bgRgb8(colors.rgb8(" 🍋 Fresh ready   ", 0), 121),
    );
    const sep = options.remoteAddress ? "" : "\n";
    const space = options.remoteAddress ? " " : "";

    const localLabel = colors.bold("Local:");
    const address = colors.cyan(
      `${protocol}//${hostname}:${params.port}${pathname}`,
    );
    const helper = hostname === "0.0.0.0" || hostname === "::"
      ? colors.cyan(` (${protocol}//localhost:${params.port}${pathname})`)
      : "";
    // deno-lint-ignore no-console
    console.log(`    ${localLabel}  ${space}${address}${helper}${sep}`);
    if (options.remoteAddress) {
      const remoteLabel = colors.bold("Remote:");
      const remoteAddress = colors.cyan(options.remoteAddress);
      // deno-lint-ignore no-console
      console.log(`    ${remoteLabel}  ${remoteAddress}\n`);
    }
  };
}

async function listenOnFreePort(
  options: ListenOptions,
  handler: (
    request: Request,
    info?: Deno.ServeHandlerInfo,
  ) => Promise<Response>,
) {
  // No port specified, check for a free port. Instead of picking just
  // any port we'll check if the next one is free for UX reasons.
  // That way the user only needs to increment a number when running
  // multiple apps vs having to remember completely different ports.
  let firstError = null;
  for (let port = 8000; port < 8020; port++) {
    try {
      return await Deno.serve({ ...options, port }, handler);
    } catch (err) {
      if (err instanceof Deno.errors.AddrInUse) {
        // Throw first EADDRINUSE error if no port is free
        if (!firstError) firstError = err;
        continue;
      }
      throw err;
    }
  }
  throw firstError;
}

export let getBuildCache: <State>(app: App<State>) => BuildCache<State> | null;
export let setBuildCache: <State>(
  app: App<State>,
  cache: BuildCache<State>,
  mode: "development" | "production",
) => void;
export let setErrorInterceptor: <State>(
  app: App<State>,
  fn: (err: unknown) => void,
) => void;

const NOOP = () => {};

/**
 * Create an application instance that passes the incoming `Request`
 * instance through middlewares and routes.
 */
export class App<State> {
  #getBuildCache: () => BuildCache<State> | null = () => null;
  #commands: Command<State>[] = [];
  #onError: (err: unknown) => void = NOOP;

  static {
    getBuildCache = (app) => app.#getBuildCache();
    setBuildCache = (app, cache, mode: "development" | "production") => {
      app.config.root = cache.root;
      app.config.mode = mode;
      app.#getBuildCache = () => cache;
    };
    setErrorInterceptor = (app, fn) => {
      app.#onError = fn;
    };
  }

  /**
   * The final resolved Fresh configuration.
   */
  config: ResolvedFreshConfig;

  constructor(config: FreshConfig = {}) {
    this.config = {
      root: ".",
      basePath: config.basePath ?? "",
      mode: config.mode ?? "production",
      trustProxy: config.trustProxy ?? false,
    };
  }

  /**
   * Add one or more middlewares at the top or the specified path.
   */
  use(...middleware: MaybeLazyMiddleware<State>[]): this;
  use(path: string, ...middleware: MaybeLazyMiddleware<State>[]): this;
  use(
    pathOrMiddleware: string | MaybeLazyMiddleware<State>,
    ...middlewares: MaybeLazyMiddleware<State>[]
  ): this {
    let pattern: string;
    let fns: MaybeLazyMiddleware<State>[];
    if (typeof pathOrMiddleware === "string") {
      pattern = pathOrMiddleware;
      fns = middlewares!;
    } else {
      pattern = "*";
      middlewares.unshift(pathOrMiddleware);
      fns = middlewares;
    }

    this.#commands.push(newMiddlewareCmd(pattern, fns, true));

    return this;
  }

  /**
   * Set the app's 404 error handler. Can be a {@linkcode Route} or a {@linkcode Middleware}.
   */
  notFound(routeOrMiddleware: Route<State> | Middleware<State>): this {
    this.#commands.push(newNotFoundCmd(routeOrMiddleware));
    return this;
  }

  onError(
    path: string,
    routeOrMiddleware: Route<State> | Middleware<State>,
  ): this {
    this.#commands.push(newErrorCmd(path, routeOrMiddleware, true));
    return this;
  }

  appWrapper(component: RouteComponent<State>): this {
    this.#commands.push(newAppCmd(component));
    return this;
  }

  layout(
    path: string,
    component: RouteComponent<State>,
    config?: LayoutConfig,
  ): this {
    this.#commands.push(newLayoutCmd(path, component, config, true));
    return this;
  }

  route(
    path: string,
    route: MaybeLazy<Route<State>>,
    config?: RouteConfig,
  ): this {
    this.#commands.push(newRouteCmd(path, route, config, true));
    return this;
  }

  /**
   * Add middlewares for GET requests at the specified path.
   */
  get(path: string, ...middlewares: MaybeLazy<Middleware<State>>[]): this {
    this.#commands.push(newHandlerCmd("GET", path, middlewares, true));
    return this;
  }
  /**
   * Add middlewares for POST requests at the specified path.
   */
  post(path: string, ...middlewares: MaybeLazy<Middleware<State>>[]): this {
    this.#commands.push(newHandlerCmd("POST", path, middlewares, true));
    return this;
  }
  /**
   * Add middlewares for PATCH requests at the specified path.
   */
  patch(path: string, ...middlewares: MaybeLazy<Middleware<State>>[]): this {
    this.#commands.push(newHandlerCmd("PATCH", path, middlewares, true));
    return this;
  }
  /**
   * Add middlewares for PUT requests at the specified path.
   */
  put(path: string, ...middlewares: MaybeLazy<Middleware<State>>[]): this {
    this.#commands.push(newHandlerCmd("PUT", path, middlewares, true));
    return this;
  }
  /**
   * Add middlewares for DELETE requests at the specified path.
   */
  delete(path: string, ...middlewares: MaybeLazy<Middleware<State>>[]): this {
    this.#commands.push(newHandlerCmd("DELETE", path, middlewares, true));
    return this;
  }
  /**
   * Add middlewares for HEAD requests at the specified path.
   */
  head(path: string, ...middlewares: MaybeLazy<Middleware<State>>[]): this {
    this.#commands.push(newHandlerCmd("HEAD", path, middlewares, true));
    return this;
  }

  /**
   * Register a WebSocket endpoint at the specified path.
   *
   * ```ts
   * app.ws("/chat", {
   *   open(socket) { console.log("connected"); },
   *   message(socket, event) { socket.send(event.data); },
   * });
   * ```
   */
  ws(
    path: string,
    handlers: WebSocketHandlers,
    options?: WebSocketUpgradeOptions,
  ): this {
    return this.get(path, (ctx) => ctx.upgrade(handlers, options));
  }

  /**
   * Add middlewares for all HTTP verbs at the specified path.
   */
  all(path: string, ...middlewares: MaybeLazy<Middleware<State>>[]): this {
    this.#commands.push(newHandlerCmd("ALL", path, middlewares, true));
    return this;
  }

  /**
   * Insert file routes collected in {@linkcode Builder} at this point.
   * @param pattern Append file routes at this pattern instead of the root
   * @returns
   */
  fsRoutes(pattern = "*"): this {
    this.#commands.push({
      type: CommandType.FsRoute,
      pattern,
      getItems: () => {
        const buildCache = this.#getBuildCache();
        if (buildCache === null) return [];
        return buildCache.getFsRoutes();
      },
      includeLastSegment: false,
    });
    return this;
  }

  /**
   * Merge another {@linkcode App} instance into this app at the
   * specified path.
   */
  mountApp(path: string, app: App<State>): this {
    for (let i = 0; i < app.#commands.length; i++) {
      const cmd = app.#commands[i];

      if (cmd.type !== CommandType.App && cmd.type !== CommandType.NotFound) {
        // Apply the inner app's basePath if it exists
        let effectivePattern = cmd.pattern;
        if (app.config.basePath) {
          effectivePattern = mergePath(app.config.basePath, cmd.pattern, false);
        }

        const clone = {
          ...cmd,
          pattern: mergePath(path, effectivePattern, true),
          includeLastSegment: cmd.pattern === "/" || cmd.includeLastSegment,
        };
        this.#commands.push(clone);
        continue;
      }

      this.#commands.push(cmd);
    }

    // deno-lint-ignore no-this-alias
    const self = this;
    app.#getBuildCache = () => self.#getBuildCache();

    return this;
  }

  /**
   * Create handler function for `Deno.serve` or to be used in
   * testing.
   */
  handler(): (
    request: Request,
    info?: Deno.ServeHandlerInfo,
  ) => Promise<Response> {
    let buildCache = this.#getBuildCache();
    if (buildCache === null) {
      if (
        this.config.mode === "production" &&
        DENO_DEPLOYMENT_ID !== undefined
      ) {
        throw new Error(
          `Could not find _fresh directory. Maybe you forgot to run "deno task build" or maybe you're trying to run "main.ts" directly instead of "_fresh/server.js"?`,
        );
      } else {
        buildCache = new MockBuildCache([], this.config.mode);
      }
    }

    const router = new UrlPatternRouter<Middleware<State>>();

    const { rootHandler } = applyCommands(
      router,
      this.#commands,
      this.config.basePath,
      this.#onError,
    );

    const trustProxy = this.config.trustProxy;
    const basePath = this.config.basePath;

    const dispatch = async (
      req: Request,
      conn: Deno.ServeHandlerInfo,
      state: State,
      rewriteCount: number,
    ): Promise<Response> => {
      const url = normalizeRequestUrl(req, trustProxy);
      const method = req.method.toUpperCase() as Method;
      const matched = router.match(method, url);
      let { params, pattern, item: handler, methodMatch } = matched;

      const span = trace.getActiveSpan();
      if (span && pattern) {
        span.updateName(`${method} ${pattern}`);
        span.setAttribute("http.route", pattern);
      }

      let next: () => Promise<Response>;

      if (pattern === null || !methodMatch) {
        handler = rootHandler;
      }

      if (matched.pattern !== null && !methodMatch) {
        if (method === "OPTIONS") {
          const allowed = router.getAllowedMethods(matched.pattern);
          next = defaultOptionsHandler(allowed);
        } else {
          next = DEFAULT_NOT_ALLOWED_METHOD;
        }
      } else {
        next = DEFAULT_NOT_FOUND;
      }

      const ctx = new Context<State>(
        req,
        url,
        conn,
        matched.pattern,
        params,
        this.config,
        next,
        buildCache!,
        state,
        (pathOrUrl) => {
          if (rewriteCount >= MAX_REWRITE_COUNT) {
            throw new Error(
              `Too many internal rewrites while handling "${req.method} ${url.pathname}"`,
            );
          }

          if (req.bodyUsed) {
            throw new Error(
              "Cannot rewrite request after its body has already been consumed",
            );
          }

          const rewrittenUrl = getRewriteUrl(url, pathOrUrl, basePath);
          const rewrittenReq = req.body !== null
            ? new Request(rewrittenUrl, {
              body: req.body,
              method: req.method,
              headers: req.headers,
              duplex: "half",
            } as RequestInit)
            : new Request(rewrittenUrl, req);
          return dispatch(rewrittenReq, conn, state, rewriteCount + 1);
        },
      );

      try {
        const result = await (handler !== null ? handler(ctx) : next());
        if (!(result instanceof Response)) {
          throw new Error(
            `Expected a "Response" instance to be returned, but got: ${result}`,
          );
        }

        if (method === "HEAD") {
          return new Response(null, result);
        }

        return result;
      } catch (err) {
        ctx.error = err;
        return await DEFAULT_ERROR_HANDLER(ctx);
      }
    };

    return (
      req: Request,
      conn: Deno.ServeHandlerInfo = DEFAULT_CONN_INFO,
    ) => dispatch(req, conn, {} as State, 0);
  }

  /**
   * Spawn a server for this app.
   */
  async listen(options: ListenOptions = {}): Promise<void> {
    if (!options.onListen) {
      options.onListen = createOnListen(this.config.basePath, options);
    }

    const handler = this.handler();
    if (options.port) {
      await Deno.serve(options, handler);
      return;
    }

    await listenOnFreePort(options, handler);
  }
}
