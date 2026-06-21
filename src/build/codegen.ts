// Source-code generators for the three virtual modules that drive the SSR
// environment:
//
//   * `fresh:routes/<id>`            — per-route handler module
//   * `fresh:internal/router`        — rou3 matcher (pre-compiled at build time)
//   * `fresh:internal/server-entrypoint` — service entry exporting `{ fetch }`
//
// `<id>` is the route's handler path relative to the `routes/` directory with
// the extension stripped (e.g. `routes/blog/[slug].tsx` → `blog/[slug]`).

import * as path from "node:path";
import { addRoute, createRouter } from "rou3";
import { compileRouterToString } from "rou3/compiler";
import type { FreshConfig, RouteEntry } from "./fs-routes.ts";

export const ROUTE_VIRTUAL_PREFIX = "fresh:routes/";
export const ROUTER_VIRTUAL_ID = "fresh:internal/router";
export const SERVER_ENTRY_VIRTUAL_ID = "fresh:internal/server-entrypoint";
export const ERROR_PAGE_VIRTUAL_ID = "fresh:internal/error-page";

/**
 * Bare specifier of the client-side hydration entry. Used as a Vite
 * client-env input (chunk name `fresh.boot`) and as the `?assets=client`
 * source from the SSR route modules. No virtual indirection: the entry
 * IS the package entrypoint.
 */
export const CLIENT_BOOT_SPECIFIER = "fresh/internal/client";

/** Project-relative-handler-path → router-stable id (no extension, no `routes/`). */
export function routeId(handlerRelPath: string): string {
  const norm = handlerRelPath.split(path.sep).join("/").replace(/^\/+/, "");
  return norm.replace(/^routes\//, "").replace(/\.(tsx|ts|jsx|js)$/, "");
}

export interface GenerateRouteOptions {
  /** Project-relative path to `routes/_app.{ts,tsx,…}` (or null). */
  app?: string | null;
  /** Project-relative path to `entry.client.{ts,tsx,…}` (or null). */
  clientEntry?: string | null;
  /**
   * Project-relative path to `entry.server.{ts,tsx,…}` (or null). When set, its
   * exported `app`'s middlewares are prepended to this route's chain.
   */
  serverEntry?: string | null;
  /** True in dev (Vite serve); flips on `/@vite/client` injection. */
  dev?: boolean;
}

/**
 * Generate the per-route module source.
 *
 * Imports:
 *  - the handler module (wildcard) for `validateHandler` / `validatePage`,
 *  - `?assets=ssr` for the handler, each layout, and `_app` so the renderer
 *    can inject their CSS,
 *  - `?assets=client` for `entry.client.*` (if present) for client `<script>`
 *    + `<link rel="modulepreload">` tags,
 *  - wildcard imports for each middleware so `validateMiddleware` can run.
 *
 * Default export is `freshHandler(handler, page, [mws], [layouts], renderConfig)`.
 * The server entrypoint dynamic-imports this module and calls `.default(event)`.
 */
export function generateRouteModule(
  route: RouteEntry,
  root: string,
  opts: GenerateRouteOptions = {},
): string {
  const abs = (p: string) => path.resolve(root, p).split(path.sep).join("/");
  const dev = opts.dev ?? true;

  // `getMiddleware` is only needed when an `entry.server.ts` app contributes
  // middlewares — pull it in conditionally so a route without one has no unused
  // import.
  const serverHelpers = [
    "freshHandler",
    "validateHandler",
    "validateLayout",
    "validateMiddleware",
    "validatePage",
    ...(opts.serverEntry ? ["getMiddleware"] : []),
  ].join(", ");

  const lines: string[] = [
    `import { ${serverHelpers} } from "fresh/internal/server";`,
    `import * as __handler from ${JSON.stringify(abs(route.handler))};`,
    `import __handler_ssrAssets from ${JSON.stringify(abs(route.handler) + "?assets=ssr")};`,
  ];

  const ssrAssetVars: string[] = ["__handler_ssrAssets"];
  for (let i = 0; i < route.layouts.length; i++) {
    const layPath = abs(route.layouts[i]);
    lines.push(
      `import * as __lay${i} from ${JSON.stringify(layPath)};`,
      `import __lay${i}_ssrAssets from ${JSON.stringify(layPath + "?assets=ssr")};`,
    );
    ssrAssetVars.push(`__lay${i}_ssrAssets`);
  }

  if (opts.app) {
    const appPath = abs(opts.app);
    // Wildcard import pulls `_app` into the SSR bundle so the `?assets=ssr`
    // lookup can resolve to a built chunk (otherwise `writeAssetsManifest`
    // bails with "failed to find built chunk for _app.tsx").
    lines.push(
      `import * as __app from ${JSON.stringify(appPath)};`,
      `import __app_ssrAssets from ${JSON.stringify(appPath + "?assets=ssr")};`,
    );
    ssrAssetVars.push("__app_ssrAssets");
  }

  for (let i = 0; i < route.middlewares.length; i++) {
    lines.push(`import * as __mw${i} from ${JSON.stringify(abs(route.middlewares[i]))};`);
  }

  // Programmatic `entry.server.ts` → its `app`'s middlewares run ahead of the
  // file-based chain, like a rootmost `_middleware`. Named `__entryApp` to
  // avoid colliding with the `__app` (`routes/_app.tsx` shell) import above.
  if (opts.serverEntry) {
    lines.push(`import { app as __entryApp } from ${JSON.stringify(abs(opts.serverEntry))};`);
  }

  let clientAssetsExpr = "null";
  if (opts.clientEntry) {
    const cePath = abs(opts.clientEntry);
    lines.push(`import __clientAssets from ${JSON.stringify(cePath + "?assets=client")};`);
    clientAssetsExpr = "__clientAssets";
  }

  // Boot bundle (islands hydration) — always present so islands work
  // without the user needing a `entry.client.*` of their own.
  lines.push(
    `import __bootAssets from ${JSON.stringify(CLIENT_BOOT_SPECIFIER + "?assets=client")};`,
  );

  // Islands map (specifier → `?assets=client` loader). Consumed on the SSR
  // side: the renderer resolves each rendered island's client `entry` URL
  // through this map and embeds it in the page state.
  lines.push(`import __islandsMap from ${JSON.stringify(ISLANDS_VIRTUAL_ID)};`);

  const fileMws = route.middlewares.map((_, i) => `validateMiddleware(__mw${i})`);
  // App middlewares lead the chain (spread first), then the file-based ones.
  // `getMiddleware` reads the app's private list (it isn't a public property).
  const appMws = "...getMiddleware(__entryApp)";
  const mwList = (opts.serverEntry ? [appMws, ...fileMws] : fileMws).join(", ");
  const layList = route.layouts.map((_, i) => `validateLayout(__lay${i})`).join(", ");
  const appExpr = opts.app ? "__app.default" : "null";

  lines.push(
    ``,
    `const __renderConfig = {`,
    `  dev: ${JSON.stringify(dev)},`,
    `  ssrAssets: [${ssrAssetVars.join(", ")}],`,
    `  clientAssets: ${clientAssetsExpr},`,
    `  clientBootAssets: __bootAssets,`,
    `  islands: __islandsMap,`,
    `  app: ${appExpr},`,
    `};`,
    ``,
    `export default freshHandler(validateHandler(__handler), validatePage(__handler), [${mwList}], [${layList}], __renderConfig);`,
  );

  return lines.join("\n");
}

/**
 * Generate the `fresh:internal/router` source.
 *
 * The router is built in the plugin (at build/dev time) and serialized via
 * `compileRouterToString` — the emitted module ships a plain `match(method,
 * path)` function with no runtime construction cost. Each route's data
 * serializes to an inline dynamic-import thunk for the matching
 * `fresh:routes/<id>` virtual.
 */
export function generateRouterModule(cfg: FreshConfig): string {
  const router = createRouter<string>();
  // Register most-specific routes first. rou3 resolves genuine specificity on
  // its own, but a named catch-all (`:slug*`) also matches its own parent path
  // via a zero-length segment — `/docs/:slug*` matches `/docs` as well as
  // `/docs/x`. For that overlap rou3 treats the two routes as equally specific
  // and keeps whichever was registered first. The route map is in
  // directory-walk order, where `[...slug].tsx` (ASCII `[`) sorts ahead of
  // `index.tsx`, so without this sort the catch-all would shadow the index
  // route and `/docs` would 404. Ordering specific-first is otherwise a no-op:
  // for non-overlapping routes rou3 picks the right one regardless of order.
  const entries = [...cfg.routes].sort(([a], [b]) => compareRouteSpecificity(a, b));
  for (const [pattern, route] of entries) {
    addRoute(router, undefined, toRou3Pattern(pattern), routeId(route.handler));
  }
  const compiled = compileRouterToString(router, "match", {
    serialize: (id) => `(() => import(${JSON.stringify(ROUTE_VIRTUAL_PREFIX + id)}))`,
  });
  return `${compiled}\nexport { match };\n`;
}

/**
 * Convert a Hono-style URL pattern (`/blog/:slug`, `/files/*`,
 * `/files/:path*`) to a rou3 pattern. The only divergence is the
 * trailing anonymous `*` (Hono): rou3 spells the same thing `**` and
 * surfaces it under `params._`. Named catch-alls (`/files/:path*`,
 * produced by `[...path]`) are already rou3-native — they pass through
 * unchanged and surface under `params.path`.
 */
export function toRou3Pattern(pattern: string): string {
  return pattern.replace(/\/\*$/, "/**");
}

/**
 * Specificity rank of a single route-pattern segment — lower is more specific:
 * a static literal (`docs`) beats a dynamic param (`:slug`), which beats a
 * catch-all (`:slug*`, anonymous `*`/`**`, or rou3's `_`).
 */
function segmentRank(seg: string): number {
  if (seg === "*" || seg === "**" || seg === "_" || /^:.+\*$/.test(seg)) return 2;
  if (seg.startsWith(":")) return 1;
  return 0;
}

/**
 * Order route patterns most-specific-first for registration. Compares
 * segment-by-segment; an absent segment ranks below any present one, so a
 * shorter static route (`/docs`) precedes a sibling catch-all that can also
 * match it via a zero-length segment (`/docs/:slug*`). Used to make rou3's
 * first-registered-wins tie-breaking deterministic. See
 * {@link generateRouterModule}.
 */
export function compareRouteSpecificity(a: string, b: string): number {
  const sa = a.split("/").filter((s) => s !== "");
  const sb = b.split("/").filter((s) => s !== "");
  const len = Math.max(sa.length, sb.length);
  for (let i = 0; i < len; i++) {
    const ra = i < sa.length ? segmentRank(sa[i]) : -1;
    const rb = i < sb.length ? segmentRank(sb[i]) : -1;
    if (ra !== rb) return ra - rb;
  }
  return 0;
}

/**
 * Generate the service entry. Exports `default { fetch(req) }` so Nitro's
 * `fetchViteEnv("ssr", req)` path can invoke it.
 *
 * The fetch handler matches against `fresh:internal/router`, calls the
 * matched thunk to dynamic-import the route module, and hands it an
 * event-shaped `{ req, method, context }` (the shape `freshHandler` consumes).
 */
/** Mirrors `ISLANDS_VIRTUAL_ID` in `vite-plugin.ts`. Kept here so codegen has no plugin-side imports. */
const ISLANDS_VIRTUAL_ID = "fresh:internal/islands";

/**
 * Generate the `fresh:internal/error-page` source.
 *
 * When the project has `routes/_error.tsx`, the virtual mirrors a regular
 * route module — handler + page from the user, plus `?assets=ssr` for CSS,
 * the client/boot/islands wiring needed for `_app` + island hydration, and
 * an auto-handler that defaults the response status to `error.status ?? 500`.
 *
 * When the project has no `_error.tsx`, the virtual default-exports a tiny
 * fallback that responds with the error's status + message — enough to keep
 * the server-entrypoint working without a user-authored page.
 */
export function generateErrorPageModule(
  cfg: FreshConfig,
  root: string,
  opts: GenerateRouteOptions = {},
): string {
  if (!cfg.error) {
    return [
      `export default function (event) {`,
      `  const status = (event.error && event.error.status) || 500;`,
      `  const message = (event.error && event.error.message) || "Internal Server Error";`,
      `  return new Response(message, { status });`,
      `};`,
      ``,
    ].join("\n");
  }

  const abs = (p: string) => path.resolve(root, p).split(path.sep).join("/");
  const dev = opts.dev ?? true;
  const errAbs = abs(cfg.error);

  const lines: string[] = [
    `import { freshHandler, validateHandler, validatePage } from "fresh/internal/server";`,
    `import * as __error from ${JSON.stringify(errAbs)};`,
    `import __error_ssrAssets from ${JSON.stringify(errAbs + "?assets=ssr")};`,
  ];

  const ssrAssetVars: string[] = ["__error_ssrAssets"];

  if (opts.app) {
    const appPath = abs(opts.app);
    lines.push(
      `import * as __app from ${JSON.stringify(appPath)};`,
      `import __app_ssrAssets from ${JSON.stringify(appPath + "?assets=ssr")};`,
    );
    ssrAssetVars.push("__app_ssrAssets");
  }

  let clientAssetsExpr = "null";
  if (opts.clientEntry) {
    const cePath = abs(opts.clientEntry);
    lines.push(`import __clientAssets from ${JSON.stringify(cePath + "?assets=client")};`);
    clientAssetsExpr = "__clientAssets";
  }

  lines.push(
    `import __bootAssets from ${JSON.stringify(CLIENT_BOOT_SPECIFIER + "?assets=client")};`,
    `import __islandsMap from ${JSON.stringify(ISLANDS_VIRTUAL_ID)};`,
  );

  const appExpr = opts.app ? "__app.default" : "null";

  lines.push(
    ``,
    `const __renderConfig = {`,
    `  dev: ${JSON.stringify(dev)},`,
    `  ssrAssets: [${ssrAssetVars.join(", ")}],`,
    `  clientAssets: ${clientAssetsExpr},`,
    `  clientBootAssets: __bootAssets,`,
    `  islands: __islandsMap,`,
    `  app: ${appExpr},`,
    `};`,
    ``,
    // If the user didn't `export const handlers`, supply one that propagates
    // the error's HTTP status onto the response.
    `const __autoHandler = { GET: (ctx) => ({ data: undefined, status: (ctx.error && ctx.error.status) || 500 }) };`,
    `const __userHandler = validateHandler(__error);`,
    ``,
    `export default freshHandler(__userHandler ?? __autoHandler, validatePage(__error), [], [], __renderConfig);`,
  );

  return lines.join("\n");
}

export function generateServerEntrypoint(): string {
  return [
    `import { match } from ${JSON.stringify(ROUTER_VIRTUAL_ID)};`,
    `import errorPage from ${JSON.stringify(ERROR_PAGE_VIRTUAL_ID)};`,
    `import { NotFoundError } from "fresh/errors";`,
    ``,
    `export default {`,
    `  async fetch(req) {`,
    `    const url = new URL(req.url);`,
    `    let event;`,
    `    try {`,
    `      const matched = match(req.method, url.pathname);`,
    `      if (!matched) {`,
    `        event = { req, method: req.method, context: { params: {} } };`,
    `        throw new NotFoundError();`,
    `      }`,
    `      event = {`,
    `        req,`,
    `        method: req.method,`,
    `        context: { params: matched.params ?? {} },`,
    `      };`,
    `      const mod = await matched.data();`,
    `      return await mod.default(event);`,
    `    } catch (error) {`,
    `      try {`,
    `        // Force GET so the error page's auto/user handler always matches`,
    `        // — without this, a 405 on POST would re-trigger inside the error`,
    `        // page and bottom-out to the last-ditch fallback.`,
    `        return await errorPage({ ...event, method: "GET", error });`,
    `      } catch (_innerError) {`,
    `        // Last-ditch fallback if the error page itself throws.`,
    `        const status = error?.status ?? 500;`,
    `        return new Response(error?.message ?? "Internal Server Error", { status });`,
    `      }`,
    `    }`,
    `  },`,
    `};`,
    ``,
  ].join("\n");
}
