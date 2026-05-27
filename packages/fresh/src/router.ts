export type Method =
  | "HEAD"
  | "GET"
  | "POST"
  | "PATCH"
  | "PUT"
  | "DELETE"
  | "OPTIONS";

export type RouteByMethod<T> = {
  [m in Method]: T | null;
};

export interface StaticRouteDef<T> {
  pattern: string | URLPattern;
  byMethod: RouteByMethod<T>;
}

export interface DynamicRouteDef<T> {
  pattern: URLPattern;
  byMethod: RouteByMethod<T>;
}

function newByMethod<T>(): RouteByMethod<T> {
  return {
    GET: null,
    POST: null,
    PATCH: null,
    DELETE: null,
    PUT: null,
    HEAD: null,
    OPTIONS: null,
  };
}

export interface RouteResult<T> {
  params: Record<string, string>;
  item: T | null;
  methodMatch: boolean;
  pattern: string | null;
}

export interface Router<T> {
  add(
    method: Method,
    pathname: string,
    item: T,
  ): void;
  match(method: Method, url: URL): RouteResult<T>;
  getAllowedMethods(pattern: string): string[];
}

export const IS_PATTERN = /[*:{}+?()]/;

const EMPTY: string[] = [];

export class UrlPatternRouter<T> implements Router<T> {
  #statics = new Map<string, StaticRouteDef<T>>();
  #dynamics = new Map<string, DynamicRouteDef<T>>();
  #dynamicArr: DynamicRouteDef<T>[] = [];
  #allowed = new Map<string, Set<string>>();

  getAllowedMethods(pattern: string): string[] {
    const allowed = this.#allowed.get(pattern);
    if (allowed === undefined) return EMPTY;
    return Array.from(allowed);
  }

  add(
    method: Method,
    pathname: string,
    item: T,
  ) {
    let allowed = this.#allowed.get(pathname);
    if (allowed === undefined) {
      allowed = new Set();
      this.#allowed.set(pathname, allowed);
    }

    allowed.add(method);

    let byMethod: RouteByMethod<T>;
    if (IS_PATTERN.test(pathname)) {
      let def = this.#dynamics.get(pathname);
      if (def === undefined) {
        def = {
          pattern: new URLPattern({ pathname }),
          byMethod: newByMethod(),
        };
        this.#dynamics.set(pathname, def);
        this.#dynamicArr.push(def);
      }

      byMethod = def.byMethod;
    } else {
      let def = this.#statics.get(pathname);
      if (def === undefined) {
        def = {
          pattern: pathname,
          byMethod: newByMethod(),
        };
        this.#statics.set(pathname, def);
      }

      byMethod = def.byMethod;
    }

    if (byMethod[method] === null) {
      byMethod[method] = item;
    }
  }

  match(method: Method, url: URL): RouteResult<T> {
    const result: RouteResult<T> = {
      params: Object.create(null),
      item: null,
      methodMatch: false,
      pattern: null,
    };

    let pathname = url.pathname;
    let staticMatch = this.#statics.get(pathname);

    // Try alternate trailing slash form if no exact match found.
    // Routes may be registered with or without trailing slashes,
    // and requests may arrive in either form (e.g. when using
    // trailingSlashes("always")).
    if (staticMatch === undefined && pathname !== "/") {
      const alt = pathname.endsWith("/")
        ? pathname.slice(0, -1)
        : pathname + "/";
      const altMatch = this.#statics.get(alt);
      if (altMatch !== undefined) {
        staticMatch = altMatch;
        pathname = alt;
      }
    }

    if (staticMatch !== undefined) {
      result.pattern = pathname;

      // `byMethod[method]` is `undefined` for non-standard HTTP verbs
      // (e.g. PROPFIND from WebDAV scanners). Normalize to `null` so the
      // not-allowed-method path is taken instead of returning a bogus
      // `methodMatch: true` with `item: undefined`.
      let item: T | null = staticMatch.byMethod[method] ?? null;
      if (method === "HEAD" && item === null) {
        item = staticMatch.byMethod.GET;
      }
      if (item !== null) {
        result.methodMatch = true;
        result.item = item;
      }

      return result;
    }

    for (let i = 0; i < this.#dynamicArr.length; i++) {
      const route = this.#dynamicArr[i];

      const match = route.pattern.exec(url);
      if (match === null) continue;

      result.pattern = route.pattern.pathname;

      let item: T | null = route.byMethod[method] ?? null;
      if (method === "HEAD" && item === null) {
        item = route.byMethod.GET;
      }

      if (item !== null) {
        result.methodMatch = true;
        result.item = item;

        // Decode matched params
        for (const [key, value] of Object.entries(match.pathname.groups)) {
          result.params[key] = value === undefined ? "" : decodeURI(value);
        }
      }

      break;
    }

    return result;
  }
}

/**
 * Transform a filesystem URL path to a `path-to-regex` style matcher.
 */
export function pathToPattern(
  path: string,
  options?: { keepGroups: boolean },
): string {
  const parts = path.split("/");
  if (parts[parts.length - 1] === "index") {
    if (parts.length === 1) {
      return "/";
    }
    parts.pop();
  }

  let route = "";

  let nonOptionalSegments = 0;
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];

    // Case: /[...foo].tsx
    if (part.startsWith("[...") && part.endsWith("]")) {
      route += `/:${part.slice(4, part.length - 1)}*`;
      continue;
    }

    // Route groups like /foo/(bar) should not be included in URL
    // matching. They are transparent and need to be removed here.
    // Case: /foo/(bar) -> /foo
    // Case: /foo/(bar)/bob -> /foo/bob
    // Case: /(foo)/bar -> /bar
    if (!options?.keepGroups && part.startsWith("(") && part.endsWith(")")) {
      continue;
    }

    // Disallow neighbouring params like `/[id][bar].tsx` because
    // it's ambiguous where the `id` param ends and `bar` begins.
    if (part.includes("][")) {
      throw new SyntaxError(
        `Invalid route pattern: "${path}". A parameter cannot be followed by another parameter without any characters in between.`,
      );
    }

    // Case: /[[id]].tsx
    // Case: /[id].tsx
    // Case: /[id]@[bar].tsx
    // Case: /[id]-asdf.tsx
    // Case: /[id]-asdf[bar].tsx
    // Case: /asdf[bar].tsx
    let pattern = "";
    let groupOpen = 0;
    let optional = false;
    for (let j = 0; j < part.length; j++) {
      const char = part[j];
      if (char === "[") {
        if (part[j + 1] === "[") {
          // Disallow optional dynamic params like `foo-[[bar]]`
          if (part[j - 1] !== "/" && !!part[j - 1]) {
            throw new SyntaxError(
              `Invalid route pattern: "${path}". An optional parameter needs to be a full segment.`,
            );
          }
          groupOpen++;
          optional = true;
          pattern += "{/";
          j++;
        }
        pattern += ":";
        groupOpen++;
      } else if (char === "]") {
        if (part[j + 1] === "]") {
          // Disallow optional dynamic params like `[[foo]]-bar`
          if (part[j + 2] !== "/" && !!part[j + 2]) {
            throw new SyntaxError(
              `Invalid route pattern: "${path}". An optional parameter needs to be a full segment.`,
            );
          }
          groupOpen--;
          pattern += "}?";
          j++;
        }
        if (--groupOpen < 0) {
          throw new SyntaxError(`Invalid route pattern: "${path}"`);
        }
      } else {
        pattern += char;
      }
    }

    if (optional) {
      route += pattern;
    } else {
      nonOptionalSegments++;
      route += "/" + pattern;
    }
  }

  // Case: /(group)/index.tsx
  if (route === "") {
    route = "/";
  }

  // Handles all cases where a route starts with
  // an optional parameter and does not contain
  // any non-group and non-optional segments after
  // Case: /[[id]].tsx
  // Case: /(group)/[[id]].tsx
  // Case: /(group)/[[name]]/(group2)/index.tsx
  if (route.startsWith(`{/`) && nonOptionalSegments === 0) {
    route = route.replace("{/", "/{");
  }

  return route;
}

export function patternToSegments(
  path: string,
  root: string,
  includeLast: boolean = false,
): string[] {
  const out: string[] = [root];

  if (path === "/" || path === "*" || path === "/*") return out;

  // Strip optional groups like {/:param}? before segmenting, so that
  // /api{/:opt}?/endpoint produces the same segments as /api/endpoint.
  // This ensures middleware registered at /api applies to routes with
  // optional parameters under /api.
  const cleaned = path.replace(/\{[^}]*\}\??/g, "");

  let start = -1;
  for (let i = 0; i < cleaned.length; i++) {
    const ch = cleaned[i];

    if (ch === "/") {
      if (i > 0) {
        const raw = cleaned.slice(start + 1, i);
        out.push(raw);
      }
      start = i;
    }
  }

  if (includeLast && start < cleaned.length - 1) {
    out.push(cleaned.slice(start + 1));
  }

  return out;
}

export function mergePath(
  basePath: string,
  path: string,
  isMounting: boolean,
): string {
  if (basePath.endsWith("*")) basePath = basePath.slice(0, -1);
  if (basePath === "/") basePath = "";

  if (path === "*") path = isMounting ? "" : "/*";
  else if (path === "/*") path = "/*";

  const s = (basePath !== "" && path === "/") ? "" : path;
  return basePath + s;
}

export function toRoutePath(path: string): string {
  if (path === "") return "*";
  return path;
}
