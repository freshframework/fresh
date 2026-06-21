---
description: |
  The core concepts of Fresh 3 — routing, routes, context, middleware,
  layouts, the app shell, error pages, islands, and signals.
---

These pages cover the building blocks of a Fresh application. Read them in order for a guided tour, or jump to what you need.

## Routing & data

- [**Routing**](/docs/concepts/routing) — turn files in `routes/` into URLs, with dynamic params, catch-alls, and route groups.
- [**Routes**](/docs/concepts/routes) — what a route file looks like: handler + page, return values, GET vs POST.
- [**Context**](/docs/concepts/context) — the `ctx` object every handler and middleware receives.
- [**Middleware**](/docs/concepts/middleware) — run logic before routes: auth, logging, shared state.

## Rendering

- [**Layouts**](/docs/concepts/layouts) — wrap groups of routes in shared UI.
- [**App shell**](/docs/concepts/app-shell) — the `<html>` document around every page.
- [**Error pages**](/docs/concepts/error-pages) — render 404s, 500s, and thrown errors.

## Interactivity

- [**Islands**](/docs/concepts/islands) — components hydrated in the browser.
- [**Signals & reactivity**](/docs/concepts/signals) — reactive state, on the page and inside islands.
- [**Event handlers**](/docs/concepts/events) — wire up `onClick`/`onInput` without an island.
