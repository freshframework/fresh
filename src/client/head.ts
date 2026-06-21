// Client-side `<Head>` runtime — the mirror image of the wrap done in
// `server/render.ts`. The server side runs at render time, collects
// head-eligible elements into a per-render Map, and emits them into
// the rendered HTML. The client side hooks Preact's `options.vnode`
// so the SAME element types created INSIDE an island's render — when
// the island re-renders post-hydration — are diverted from their
// inline position into `document.head` with the same dedup rules.
//
// Installed once via `installClientHeadHook()`, which `boot()` calls
// before walking island markers. Idempotent: re-calling is a no-op.

import { h, options, type ComponentChildren, type VNode } from "preact";
import { useContext, useEffect } from "preact/hooks";
import { effect } from "@preact/signals";
import { HeadContext } from "../runtime/head.ts";
import { HEAD_KEY_ATTR, headDedupeSelector } from "./head-dedupe.ts";

const SIGNAL_BRAND = Symbol.for("preact-signals");

function isSignal(v: unknown): v is { brand: symbol; value: unknown } {
  return v !== null && typeof v === "object" && (v as { brand?: unknown }).brand === SIGNAL_BRAND;
}

const HEAD_TAGS = new Set([
  "title",
  "meta",
  "link",
  "script",
  "style",
  "base",
  "noscript",
  "template",
]);

const PATCHED_HEAD = new WeakSet<object>();

/**
 * Idempotent install. Auto-called when `fresh/runtime` is imported
 * (so we only run when the user actually uses `<Head>`), but
 * publicly exported too in case a host wants to wire it explicitly.
 *
 * No-op on the server — the server has its own head hook installed
 * by `src/server/render.ts` and we mustn't clobber it. `typeof
 * document` is the universal guard (the `import.meta.env.SSR` flag
 * Vite ships only fires inside Vite-driven builds; our test runner
 * imports the runtime directly under Node).
 */
let installed = false;
export function installClientHeadHook(): void {
  if (installed) return;
  if (typeof document === "undefined") return;
  installed = true;
  // deno-lint-ignore no-explicit-any
  const prev = (options as any).vnode as ((v: VNode) => void) | undefined;
  // deno-lint-ignore no-explicit-any
  (options as any).vnode = (vnode: VNode) => {
    if (
      vnode &&
      vnode.props &&
      typeof vnode.type === "string" &&
      HEAD_TAGS.has(vnode.type) &&
      !PATCHED_HEAD.has(vnode)
    ) {
      wrap(vnode);
    }
    prev?.(vnode);
  };
}

function wrap(vnode: VNode): void {
  const originalType = vnode.type as string;
  const originalKey = vnode.key;
  // deno-lint-ignore no-explicit-any
  (vnode as any).type = (props: Record<string, unknown>) => {
    const enabled = useContext(HeadContext);

    // When `<Head>` is open above us, mirror this entry into the real
    // `document.head` with dedup. We wrap `applyToDocumentHead` in
    // `@preact/signals`'s `effect` so any signal read inside (a signal
    // child, a signal-valued prop) auto-resubscribes — so when the
    // signal changes, the head element updates without us tracking
    // dependencies ourselves. `useEffect`'s cleanup disposes the
    // signal effect when this island unmounts or re-renders with new
    // props.
    useEffect(() => {
      if (!enabled) return;
      return effect(() => {
        applyToDocumentHead(originalType, originalKey, props);
      });
    }, [originalType, originalKey, props]);

    if (enabled) {
      // Don't render anything at the island's inline position — the
      // entry lives in `document.head`.
      return null;
    }
    // Outside `<Head>` (e.g. an island's own `<style>` for scoped
    // CSS). Render normally; we tag the inner vnode so the chained
    // `options.vnode` doesn't re-wrap.
    const inner = h(originalType, props);
    PATCHED_HEAD.add(inner);
    return inner;
  };
}

function applyToDocumentHead(type: string, key: unknown, props: Record<string, unknown>): void {
  if (type === "title") {
    document.title = extractText(props.children as ComponentChildren);
    return;
  }

  // Find an existing element that already owns this slot (shared with partial
  // navigation's head sync, so the two agree on dedup).
  const selector = headDedupeSelector(
    type,
    (attr) => {
      const v = props[attr];
      return typeof v === "string" ? v : v == null ? null : String(v);
    },
    key == null ? null : String(key),
  );
  let matched: HTMLElement | null =
    selector !== null ? document.head.querySelector(selector) : null;

  if (matched === null) {
    matched = document.createElement(type);
    document.head.appendChild(matched);
  }

  if (key !== undefined && key !== null) {
    matched.setAttribute(HEAD_KEY_ATTR, String(key));
  }
  applyProps(props, matched);
  const text = extractText(props.children as ComponentChildren);
  if (matched.textContent !== text) matched.textContent = text;
}

function extractText(children: ComponentChildren): string {
  if (children === undefined || children === null || children === false) return "";
  if (typeof children === "string") return children;
  if (typeof children === "number") return String(children);
  // Read `signal.value` rather than `signal.peek()` — the surrounding
  // `effect(() => …)` subscribes to it so the head updates when the
  // signal changes.
  if (isSignal(children)) return String(children.value);
  if (Array.isArray(children)) {
    return children.map((c) => extractText(c as ComponentChildren)).join("");
  }
  return "";
}

function applyProps(props: Record<string, unknown>, el: HTMLElement): void {
  for (const k of Object.keys(props)) {
    if (k === "children" || k === "key" || k === "ref") continue;
    // Unwrap signals via `.value` so the surrounding `effect()`
    // subscribes — signal-valued props (e.g. `<link href={hrefSig} />`)
    // then react to changes.
    let v = props[k];
    if (isSignal(v)) v = v.value;
    if (v === null || v === undefined || v === false) {
      el.removeAttribute(k);
    } else if (v === true) {
      el.setAttribute(k, "");
    } else {
      el.setAttribute(k, String(v));
    }
  }
}
