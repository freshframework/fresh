import type { Middleware } from "./mod.ts";

/** Options for Content-Security-Policy middleware */
export interface CSPOptions {
  /** If true, sets Content-Security-Policy-Report-Only header instead of Content-Security-Policy */
  reportOnly?: boolean;

  /** If set, adds Reporting-Endpoints, report-to, and report-uri directive */
  reportTo?: string;

  /** Additional CSP directives to add or override the defaults */
  csp?: string[];

  /**
   * If true, appends `'nonce-{value}'` to script-src and style-src directives
   * without stripping any `'unsafe-inline'` the user (or the defaults) wrote.
   * Fresh automatically injects the nonce on inline `<script>` and `<style>`
   * tags during server rendering, so modern browsers will permit them via the
   * nonce. Older browsers that ignore `'nonce-...'` fall back to the user's
   * `'unsafe-inline'`, matching the strict-CSP fallback pattern recommended by
   * web.dev (and used in production by e.g. YouTube).
   */
  useNonce?: boolean;
}

/**
 * Symbol used to pass the render nonce from ctx.render() to the CSP
 * middleware without exposing it as a response header.
 */
export const NONCE_SYMBOL: unique symbol = Symbol.for("__freshNonce");

/** Directives that may contain 'unsafe-inline' for script/style sources */
const INLINE_DIRECTIVES = new Set([
  "script-src",
  "style-src",
  "script-src-elem",
  "style-src-elem",
  "style-src-attr",
  "default-src",
]);

/**
 * Middleware to set Content-Security-Policy headers
 *
 * @param options - CSP options
 *
 * @example Basic usage
 * ```ts
 * app.use(csp({
 *   reportOnly: true,
 *   reportTo: '/api/csp-reports',
 *   csp: [
 *     "script-src 'self' 'unsafe-inline' 'https://example.com'",
 *   ],
 * }));
 * ```
 *
 * @example Nonce-based CSP
 * ```ts
 * app.use(csp({ useNonce: true }));
 * ```
 */
export function csp<State>(options: CSPOptions = {}): Middleware<State> {
  const {
    reportOnly = false,
    reportTo,
    csp = [],
    useNonce = false,
  } = options;

  const defaultCsp = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline'", // unsafe-inline needed for fresh
    "style-src 'self' 'unsafe-inline'",
    "font-src 'self'",
    "img-src 'self' data:",
    "media-src 'self' data: blob:",
    "worker-src 'self' blob:",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "upgrade-insecure-requests",
  ];

  // User-provided directives override defaults with the same name
  const userDirectiveNames = new Set(
    csp.map((d) => d.split(" ")[0]),
  );
  const merged = defaultCsp.filter((d) =>
    !userDirectiveNames.has(d.split(" ")[0])
  );
  merged.push(...csp);

  if (reportTo) {
    merged.push(`report-to csp-endpoint`);
    merged.push(`report-uri ${reportTo}`); // deprecated but some browsers still use it
  }
  const headerName = reportOnly
    ? "Content-Security-Policy-Report-Only"
    : "Content-Security-Policy";

  if (!useNonce) {
    // Static CSP — no per-request nonce
    const cspString = merged.join("; ");
    return async (ctx) => {
      const res = await ctx.next();
      res.headers.set(headerName, cspString);
      if (reportTo) {
        res.headers.set("Reporting-Endpoints", `csp-endpoint="${reportTo}"`);
      }
      return res;
    };
  }

  // Nonce-based CSP — replace 'unsafe-inline' with nonce per request
  return async (ctx) => {
    const res = await ctx.next();
    // deno-lint-ignore no-explicit-any
    const nonce = (res as any)[NONCE_SYMBOL] as string | undefined;

    let directives: string[];
    if (nonce) {
      directives = merged.map((d) => {
        const spaceIdx = d.indexOf(" ");
        const name = spaceIdx === -1 ? d : d.slice(0, spaceIdx);
        if (INLINE_DIRECTIVES.has(name)) {
          // Append the nonce alongside whatever the user wrote (including any
          // `'unsafe-inline'` fallback for older browsers). Modern browsers
          // prefer the nonce and ignore `'unsafe-inline'` when both are
          // present; older browsers that don't understand the nonce fall back
          // to `'unsafe-inline'`.
          return `${d} 'nonce-${nonce}'`;
        }
        return d;
      });
    } else {
      directives = merged;
    }

    res.headers.set(headerName, directives.join("; "));
    if (reportTo) {
      res.headers.set("Reporting-Endpoints", `csp-endpoint="${reportTo}"`);
    }
    return res;
  };
}
