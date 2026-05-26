import type { Component, Options as PreactOptions, VNode } from "preact";
import { ASSET_CACHE_BUST_KEY } from "../constants.ts";

export const DATA_CURRENT = "data-current";
export const DATA_ANCESTOR = "data-ancestor";
export const DATA_FRESH_KEY = "data-frsh-key";
export const CLIENT_NAV_ATTR = "f-client-nav";
export const VIEW_TRANSITION_ATTR = "f-view-transition";

export const enum OptionsType {
  ATTR = "attr",
  VNODE = "vnode",
  HOOK = "__h",
  DIFF = "__b",
  RENDER = "__r",
  DIFFED = "diffed",
  ERROR = "__e",
}

export interface InternalVNode extends VNode {
  __c: Component | null;
  __: InternalVNode | null;
}

export interface InternalPreactOptions extends PreactOptions {
  [OptionsType.ATTR](name: string, value: unknown): string | void;
  [OptionsType.VNODE](vnode: InternalVNode): void;
  [OptionsType.HOOK](component: Component, index: number, type: number): void;
  [OptionsType.DIFF](vnode: InternalVNode): void;
  [OptionsType.RENDER](vnode: InternalVNode): void;
  [OptionsType.DIFFED](vnode: InternalVNode): void;
  [OptionsType.ERROR](
    error: unknown,
    vnode: InternalVNode,
    oldVNode: InternalVNode,
  ): void;
}

export const enum UrlMatchKind {
  None,
  Ancestor,
  Current,
}

export function matchesUrl(
  current: string,
  needle: string,
  currentSearch?: string,
): UrlMatchKind {
  const needleUrl = new URL(needle, "http://localhost");
  let href = needleUrl.pathname;
  const needleSearch = needleUrl.search;

  if (href !== "/" && href.endsWith("/")) {
    href = href.slice(0, -1);
  }

  if (current !== "/" && current.endsWith("/")) {
    current = current.slice(0, -1);
  }

  if (current === href) {
    // If the link has query params, only mark as current if they match
    if (
      needleSearch && currentSearch !== undefined &&
      needleSearch !== currentSearch
    ) {
      return UrlMatchKind.Ancestor;
    }
    return UrlMatchKind.Current;
  } else if (current.startsWith(href + "/") || href === "/") {
    return UrlMatchKind.Ancestor;
  }

  return UrlMatchKind.None;
}

/**
 * Mark active or ancestor link
 * Note: This function is used both on the server and the client
 */
export function setActiveUrl(
  vnode: VNode,
  pathname: string,
  search?: string,
): void {
  const props = vnode.props as Record<string, unknown>;
  const hrefProp = props.href;
  if (typeof hrefProp === "string" && hrefProp.startsWith("/")) {
    // Don't override aria-current if it's already set by the user
    if (props["aria-current"] !== undefined) return;

    const match = matchesUrl(pathname, hrefProp, search);
    if (match === UrlMatchKind.Current) {
      props[DATA_CURRENT] = "true";
      props["aria-current"] = "page";
    } else if (match === UrlMatchKind.Ancestor) {
      props[DATA_ANCESTOR] = "true";
      props["aria-current"] = "true";
    }
  }
}

export const enum PartialMode {
  Replace,
  Append,
  Prepend,
}

let contentHashMap: Map<string, string> | null = null;

/**
 * Register a map of pathname → content hash for content-addressed static
 * files. When set, `assetInternal` uses the content hash instead of
 * BUILD_ID for matching files, so their URLs survive deploys unchanged.
 */
export function setContentHashMap(map: Map<string, string>): void {
  contentHashMap = map;
}

/**
 * Create a "locked" asset path. This differs from a plain path in that it is
 * specific to the current version of the application, and as such can be safely
 * served with a very long cache lifetime (1 year).
 */
export function assetInternal(path: string, buildId: string): string {
  if (!path.startsWith("/") || path.startsWith("//")) return path;
  try {
    const url = new URL(path, "https://freshassetcache.local");
    if (
      url.protocol !== "https:" || url.host !== "freshassetcache.local" ||
      url.searchParams.has(ASSET_CACHE_BUST_KEY)
    ) {
      return path;
    }
    // Use content hash for content-addressed files so the URL only
    // changes when the file content changes, not on every deploy.
    const cacheKey = contentHashMap?.get(url.pathname) ?? buildId;
    url.searchParams.set(ASSET_CACHE_BUST_KEY, cacheKey);
    return url.pathname + url.search + url.hash;
  } catch (err) {
    // deno-lint-ignore no-console
    console.warn(
      `Failed to create asset() URL, falling back to regular path ('${path}'):`,
      err,
    );
    return path;
  }
}

/** Apply the `asset` function to urls in a `srcset` attribute. */
export function assetSrcSetInternal(srcset: string, buildId: string): string {
  if (srcset.includes("(")) return srcset; // Bail if the srcset contains complicated syntax.
  const parts = srcset.split(",");
  const constructed = [];
  for (const part of parts) {
    const trimmed = part.trimStart();
    const leadingWhitespace = part.length - trimmed.length;
    if (trimmed === "") return srcset; // Bail if the srcset is malformed.
    let urlEnd = trimmed.indexOf(" ");
    if (urlEnd === -1) urlEnd = trimmed.length;
    const leading = part.substring(0, leadingWhitespace);
    const url = trimmed.substring(0, urlEnd);
    const trailing = trimmed.substring(urlEnd);
    constructed.push(leading + assetInternal(url, buildId) + trailing);
  }
  return constructed.join(",");
}

export function assetHashingHook(
  vnode: VNode<{
    src?: string;
    srcset?: string;
    ["data-fresh-disable-lock"]?: boolean;
  }>,
  buildId: string,
) {
  if (vnode.type === "img" || vnode.type === "source") {
    const { props } = vnode;
    if (props["data-fresh-disable-lock"]) return;
    if (typeof props.src === "string") {
      props.src = assetInternal(props.src, buildId);
    }
    if (typeof props.srcset === "string") {
      props.srcset = assetSrcSetInternal(props.srcset, buildId);
    }
  }
}
