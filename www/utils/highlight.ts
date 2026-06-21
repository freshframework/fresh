// Server-side syntax highlighting with Shiki.
//
// Uses Shiki's *synchronous* core with fine-grained, statically-imported
// grammars + themes and the pure-JS regex engine — no globals, no WASM, no
// async. That makes it safe to bundle into the Nitro server and call during
// synchronous SSR (unlike PrismJS, whose language modules register against a
// global that the bundler evaluates too early).

import { createHighlighterCoreSync, type HighlighterCore } from "shiki/core";
import { createJavaScriptRegexEngine } from "shiki/engine/javascript";
import { escape as escapeHtml } from "@std/html";

import typescript from "@shikijs/langs/typescript";
import tsx from "@shikijs/langs/tsx";
import javascript from "@shikijs/langs/javascript";
import jsx from "@shikijs/langs/jsx";
import json from "@shikijs/langs/json";
import bash from "@shikijs/langs/bash";
import diff from "@shikijs/langs/diff";
import css from "@shikijs/langs/css";
import html from "@shikijs/langs/html";
import markdown from "@shikijs/langs/markdown";
import docker from "@shikijs/langs/docker";

import githubLight from "@shikijs/themes/github-light";
import githubDark from "@shikijs/themes/github-dark";

const LIGHT = "github-light";
const DARK = "github-dark";

const highlighter: HighlighterCore = createHighlighterCoreSync({
  themes: [githubLight, githubDark],
  langs: [typescript, tsx, javascript, jsx, json, bash, diff, css, html, markdown, docker],
  engine: createJavaScriptRegexEngine({ forgiving: true }),
});

// Includes grammar aliases (ts, js, sh, shell, md, dockerfile, …).
const SUPPORTED = new Set(highlighter.getLoadedLanguages());

/** Whether a fenced-code language can be highlighted (vs. rendered as plain text). */
export function canHighlight(lang: string): boolean {
  return SUPPORTED.has(lang);
}

/**
 * Highlight `code` for light + dark themes. Shiki emits `--shiki-light` /
 * `--shiki-dark` CSS variables (no baked-in color); the stylesheet picks one
 * based on `data-theme`. Unknown languages render as escaped plain text.
 */
export function highlight(code: string, lang: string): string {
  if (!canHighlight(lang)) {
    return `<pre class="shiki"><code>${escapeHtml(code)}</code></pre>`;
  }
  return highlighter.codeToHtml(code, {
    lang,
    themes: { light: LIGHT, dark: DARK },
    defaultColor: false,
  });
}

/**
 * Highlight `code` with a single dark theme — for the dark code windows on the
 * marketing pages, which are dark regardless of the site theme.
 */
export function highlightDark(code: string, lang: string): string {
  if (!canHighlight(lang)) {
    return `<pre class="shiki shiki-dark"><code>${escapeHtml(code)}</code></pre>`;
  }
  return highlighter.codeToHtml(code, { lang, theme: DARK });
}
