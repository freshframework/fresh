---
description: |
  How to use environment variables in Fresh, including public variables that are inlined into island bundles.
---

Environment variables in Deno are typically read via `Deno.env.get()` or
`process.env.*` calls or via an `.env` file if the `--env-file` flag is used,
see
[how to use Environment Variables in Deno](https://docs.deno.com/runtime/reference/env_variables/).

On top of that Fresh automatically inlines all environment variables whose names
start with `FRESH_PUBLIC_` during bundling of [islands](/docs/concepts/islands).

> [info]: This inlining step occurs when building the app (`deno task build`).
> Environment variables inside islands cannot be read at runtime.

Example:

```sh Terminal
$ FRESH_PUBLIC_FOO=bar deno task dev
```

```tsx
export function MyIsland() {
  const value = Deno.env.get("FRESH_PUBLIC_FOO");
  return <h1>{value}</h1>;
}
```

This code when bundled will be turned into this:

```tsx
export function MyIsland() {
  const value = "bar";
  return <h1>{value}</h1>;
}
```

This way you can use specific environment variables in the browser.

> [warn]: To make inlining work the code needs to be analyzable by our plugins.
> This means that not all forms of reading an environment variable in Deno are
> supported, even if it's perfectly valid JavaScript code.
>
> ```ts MyIsland.tsx
> // CORRECT
> Deno.env.get("FRESH_PUBLIC_FOO");
> process.env.FRESH_PUBLIC_FOO;
>
> // WRONG
> const name = "FRESH_PUBLIC_FOO";
> Deno.env.get(name);
> process.env[name];
>
> // WRONG
> const obj = Deno.env.toObject();
> obj.FRESH_PUBLIC_FOO;
> ```
