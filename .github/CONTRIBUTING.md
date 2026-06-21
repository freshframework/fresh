# Contributing to Fresh

Thanks for your interest in contributing! This guide covers the project layout, development workflow, and what's expected of a contribution.

## Project layout

Fresh is a pnpm workspace. The framework package lives in [`src/`](../src/) and is consumed by the workspace apps in [`example/`](../example/) and [`tests/fixture/`](../tests/fixture/) via `workspace:*`. The documentation site lives in [`www/`](../www/), and the project scaffolder in [`packages/create-app/`](../packages/create-app/).

Use `pnpm`, not `npm` or `yarn`.

```sh
pnpm install
```

## Development

Most work happens against [`example/`](../example/) or [`tests/fixture/`](../tests/fixture/). Boot either with:

```sh
pnpm --filter example dev
```

Source changes in [`src/`](../src/) are picked up directly — no rebuild step.

## Testing

There are **three** test suites. A change should be covered by whichever one(s) fit; behavior changes to the framework almost always warrant at least one.

1. **Unit** — `src/**/*.test.ts`, run with [Vitest](https://vitest.dev). Fast, in-isolation tests of pure build- and server-side functions (route scanning, codegen, serialization, render helpers). No server, no browser. Reach for these first — they're the cheapest to write and run.

2. **Integration** — `tests/integration/**/*.test.ts`, also run with Vitest. These boot the real Fresh dev server in-process and drive it over `fetch`, exercising routing → middleware → handler → render → partial responses end-to-end without a browser. Use these to verify server-side request/response behavior (status codes, headers, SSR output, partial fragments).

   Both Vitest suites are defined as separate projects in [`vitest.config.ts`](../vitest.config.ts) and run together:

   ```sh
   pnpm test
   ```

3. **End-to-end** — `tests/e2e/**/*.spec.ts`, run with [Playwright](https://playwright.dev) against the app in [`tests/fixture/`](../tests/fixture/) in real Chromium, Firefox, and WebKit. Use these for anything that depends on the browser: client-side hydration, islands, signals, serialized event handlers, and partial navigation. Add exercising pages/routes to the fixture as needed.

   ```sh
   pnpm run test:e2e
   ```

## Formatting & linting

- **Formatting** is handled by [oxfmt](https://oxc.rs):

  ```sh
  pnpm run fmt          # format
  pnpm run fmt:check    # verify
  ```

- **Linting** is handled by [oxlint](https://oxc.rs) — warnings are errors:

  ```sh
  pnpm run lint
  ```

## Before you open a PR

Run the bundled check command — it runs format check, lint, build, and typecheck together:

```sh
pnpm run check
```

Plus `pnpm test` for the Vitest suites, and `pnpm run test:e2e` if your change touches browser behavior. CI runs all of these.

## Pull requests

- Keep PRs focused — one feature or fix per PR. Bundle drive-by cleanup into a separate PR.
- Write a clear description: what changes, why, and how to verify.
- Reference the relevant issue if one exists.
- New behavior must be covered by tests in the appropriate suite (see above).

## Reporting bugs

Open an issue at <https://github.com/freshframework/fresh/issues> with a minimal reproduction — ideally a small repo or a snippet that drops into [`example/`](../example/) or [`tests/fixture/`](../tests/fixture/).
