---
description: |
  How the generated $ helpers, .fresh directory, and tsconfig give you typed
  route params, handler data, and middleware state without writing any types
  by hand.
---

Fresh has no separate types package and no manual `Props` interface to fill in. The Vite plugin generates a small TypeScript scaffold next to your code on every dev run and every build. Routes import from that scaffold and get a fully-typed `ctx`, `params`, `props.data`, and middleware state. The types are inferred from the actual handler and page you wrote.

## The `.fresh/` directory

When you start the dev server or run `vite build`, Fresh writes a `.fresh/` directory at the project root. It contains two things.

- `tsconfig.json`. A base config that your project's `tsconfig.json` extends. It sets `jsx: "react-jsx"`, `jsxImportSource: "preact"`, strict mode, and registers `.fresh/types/**` as a virtual root.
- `types/`. Generated `.d.ts` files mirroring the shape of your `routes/` tree (route params, layout and middleware state, and so on).

The directory is regenerated whenever files in `routes/` change. Add it to `.gitignore`. The scaffolder does this for you. The build always recreates it.

> [info]: If your editor flags `./$<name>.ts` imports as missing in a brand-new project, run `vite` (or `vite build`) once. Until the plugin has executed, `.fresh/types/` does not exist yet.

## The `$` files

For every route, layout, middleware, app shell, and error page, Fresh exposes a sibling virtual module named `$<filename>.ts`. The files live in `.fresh/types/`, but TypeScript's `rootDirs` makes them resolvable as if they sat next to the file.

| Source file | Sibling import | Exports |
| --- | --- | --- |
| `routes/about.tsx` | `./$about.ts` | `page`, `handler` |
| `routes/users/[id].tsx` | `./$[id].ts` | `page`, `handler` (with typed `ctx.params.id`) |
| `routes/blog/[...path].tsx` | `./$[...path].ts` | `page`, `handler` (with typed `ctx.params.path`) |
| `routes/_app.tsx` | `./$_app.ts` | `app` |
| `routes/_layout.tsx` | `./$_layout.ts` | `layout` |
| `routes/_middleware.tsx` | `./$_middleware.ts` | `middleware`, `ParentState` |
| `routes/_error.tsx` | `./$_error.ts` | `page`, `handler` |

Each export is a typed identity helper. It accepts the function you would write anyway and returns it unchanged, but with `ctx`, `params`, `props.data`, and middleware state already narrowed for that exact route.

```tsx routes/users/[id].tsx
import { handler, page } from "./$[id].ts";

export const handlers = handler((ctx) => {
  // ctx.params.id is `string`, generated from the [id] segment.
  return { data: { id: ctx.params.id } };
});

export default page((props) => {
  // props.data is inferred from the handler return.
  return <h1>User {props.data.id}</h1>;
});
```

## State and `ParentState`

`_middleware.tsx` files compose. The generated `./$_middleware.ts` exports a `ParentState` type that represents whatever state the middlewares above this one have already added. Extend it to add your own fields.

```tsx routes/admin/_middleware.tsx
import { middleware, ParentState } from "./$_middleware.ts";

export interface State extends ParentState {
  user: { id: string; isAdmin: boolean };
}

export default middleware(async (ctx) => {
  const user = await loadUser(ctx);
  if (!user.isAdmin) return new Response("Forbidden", { status: 403 });
  return ctx.next({ ...ctx.state, user });
});
```

Routes nested under `admin/` automatically see `ctx.state.user` typed through the same generated chain.

## The project tsconfig

The project `tsconfig.json` should extend `.fresh/tsconfig.json`. That is what wires up the JSX runtime, the strict-mode flags, and the `$` lookups.

```json tsconfig.json
{
  "extends": "./.fresh/tsconfig.json",
  "compilerOptions": {
    "module": "esnext",
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "noEmit": true,
    "types": ["vite/client"]
  }
}
```

## Continuous integration

Run the dev server or `vite build` once before `tsc --noEmit` so that `.fresh/types/` exists. If a CI step only typechecks, a one-shot `vite build` is enough. The scaffolder adds the right scripts to `package.json`, so most projects can just run them in order.

## Troubleshooting

Almost every issue with the generated types comes down to `.fresh/` being missing or out of date. Running the dev server or `vite build` regenerates it from scratch.

A few specific cases come up often.

The editor shows red squiggles on `./$…` imports in a fresh checkout. The plugin generates the types on first startup, so this clears once `vite` (or `vite build`) has run at least once.

`ctx.params` looks stale after renaming a segment. The generator picks up file changes while the dev server is running. If it is not running, restart it or rerun the build.

`Cannot find module './$…'` appears after a `git clean`. This is expected because `.fresh/` is gitignored. The next `vite` invocation recreates it.
