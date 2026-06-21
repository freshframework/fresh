---
description: |
  Fresh is a full-stack web framework for Preact, built on Vite and Web
  Standards. Server-render by default, ship JavaScript only for the interactive
  islands that need it.
---

Fresh is a small, fast, full-stack web framework for [Preact][preact], built on [Vite][vite] and Web Standards. You write routes and components; Fresh renders them on the server as HTML and ships JavaScript only for the interactive **islands** that actually need it.

```tsx routes/index.tsx
import { page } from "./$index.ts";

export default page(() => {
  return (
    <main>
      <h1>Hello, Fresh!</h1>
      <p>This page is server-rendered. No client JavaScript was shipped.</p>
    </main>
  );
});
```

## Quick Start

Scaffold a new project with `@frsh/create-app`. It prompts for a directory, lets you toggle optional features (such as Tailwind CSS), and can install dependencies and initialize a git repo for you.

```sh npm
npm create @frsh/app@latest
```

```sh pnpm
pnpm create @frsh/app
```

```sh yarn
yarn create @frsh/app
```

```sh deno
deno run -A npm:@frsh/create-app
```

Then start the dev server with the command the scaffolder prints. For a deeper walkthrough — manual setup, project structure, adding routes and islands — see [Getting Started](/docs/getting-started).

## Features

The core idea is the [islands architecture](https://jasonformat.com/islands-architecture): render server-generated HTML, and hydrate only the small, interactive parts of the page.

- **Server-rendered by default** — every route is a Preact component rendered to HTML on the server. Zero client JavaScript unless you opt in.
- **Islands for interactivity** — drop a component in `islands/` and Fresh hydrates just that subtree in the browser.
- **File-system routing** — a file in `routes/` is a URL. Dynamic params, catch-alls, layouts, and middleware are all conventions.
- **Built on Vite** — instant dev server, fast HMR (with Preact Fast Refresh that preserves island state), and a production build via [Nitro][nitro] that deploys to Node, Deno, Cloudflare Workers, and more.
- **Type-safe end to end** — route params, handler data, and middleware state are typed for you through generated helpers, with no manual wiring.
- **Small API surface** — a handful of primitives (`page`, `handler`, `layout`, `middleware`) cover most apps, so there is little to memorize and even less to maintain.

## When to use Fresh

Fresh is ideal for sites and apps that are primarily server-rendered — landing pages, documentation, content sites, e-commerce, dashboards, and CRUD apps — where you want fast first paint and interactivity only where it matters.

Its small API surface and file-based conventions also make it a great fit for AI-assisted development: agents can scaffold routes, add middleware, and build features with minimal context because the framework is simple and predictable.

If you're building a fully client-rendered single-page app, Fresh is not the right tool.

## Who is using Fresh?

Fresh powers production sites across documentation, marketing, and content — including [deno.com](https://deno.com), [deno.land](https://deno.land), and [jsr.io](https://jsr.io), as well as this documentation site. If you ship something built on Fresh, let us know on [GitHub](https://github.com/freshframework/fresh) and we'll add it here.

## Deployment

A Fresh production build is a [Nitro][nitro] output under `.output/`, which means Fresh runs anywhere Nitro does — without a custom runtime.

- **Node.js** — `node .output/server/index.mjs`, behind any reverse proxy or process manager.
- **Deno Deploy** — push the project; Nitro emits a Deno-compatible entry.
- **Cloudflare Workers** — deploy the Workers preset for edge execution.
- **Containers** — drop the `.output/` tree into a minimal Node or Deno image.
- **Static hosting** — fully-static pages can be prerendered and served from any CDN.

See [Build for production](/docs/getting-started#build-for-production) for the build command and where the artifacts land; dedicated deployment guides are on the way.

[preact]: https://preactjs.com
[vite]: https://vite.dev
[nitro]: https://nitro.build
