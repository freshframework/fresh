// Context object construction used by the runtime.
//
// `MiddlewareContext` carries `next`; `HandlerContext` does not. State flows
// through the middleware chain by passing the **entire** new state to
// `next(state)` — there is no merging; the caller is responsible for
// spreading prior state if they want to keep it.
//
// Both contexts also carry:
//   * `url`     — `req.url` parsed once per request.
//   * `redirect(pathOrUrl, status = 302)` — a small `Response`-builder that
//     normalises protocol-relative paths so a trusted path input can't be
//     turned into a cross-origin redirect.
//   * `isPartial` — `true` for a client-driven partial navigation request.

import { PARTIAL_HEADER } from "../runtime/partial.ts";
import type { RuntimeContext } from "./types.ts";

/**
 * The srvx augmentation every Nitro target rides on. The `Request` that
 * reaches Fresh's service entry carries `runtime` (per-target context) and an
 * optional `waitUntil`; we read them here rather than threading them through
 * the generated server entrypoint.
 */
type ServerRequest = Request & {
  runtime?: RuntimeContext;
  waitUntil?: (promise: Promise<unknown>) => void;
};

export interface MwCtx {
  req: Request | undefined;
  url: URL | undefined;
  params: Record<string, string>;
  state: unknown;
  /** Populated when this middleware was reached via the `_error` chain. */
  error: unknown;
  /**
   * `true` when the request is a client-driven partial navigation (carries
   * the `Fresh-Partial` header with same-origin-fetch `Sec-Fetch-*` metadata).
   * Handlers can branch on this to render lighter responses; the framework
   * renders only the `<Partial>` regions for these requests.
   */
  isPartial: boolean;
  /** Deployment-target-specific request context, read off the srvx request. */
  runtime: RuntimeContext | undefined;
  /** Keep the invocation alive past the response (host `waitUntil`, or untracked). */
  waitUntil: (promise: Promise<unknown>) => void;
  next: (...args: [state?: unknown]) => Promise<Response>;
  redirect: typeof redirect;
}

export interface HandlerCtx {
  req: Request | undefined;
  url: URL | undefined;
  params: Record<string, string>;
  state: unknown;
  /** Populated when this handler was reached via the `_error` chain. */
  error: unknown;
  /** `true` for a client-driven partial navigation request. See `MwCtx`. */
  isPartial: boolean;
  /** Deployment-target-specific request context, read off the srvx request. */
  runtime: RuntimeContext | undefined;
  /** Keep the invocation alive past the response (host `waitUntil`, or untracked). */
  waitUntil: (promise: Promise<unknown>) => void;
  redirect: typeof redirect;
}

/** Pull srvx's per-target context off the request, if the host set one. */
function runtimeOf(req: Request | undefined): RuntimeContext | undefined {
  return (req as ServerRequest | undefined)?.runtime;
}

/**
 * A `waitUntil` bound to the host's, when present. On hosts that don't provide
 * one (e.g. Node dev) the returned function is a no-op — the caller's promise
 * still runs, it just doesn't extend the request's lifetime.
 */
function waitUntilOf(req: Request | undefined): (promise: Promise<unknown>) => void {
  const sreq = req as ServerRequest | undefined;
  const hostWaitUntil = sreq?.waitUntil;
  if (hostWaitUntil) return (promise) => hostWaitUntil.call(sreq, promise);
  return () => {};
}

export interface ContextInit {
  params?: Record<string, string>;
  state?: unknown;
  error?: unknown;
}

/**
 * Whether a request is a legitimate client-driven partial navigation: it
 * carries the `Fresh-Partial` header AND its `Sec-Fetch-*` metadata is
 * consistent with a same-origin `fetch()` (not a top-level navigation, an
 * embed, or a cross-site request). The `Sec-Fetch-*` checks only reject when
 * a header is present and wrong — absent headers (older clients / some
 * non-secure contexts) fall back to trusting `Fresh-Partial`. A request that
 * looks partial-but-not-a-fetch is treated as a normal request, so the full
 * page is rendered rather than leaking a bare fragment.
 */
function requestIsPartial(req: Request | undefined): boolean {
  if (req === undefined) return false;
  if (!req.headers.has(PARTIAL_HEADER)) return false;
  const dest = req.headers.get("sec-fetch-dest");
  if (dest !== null && dest !== "empty") return false;
  const site = req.headers.get("sec-fetch-site");
  if (site !== null && site !== "same-origin") return false;
  const mode = req.headers.get("sec-fetch-mode");
  if (mode !== null && mode !== "same-origin" && mode !== "cors") return false;
  return true;
}

export function createMiddlewareContext(
  req: Request | undefined,
  next: MwCtx["next"],
  init: ContextInit = {},
): MwCtx {
  const url = req ? new URL(req.url) : undefined;
  return {
    req,
    url,
    params: init.params ?? {},
    state: init.state ?? {},
    error: init.error,
    isPartial: requestIsPartial(req),
    runtime: runtimeOf(req),
    waitUntil: waitUntilOf(req),
    next,
    redirect,
  };
}

export function createHandlerContext(
  req: Request | undefined,
  mwCtx: { params: Record<string, string>; state: unknown; error: unknown },
): HandlerCtx {
  const url = req ? new URL(req.url) : undefined;
  return {
    req,
    url,
    params: mwCtx.params,
    state: mwCtx.state,
    error: mwCtx.error,
    isPartial: requestIsPartial(req),
    runtime: runtimeOf(req),
    waitUntil: waitUntilOf(req),
    redirect,
  };
}

/**
 * Build a redirect `Response`. `pathOrUrl` is honored verbatim except that a
 * leading run of `/`s is collapsed to a single `/`, blocking the
 * protocol-relative redirect vector (`Location: //evil.com/x` → cross-origin).
 *
 * Default status is `302` (Found, GET on follow). Pass `307` to preserve the
 * method, `301`/`308` for permanent redirects.
 */
export function redirect(pathOrUrl: string, status = 302): Response {
  let location = pathOrUrl;

  // Disallow protocol-relative URLs.
  if (pathOrUrl !== "/" && pathOrUrl.startsWith("/")) {
    let idx = pathOrUrl.indexOf("?");
    if (idx === -1) idx = pathOrUrl.indexOf("#");
    const pathname = idx > -1 ? pathOrUrl.slice(0, idx) : pathOrUrl;
    const search = idx > -1 ? pathOrUrl.slice(idx) : "";
    // Collapse `///foo` → `/foo` (and anywhere else, conservatively).
    location = `${pathname.replaceAll(/\/+/g, "/")}${search}`;
  }

  return new Response(null, { status, headers: { location } });
}
