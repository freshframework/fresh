// Shared `<head>` dedupe logic: which singleton slot a head element occupies,
// last-write-wins. Used by BOTH the client `<Head>` runtime (`client/head.ts`,
// when a re-rendered island mirrors a head element into `document.head`) and
// partial navigation (`client/partials.ts`, applying a fragment's `<Head>`
// delta). Both look the matching element up in `document.head` via the same
// CSS selector, so they agree on what replaces what.

/** Attribute the `<Head>` client runtime stamps to dedupe by an explicit `key`. */
export const HEAD_KEY_ATTR = "data-fresh-head-key";

/** Escape a value for safe use inside a `"…"` attribute selector. */
function cssAttr(v: string): string {
  return v.replace(/["\\]/g, "\\$&");
}

/**
 * CSS selector for the element already in `document.head` that a given head
 * entry replaces, or `null` when the entry has no singleton slot (it's additive
 * — always created/appended). `<title>` is handled by callers (it's always the
 * document's single title, set via `document.title`).
 *
 * Priority — explicit `key` > `id` > `<meta name>` > `<meta property>` >
 * singleton `<link rel>` (`canonical` / `manifest`) > `<base>` — mirroring the
 * server's `computeHeadCacheKey`.
 *
 * `get(attr)` returns the entry's attribute value, or `null`/`undefined` when
 * absent; `key` is the entry's fresh-head key, if any.
 */
export function headDedupeSelector(
  tag: string,
  get: (attr: string) => string | null | undefined,
  key?: string | null,
): string | null {
  if (key != null && key !== "") return `[${HEAD_KEY_ATTR}="${cssAttr(key)}"]`;
  const id = get("id");
  if (id != null && id !== "") return `[id="${cssAttr(id)}"]`;
  if (tag === "meta") {
    const name = get("name");
    if (name != null && name !== "") return `meta[name="${cssAttr(name)}"]`;
    const property = get("property");
    if (property != null && property !== "") return `meta[property="${cssAttr(property)}"]`;
  }
  if (tag === "link") {
    const rel = get("rel");
    if (rel === "canonical" || rel === "manifest") return `link[rel="${rel}"]`;
  }
  if (tag === "base") return "base";
  return null;
}
