// `<Head>` — a Preact context provider that marks its descendants as
// "in document head". Any head-eligible intrinsic element rendered
// inside this context (`<title>`, `<meta>`, `<link>`, `<script>`,
// `<style>`, `<base>`, `<noscript>`, `<template>`) is hoisted out of
// the inline position and into the document's real `<head>`, with
// last-write-wins dedup.
//
// The matching server- and client-side hooks live in
// `src/server/render.ts` and `src/client/head.ts`; this file is
// runtime-shared between them so neither side needs to import the
// other's hook module just to get the context tag.

import { type Context, createContext, type ComponentChildren, h } from "preact";
import { installClientHeadHook } from "../client/head.ts";

/**
 * Context flag consumed by the head-element wrappers installed in the
 * server render and the client boot. Default `false`. Setting it to
 * `true` via `<Head>` is what causes intrinsic head elements rendered
 * underneath to be collected and rendered into the document's `<head>`
 * instead of inline.
 */
export const HeadContext: Context<boolean> = createContext(false);

// Auto-install the client-side hook the moment this module is
// imported — typically because the user just imported `<Head>` from
// `fresh/runtime`. Has to land BEFORE any user JSX constructs a head-
// eligible element (`h("title", …)` etc.), so we can't defer this
// to inside the `<Head>` component body — children are evaluated as
// arguments BEFORE the component runs. Module-top is the right
// trigger point. No-op on the server (the installer guards on
// `typeof document`).
installClientHeadHook();

export interface HeadProps {
  children?: ComponentChildren;
}

/**
 * Marks its descendants as part of the document `<head>`.
 *
 * ```tsx
 * <Head>
 *   <title>About — My Site</title>
 *   <meta name="description" content="…" />
 *   <link rel="canonical" href="https://example.com/about" />
 * </Head>
 * ```
 *
 * Dedup rules (matching Fresh 2):
 *   - `<title>` always replaces any other `<title>` (collected or in
 *     the shell);
 *   - otherwise dedup by `key` prop → `id` prop → `<meta name>` →
 *     singleton `<link rel>` (`canonical`, `manifest`) → `<base>`;
 *   - last-write wins.
 *
 * `<Head>` works equally well from a route component, a shared
 * component, or inside an island — in the island case the boot
 * runtime applies the same dedup to `document.head` post-hydrate, so a
 * re-rendered island updates the real `<title>` etc.
 */
export function Head(props: HeadProps): ComponentChildren {
  return h(HeadContext.Provider, { value: true }, props.children);
}
