# fresh3

A from-scratch reimplementation of the Fresh web framework, built on Vite 8 (rolldown), Nitro 3, Preact, rou3, prefresh, and devalue. The framework package lives in [`src/`](src/) and is consumed by the workspace apps in [`example/`](example/) and [`tests/fixture/`](tests/fixture/) via `workspace:*`.

This is a pnpm workspace. Use `pnpm`, not `npm`.

## Testing — every change must be tested

There are **three** test suites. A change should be covered by whichever one(s) fit; behavior changes to the framework almost always warrant at least one of them.

1. **Unit** — `src/**/*.test.ts`, run with [Vitest](https://vitest.dev). Fast, in-isolation tests of pure build- and server-side functions (route scanning, codegen, serialization, render helpers). No server, no browser. Reach for these first — they're the cheapest to write and run.

2. **Integration** — `tests/integration/**/*.test.ts`, also run with Vitest. These boot the **real Fresh dev server in-process** (`createServer` + `listen()`) and drive it over `fetch`, exercising routing → middleware → handler → render → partial responses end-to-end **without a browser**. Use these to verify server-side request/response behavior (status codes, headers, SSR output, partial fragments).

   Both Vitest suites are defined as separate projects in [`vitest.config.ts`](vitest.config.ts) and run together via `pnpm test`.

3. **End-to-end** — `tests/e2e/**/*.spec.ts`, run with [Playwright](https://playwright.dev) (`pnpm run test:e2e`) against the app in [`tests/fixture/`](tests/fixture/) in **real Chromium, Firefox, and WebKit**. Use these for anything that depends on the browser: client-side hydration, islands, signals, serialized event handlers, and partial navigation. Add exercising pages/routes to the fixture as needed.

   Note: when something genuinely doesn't work in one engine because of a browser/driver limitation (e.g. the past Playwright WebKit hang on Navigation-API intercepts, since fixed), `test.skip` it gated on `browserName` with a reason and file a bug rather than working around it.

## Formatting & linting

- **Formatting** is handled by [oxfmt](https://oxc.rs) — `pnpm run fmt` to format, `pnpm run fmt:check` to verify. Do not hand-format or reach for Prettier (it was removed).
- **Linting** is handled by [oxlint](https://oxc.rs) — `pnpm run lint` (warnings are errors).

## Before you're done

Run `pnpm run check` — it runs formatting check, lint, build, and typecheck together. Plus `pnpm test` for the Vitest suites and `pnpm run test:e2e` if your change touches browser behavior. CI runs all of these.
