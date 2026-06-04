---
description: |
  How to style your Fresh app: global stylesheets, Tailwind CSS, CSS Modules, route-scoped CSS, and preprocessors.
---

Fresh supports several approaches to styling, all powered by
[Vite's CSS handling](https://vite.dev/guide/features#css). Choose the approach
that fits your use case:

| Goal | Approach |
| ---- | -------- |
| Global styles | Import CSS in `client.ts` |
| Utility-first CSS | Tailwind via `@tailwindcss/vite` |
| Scoped component styles | CSS Modules (`*.module.css`) |
| Route-specific styles | `export const css` or side-effect import |
| Preprocessors (SCSS, Less) | Install the npm package and import directly |
| Static stylesheets | Place in `static/`, reference by URL path |
| Inline styles in `<head>` | Use the `<Head>` component |

## Global stylesheets

The most common pattern is importing a CSS file from your `client.ts` entry
point. This makes the styles available on every page.

```css assets/styles.css
body {
  font-family: system-ui, sans-serif;
  line-height: 1.6;
}
```

```ts client.ts
import "./assets/styles.css";
```

Vite processes this import, applies any configured PostCSS transforms, and:

- In **development**: injects the CSS as inline `<style>` tags with hot module
  replacement.
- In **production**: extracts the CSS to a hashed `.css` file served with
  long-lived cache headers.

> [info]: Place imported CSS files **outside** the `static/` directory (e.g. in
> `assets/`). Files in `static/` are served as-is and would be duplicated in the
> build output. See [Static files](/docs/concepts/static-files) for details.

## Tailwind CSS

Fresh works with [Tailwind CSS](https://tailwindcss.com/) via the official
`@tailwindcss/vite` plugin:

```ts vite.config.ts
import { defineConfig } from "vite";
import { fresh } from "@fresh/plugin-vite";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [fresh(), tailwindcss()],
});
```

```css assets/styles.css
@import "tailwindcss";
```

```ts client.ts
import "./assets/styles.css";
```

Then use Tailwind classes in your components:

```tsx routes/index.tsx
export default function Home() {
  return <h1 class="text-4xl font-bold text-blue-600">Hello, Fresh!</h1>;
}
```

## CSS Modules

[CSS Modules](https://vite.dev/guide/features#css-modules) scope class names to
the component that imports them, preventing naming collisions. Any file ending in
`.module.css` is treated as a CSS Module by Vite.

```css islands/Counter.module.css
.counter {
  display: flex;
  gap: 0.5rem;
  align-items: center;
}

.count {
  font-variant-numeric: tabular-nums;
  min-width: 3ch;
  text-align: center;
}
```

```tsx islands/Counter.tsx
import { useSignal } from "@preact/signals";
import styles from "./Counter.module.css";

export default function Counter() {
  const count = useSignal(0);
  return (
    <div class={styles.counter}>
      <button onClick={() => count.value--}>-</button>
      <span class={styles.count}>{count}</span>
      <button onClick={() => count.value++}>+</button>
    </div>
  );
}
```

CSS Modules work in islands, server-only components, and route files. Fresh
automatically collects the CSS for any island and injects it as a `<link>` tag
during server rendering.

### TypeScript support

Deno's type checker does not natively understand `*.module.css` imports. Add
`vite/client` to your `deno.json` to pick up Vite's ambient types (which cover
CSS Modules, `?url`/`?raw` imports, and `import.meta.env`):

```jsonc deno.json
{
  "compilerOptions": {
    "types": ["vite/client"]
  }
}
```

This declares `*.module.css` imports as `Record<string, string>`, which gives
you autocompletion and type safety for class name lookups. Projects scaffolded
with `deno run -A jsr:@fresh/init` already include this.

## Route-scoped CSS

You can load CSS for a specific route in two ways.

### Side-effect import

Import a CSS file directly in the route module:

```tsx routes/dashboard.tsx
import "./dashboard.css";

export default function Dashboard() {
  return <main class="dashboard">...</main>;
}
```

### The `css` export

Export a `css` array with paths to CSS files:

```tsx routes/dashboard.tsx
export const css = ["./assets/dashboard.css"];

export default function Dashboard() {
  return <main class="dashboard">...</main>;
}
```

Both approaches scope the CSS to the route — the styles are only loaded when
that route is rendered. See [File routing](/docs/concepts/file-routing) for more
on route exports.

## Preprocessors

Since Fresh uses Vite, you can use CSS preprocessors by installing the
corresponding npm package. No additional Vite plugin is needed.

### SCSS / Sass

```sh
deno install npm:sass
```

```scss assets/theme.scss
$primary: #3b82f6;

.btn-primary {
  background-color: $primary;
  &:hover {
    background-color: darken($primary, 10%);
  }
}
```

```ts client.ts
import "./assets/theme.scss";
```

### Less

```sh
deno install npm:less
```

```less assets/theme.less
@primary: #3b82f6;

.btn-primary {
  background-color: @primary;
}
```

```ts client.ts
import "./assets/theme.less";
```

Preprocessor files also work with CSS Modules (e.g. `Button.module.scss`) and
route-scoped imports.

## Static stylesheets

For CSS files that should be served without processing, place them in the
`static/` directory and reference them by URL path:

```tsx routes/index.tsx
import { Head } from "fresh/runtime";

export default function Home() {
  return (
    <>
      <Head>
        <link rel="stylesheet" href="/legacy.css" />
      </Head>
      <h1>Hello</h1>
    </>
  );
}
```

Static files are served with
[`ETag`](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/ETag)
headers for caching. Use `asset()` for cache-busted URLs with a one-year cache
lifetime.

## How island CSS works

When an island imports CSS (via CSS Modules, side-effect imports, or
preprocessors), Fresh handles it automatically:

1. **During the build**, Vite extracts CSS from each island's module graph into
   separate hashed `.css` files.
2. **At runtime**, when the server renders an island, Fresh looks up its
   associated CSS and adds it to the page.
3. The CSS is injected as `<link>` tags in `<head>` so styles are available
   before the island hydrates.

In development mode, CSS is injected as inline `<style>` tags with hot module
replacement — changes are reflected instantly without a page reload.
