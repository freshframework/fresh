# Browser (end-to-end) tests

Real-browser tests for the client runtime — island hydration, partial navigation, forms, history/back-forward — using **Playwright** driving a real Fresh app.

- `fixture/` — a Fresh app whose pages exercise the client features. It's a workspace (`fresh-test-fixture`) and runs on a fixed port (`8765`).
- `e2e/` — the Playwright specs. `util.ts` holds shared helpers.

The harness lives in [`playwright.config.ts`](../playwright.config.ts) at the repo root: its `webServer` boots the fixture's Vite dev server and tears it down automatically. Tests run against **Chromium, Firefox, and WebKit** — including the partial-navigation suite (link/form swaps, history traversal, modes), which relies on Navigation API _same-document_ intercepts.

> Until Playwright `1.61.0-alpha-2026-06-10`, the WebKit driver hung on Navigation API same-document intercepts, so those tests were skipped on WebKit. That upstream bug is fixed and the skips are removed — all three engines run the full suite.

## Running

```sh
# one-time: install the browser binaries
npx playwright install chromium

npm run test:e2e                 # all specs
npx playwright test partials     # one spec
npx playwright test --headed     # watch it run
npx playwright test --ui         # interactive UI
```

(The `node --test` unit suite — `npm test` — is separate and covers the server side: `renderPartial`, markers, `ctx.isPartial`, serialization, etc.)

## Adding tests

1. Add a page/route (and any island) under `fixture/routes` / `fixture/islands` that demonstrates the behaviour. Give assertable hooks `id`s or `data-testid`s; islands set `data-hydrated="true"` once mounted, so a test can wait for interactivity deterministically.
2. Add a spec under `e2e/`. Use `markDocument` / `documentSurvived` from `util.ts` to assert whether a navigation was a partial swap (same document) or a full reload.
