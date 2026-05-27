---
description: |
  Configure the Fresh Vite plugin, add other Vite plugins, and understand how Fresh integrates with Vite.
---

Fresh 2 uses [Vite](https://vite.dev/) for development and production builds.
The Fresh Vite plugin handles JSX configuration, Hot Module Replacement (HMR),
[island](/docs/concepts/islands) discovery, client/server code splitting, and
React-to-Preact aliasing.

## Configuration

The Fresh Vite plugin can be configured in `vite.config.ts`:

```ts vite.config.ts
import { defineConfig } from "vite";
import { fresh } from "@fresh/plugin-vite";

export default defineConfig({
  plugins: [
    fresh({
      // Path to main server entry file. Default: main.ts
      serverEntry: "./path/to/main.ts",
      // Path to main client entry file. Default: client.ts
      clientEntry: "./path/to/client.ts",
      // Path to islands directory. Default: ./islands
      islandsDir: "./islands",
      // Path to routes directory. Default: ./routes
      routeDir: "./routes",
      // Static file directory or directories. Default: "static"
      // When multiple directories are given, they are searched in
      // order and the first match wins.
      staticDir: ["static", "generated"],
      // Optional regex to ignore folders when crawling the routes and
      // island directory.
      ignore: [/[\\/]+some-folder[\\/]+/],
      // Additional specifiers to treat as island files. This is used
      // for declaring islands from third party packages.
      islandSpecifiers: ["@example/my-remote-island"],
    }),
  ],
});
```

## Adding other Vite plugins

You can use any Vite-compatible plugin alongside Fresh. The Fresh plugin should
generally come first:

```ts vite.config.ts
import { defineConfig } from "vite";
import { fresh } from "@fresh/plugin-vite";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [
    fresh(),
    tailwindcss(),
    // Add any other Vite plugins here
  ],
});
```

## What the plugin does

Behind the scenes, the Fresh Vite plugin:

- **Configures JSX** for Preact automatically (`jsxImportSource: "preact"`)
- **Aliases React to Preact** so npm packages that depend on React work out of
  the box
- **Enables HMR** via [Prefresh](https://github.com/preactjs/prefresh) for fast
  component reloading during development
- **Discovers islands** by scanning the islands directory and any
  `islandSpecifiers`
- **Builds separate client and server bundles** using Vite's Environments
  feature
- **Generates a server entry** (`_fresh/server.js`) for production deployment
- **Validates imports** to catch mistakes like importing Node.js-only modules in
  browser code

## Hot Module Replacement

During development (`deno task dev`), the Fresh Vite plugin enables HMR so that
changes to components, islands, and CSS are reflected in the browser instantly
without a full page reload. This is powered by Prefresh, Preact's fast refresh
implementation.

## Migrating from the Builder to Vite

If your Fresh 2 project was created with `--builder` (or predates the Vite
plugin), it uses the legacy [`Builder`](/docs/advanced/builder) class wired up
in `dev.ts`. Migrating to Vite is mostly a matter of swapping `dev.ts` for a
`vite.config.ts`, moving CSS into the module graph, and updating `deno.json`.

### 1. Update `deno.json`

Add the Vite plugin and `vite` itself to your imports, drop the Builder-only
Tailwind packages (if any), and point `compilerOptions.types` at Vite's client
types so HMR and asset imports type-check:

```diff deno.json
  {
    "nodeModulesDir": "manual",
    "tasks": {
-     "dev": "deno run -A --watch=static/,routes/ dev.ts",
-     "build": "deno run -A dev.ts build",
+     "dev": "vite",
+     "build": "vite build",
      "start": "deno serve -A _fresh/server.js"
    },
    "imports": {
      "fresh": "jsr:@fresh/core@^2",
      "preact": "npm:preact@^10",
      "@preact/signals": "npm:@preact/signals@^2",
+     "@fresh/plugin-vite": "jsr:@fresh/plugin-vite@^1",
+     "vite": "npm:vite@^7",
+     "@types/babel__core": "npm:@types/babel__core@^7"
    },
    "compilerOptions": {
      "jsx": "precompile",
      "jsxImportSource": "preact",
+     "types": ["vite/client"]
    }
  }
```

If you were using `@fresh/plugin-tailwind` / `@fresh/plugin-tailwindcss-v3`,
remove those imports — Vite has a first-party Tailwind plugin (see step 4).

### 2. Replace `dev.ts` with `vite.config.ts`

Delete `dev.ts` and create a `vite.config.ts` at the project root:

```ts vite.config.ts
import { defineConfig } from "vite";
import { fresh } from "@fresh/plugin-vite";

export default defineConfig({
  plugins: [fresh()],
});
```

If you passed options to `new Builder({ ... })` (custom `serverEntry`,
`islandDir`, `routeDir`, `staticDir`, `ignore`), pass the equivalent options to
`fresh({ ... })` — the names match. See [Configuration](#configuration) above.

Any `builder.registerIsland("jsr:@scope/pkg/Island.tsx")` calls become
`fresh({ islandSpecifiers: ["jsr:@scope/pkg/Island.tsx"] })`.

### 3. Add a `client.ts` entry

The Builder discovered CSS by scanning `static/`. Vite needs CSS to be part of
the module graph so it can hash, bundle, and hot-reload it. Move your stylesheet
out of `static/` and import it from a new `client.ts` file:

```diff Project structure
  <project root>
- ├── static/styles.css
+ ├── assets/styles.css
+ ├── client.ts
  ├── vite.config.ts
  └── main.ts
```

```ts client.ts
// Import CSS files here for hot module reloading to work.
import "./assets/styles.css";
```

Then remove the manual `<link>` from your app wrapper — Vite injects the
stylesheet for you:

```diff routes/_app.tsx
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>My App</title>
-   <link rel="stylesheet" href="/styles.css" />
  </head>
```

Static assets that are not part of the JS/CSS graph (favicons, images served by
URL, robots.txt, …) stay in `static/`.

### 4. Switch the Tailwind plugin (if applicable)

Replace the Builder-side Tailwind plugin with the official Vite plugin:

```diff deno.json
  "imports": {
-   "@fresh/plugin-tailwind": "jsr:@fresh/plugin-tailwind@^1",
-   "@tailwindcss/postcss": "npm:@tailwindcss/postcss@^4",
-   "postcss": "npm:postcss@^8",
+   "@tailwindcss/vite": "npm:@tailwindcss/vite@^4",
    "tailwindcss": "npm:tailwindcss@^4"
  }
```

```ts vite.config.ts
import { defineConfig } from "vite";
import { fresh } from "@fresh/plugin-vite";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [fresh(), tailwindcss()],
});
```

Make sure your stylesheet starts with `@import "tailwindcss";` and is imported
from `client.ts`.

### 5. Verify

Run `deno install` to pull in the new npm packages, then:

```sh Terminal
deno task dev      # starts Vite with HMR
deno task build    # writes _fresh/server.js and client assets
deno task start    # deno serve -A _fresh/server.js
```

The output layout under `_fresh/` is the same as the Builder produced, so
deployment configuration (Deno Deploy, Docker, `deno compile`) does not need to
change.

### Checklist

- [ ] `dev.ts` removed, `vite.config.ts` added
- [ ] `client.ts` created and imports your CSS
- [ ] Stylesheet moved out of `static/` and the `<link>` removed from `_app.tsx`
- [ ] `deno.json` tasks point at `vite` / `vite build`
- [ ] `@fresh/plugin-vite`, `vite`, and `@types/babel__core` in `imports`
- [ ] `"vite/client"` in `compilerOptions.types`
- [ ] Tailwind (if used) switched to `@tailwindcss/vite`

> [info]: If you get stuck, run `deno run -Ar jsr:@fresh/init` in a scratch
> directory and diff the generated project against yours — the generator is the
> source of truth for a working Vite-based Fresh setup.

## Debugging

To debug Vite resolution issues, run Vite with the `--debug` flag:

```sh Terminal
deno run -A npm:vite --debug
```

To inspect plugin transformations, use
[`vite-plugin-inspect`](https://github.com/antfu-collective/vite-plugin-inspect):

```ts vite.config.ts
import { defineConfig } from "vite";
import { fresh } from "@fresh/plugin-vite";
import inspect from "vite-plugin-inspect";

export default defineConfig({
  plugins: [
    fresh(),
    inspect(), // Opens a UI at /__inspect to view all transformations
  ],
});
```
