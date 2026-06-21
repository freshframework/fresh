---
description: |
  Create your first Fresh 3 project, run it in development, and build it for
  production.
---

Fresh 3 is a [Vite][vite] plugin. A project is a normal Vite app with a `routes/` directory — so any package manager and any runtime that can run Vite (Node or Deno) works.

## Create a project

The fastest way to start is the `@frsh/create-app` scaffolder. It prompts for a directory, lets you toggle optional features (such as Tailwind CSS), and can install dependencies and initialize a git repo for you. It detects which package manager you invoked it with and prints matching next-step commands.

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

You can also pass the target directory directly, e.g. `npm create @frsh/app my-app`.

Then start the dev server with the command the scaffolder prints:

```sh npm
npm run dev
```

```sh pnpm
pnpm dev
```

```sh yarn
yarn dev
```

```sh deno
deno task dev
```

## Project structure

A Fresh project grows around a handful of conventions:

```txt-files Project structure
<project root>
├── routes/             # File-system routes — a file here is a URL
│   ├── _app.tsx        # Optional: the <html> shell wrapping every page
│   └── index.tsx       # Renders /
├── islands/            # Components hydrated on the client
│   └── Counter.tsx
├── components/         # Shared components that are not hydrated unless part of an island
├── public/             # Static assets, served at the root (public/logo.svg → /logo.svg)
├── entry.server.ts     # Optional: programmatic routing configuration and server setup
├── entry.client.ts     # Optional: global client code (loaded on every page)
├── vite.config.ts
├── tsconfig.json
└── package.json
```

Fresh generates a `.fresh/` directory (typed route helpers + a `tsconfig.json` your config extends). It is added to `.gitignore` by the scaffolder. This directory is generated automatically when you run the dev server or build for production. See [Type checking](/docs/advanced/type-checking) for what's inside and how the typed `./$<name>.ts` imports work.

## Add a route

Every file under `routes/` is a handler for a specific path. For example, `routes/about.tsx` is the handler for `/about`. Create it:

```tsx routes/about.tsx
import { page } from "./$about.ts";

export default page(() => {
  return (
    <main>
      <h1>About</h1>
      <p>This is the about page.</p>
    </main>
  );
});
```

When navigating to `/about`, Fresh renders this page on the server and sends it to the client as plain HTML. See [Routing](/docs/concepts/routing) for dynamic params, catch-alls, and more.

## Add an island

Anything under `islands/` is hydrated in the browser. Create a counter:

```tsx islands/Counter.tsx
import { useSignal } from "@preact/signals";

export function Counter() {
  const count = useSignal(0);
  return (
    <button type="button" onClick={() => count.value++}>
      Count: {count}
    </button>
  );
}
```

Use it from a route like any other component — Fresh hydrates it automatically:

```tsx routes/index.tsx
import { page } from "./$index.ts";
import { Counter } from "../islands/Counter.tsx";

export default page(() => {
  return (
    <main>
      <h1>Hello, Fresh!</h1>
      <Counter />
    </main>
  );
});
```

See [Islands](/docs/concepts/islands) for what you can pass as props and how hydration works.

## Build for production

```sh npm
npm run build
```

```sh pnpm
pnpm build
```

```sh yarn
yarn build
```

```sh deno
deno task build
```

This produces a [Nitro][nitro] build under `.output/`:

- `.output/server/index.mjs` — the deployable server.
- `.output/public/` — client assets (islands, CSS, the boot script).

Run it locally with the matching preview command, or `node .output/server/index.mjs`:

```sh npm
npm run preview
```

```sh pnpm
pnpm preview
```

```sh yarn
yarn preview
```

```sh deno
deno task preview
```

Nitro can target Node, Deno Deploy, Cloudflare Workers, and more — dedicated deployment guides are on the way.

## Next steps

- [**Routing**](/docs/concepts/routing) — file-system routes, params, catch-alls.
- [**Routes**](/docs/concepts/routes) — handler + page, load data, handle `POST`/`PUT`/`DELETE`.
- [**Middleware**](/docs/concepts/middleware) — auth, logging, shared state.
- [**Islands**](/docs/concepts/islands) — client-side interactivity.

[vite]: https://vite.dev
[nitro]: https://nitro.build
