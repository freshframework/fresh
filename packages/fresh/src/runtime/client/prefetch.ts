import { PARTIAL_SEARCH_PARAM } from "../../constants.ts";
import { CLIENT_NAV_ATTR } from "../shared_internal.ts";
import { PARTIAL_ATTR } from "./partials.ts";

export const PREFETCH_ATTR = "f-prefetch";

type PrefetchStrategy = "hover" | "viewport" | "load" | "none";

interface CacheEntry {
  response: Response;
  timestamp: number;
}

const CACHE_TTL = 30_000; // 30 seconds
const prefetchCache = new Map<string, CacheEntry>();
const inflightRequests = new Map<string, Promise<Response>>();
const prefetchedUrls = new Set<string>();

// Track elements observed by IntersectionObserver to avoid re-observing
const observedElements = new WeakSet<Element>();

/**
 * Get the effective prefetch strategy for a link element.
 * Checks the element itself, then walks up to find a container default.
 */
function getStrategy(el: HTMLAnchorElement): PrefetchStrategy {
  // Check the element itself first
  if (el.hasAttribute(PREFETCH_ATTR)) {
    const val = el.getAttribute(PREFETCH_ATTR);
    if (val === "none" || val === "viewport" || val === "load") return val;
    // f-prefetch or f-prefetch="hover" or f-prefetch=""
    return "hover";
  }

  // Walk up to find a container-level default
  const container = el.closest(`[${PREFETCH_ATTR}]`);
  if (container && container !== el) {
    const val = container.getAttribute(PREFETCH_ATTR);
    if (val === "none") return "none";
    if (val === "viewport") return "viewport";
    if (val === "load") return "load";
    return "hover";
  }

  return "none";
}

/**
 * Check if data saving is preferred by the user.
 */
function shouldSaveData(): boolean {
  // deno-lint-ignore no-explicit-any
  const conn = (navigator as any).connection;
  if (conn) {
    if (conn.saveData) return true;
    // Also respect slow connections
    if (conn.effectiveType === "slow-2g" || conn.effectiveType === "2g") {
      return true;
    }
  }
  return false;
}

/**
 * Get the partial URL for a link, respecting f-partial attribute.
 */
function getPartialUrl(el: HTMLAnchorElement): string {
  const partial = el.getAttribute(PARTIAL_ATTR);
  const url = new URL(partial ? partial : el.href, location.href);
  url.searchParams.set(PARTIAL_SEARCH_PARAM, "true");
  return url.href;
}

/**
 * Check if a link is eligible for prefetching.
 */
function isEligible(el: HTMLAnchorElement): boolean {
  return (
    !!el.href &&
    (!el.target || el.target === "_self") &&
    el.origin === location.origin &&
    !el.getAttribute("href")?.startsWith("#")
  );
}

/**
 * Prefetch a URL and store in cache.
 */
function prefetch(el: HTMLAnchorElement): void {
  if (shouldSaveData()) return;

  const url = getPartialUrl(el);
  if (prefetchedUrls.has(url)) return;
  if (prefetchCache.has(url)) {
    const entry = prefetchCache.get(url)!;
    if (Date.now() - entry.timestamp < CACHE_TTL) return;
  }

  prefetchedUrls.add(url);

  // Deduplicate in-flight requests
  if (inflightRequests.has(url)) return;

  const promise = fetch(url, {
    priority: "low",
    // deno-lint-ignore no-explicit-any
  } as any).then((res) => {
    if (res.ok) {
      prefetchCache.set(url, {
        response: res,
        timestamp: Date.now(),
      });
    }
    inflightRequests.delete(url);
    return res;
  }).catch(() => {
    inflightRequests.delete(url);
    prefetchedUrls.delete(url);
    return new Response(null, { status: 0 });
  });

  inflightRequests.set(url, promise);
}

/**
 * Get a cached response for the given partial URL, if available and fresh.
 */
export function getCachedResponse(partialUrl: URL): Response | null {
  const url = partialUrl.href;
  const entry = prefetchCache.get(url);
  if (!entry) return null;

  if (Date.now() - entry.timestamp > CACHE_TTL) {
    prefetchCache.delete(url);
    prefetchedUrls.delete(url);
    return null;
  }

  // Remove from cache after use (single use)
  prefetchCache.delete(url);
  prefetchedUrls.delete(url);
  return entry.response;
}

// IntersectionObserver for viewport strategy
let viewportObserver: IntersectionObserver | null = null;

function getViewportObserver(): IntersectionObserver {
  if (!viewportObserver) {
    viewportObserver = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            const el = entry.target as HTMLAnchorElement;
            prefetch(el);
            viewportObserver!.unobserve(el);
          }
        }
      },
      { rootMargin: "200px" },
    );
  }
  return viewportObserver;
}

/**
 * Set up prefetching for a single link element.
 */
function setupLink(el: HTMLAnchorElement): void {
  if (!isEligible(el)) return;

  // Check if client nav is enabled for this element
  const setting = el.closest(`[${CLIENT_NAV_ATTR}]`);
  if (setting === null || setting.getAttribute(CLIENT_NAV_ATTR) === "false") {
    return;
  }

  const strategy = getStrategy(el);

  switch (strategy) {
    case "hover":
      el.addEventListener("pointerenter", () => prefetch(el), { once: true });
      // Also prefetch on focus for keyboard navigation
      el.addEventListener("focus", () => prefetch(el), { once: true });
      break;
    case "viewport":
      if (!observedElements.has(el)) {
        observedElements.add(el);
        getViewportObserver().observe(el);
      }
      break;
    case "load":
      prefetch(el);
      break;
    case "none":
      break;
  }
}

/**
 * Scan the document for links and set up prefetching.
 */
function scanLinks(): void {
  const links = document.querySelectorAll<HTMLAnchorElement>("a[href]");
  for (const link of links) {
    setupLink(link);
  }
}

// Initial scan after DOM is ready
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", scanLinks);
} else {
  // Use microtask to avoid blocking
  queueMicrotask(scanLinks);
}

// Observe DOM changes to pick up dynamically added links
const mutationObserver = new MutationObserver((mutations) => {
  for (const mutation of mutations) {
    const nodes = mutation.addedNodes;
    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i];
      if (node instanceof HTMLAnchorElement) {
        setupLink(node);
      } else if (node instanceof HTMLElement) {
        const links = node.querySelectorAll<HTMLAnchorElement>("a[href]");
        for (const link of links) {
          setupLink(link);
        }
      }
    }
  }
});

mutationObserver.observe(document.body, {
  childList: true,
  subtree: true,
});
