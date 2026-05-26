---
description: |
  The Builder class is used to generate optimized assets for production.
---

> [warn]: The `Builder` class was used during the alpha phase of Fresh 2 before
> the Fresh vite plugin was released. You can skip this page if you're using
> vite.

The `Builder` class is used to generate production assets of your app. You'll
typically find it being created inside your project's `dev.ts` file.

```ts dev.ts
import { Builder } from "fresh/dev";

const builder = new Builder({ target: "safari12" });

if (Deno.args.includes("build")) {
  // This creates a production build
  await builder.build();
} else {
  // This starts a development server with live reload
  await builder.listen(() => import("./main.ts"));
}
```

## Options

You can customize the builder by passing options.

```ts dev.ts
const builder = new Builder({
  // Browser target for generated code. Maps to https://esbuild.github.io/api/#target
  target?: string | string[];
  // The root directory of the project. All other paths will be resolved
  // against this if they're relative. (Default: `Deno.cwd()`)
  root?: string;
  // The path to your server entry point. (Default: `<root>/main.ts`)
  serverEntry?: string;
  // Where to write generated files when doing a production build.
  // (default: `<root>/_fresh/`)
  outDir?: string;
  // Path to static file directory, or an array of directories.
  // When multiple directories are specified they are searched in order
  // and the first match wins. (Default: `<root>/static/`)
  staticDir?: string | string[];
  // Path to island directory. (Default: `<root>/islands`)
  islandDir?: string;
  // Path to routes directory. (Default: `<root>/routes`)
  routeDir?: string;
  // File paths which should be ignored
  ignore?: RegExp[];
  // Glob patterns for static files that should use content-hash
  // caching instead of build-ID. Useful for large assets like WASM
  // that rarely change between deploys.
  contentAddressedStatic?: string[];
  // Optionally generate production source maps
  // See https://esbuild.github.io/api/#source-maps
  sourceMap?: {
    kind?: boolean | 'linked' | 'inline' | 'external' | 'both';
    sourceRoot?: string;
    sourcesContent?: boolean;
  };
})
```

## Registering islands

The builder is where you'll register files that contain islands. This is the
same API that Fresh uses internally.

```ts dev.ts
const builder = new Builder();

// Path to local island
builder.registerIsland("path/to/my/Island.tsx");
// File urls work too
builder.registerIsland("file:///path/to/my/Island.tsx");
// Also islands from jsr
builder.registerIsland("jsr:@marvinh-test/fresh-island");
```

## Adding build plugins

The `Builder` has a very simple processing mechanism for static files.

```ts dev.ts
builder.onTransformStaticFile({
  pluginName: "My cool plugin",
  filter: /\.css$/,
}, (args) => {
  // Prepend `body { background: red }` to every `.css` file
  const code = `body { background: red } ${args.text}`;

  return {
    content: code,
    map: undefined, // Optional: source maps
  };
});
```

> [info]: Only static files in `static/` or the directories you set `staticDir`
> to will be processed. The builder won't process anything else.

### Multiple static directories

You can pass an array to `staticDir` to serve files from multiple directories.
When the same filename exists in more than one directory, the first directory in
the array takes precedence.

```ts dev.ts
const builder = new Builder({
  staticDir: ["static", "generated"],
});
```

This is useful when you have a build step that generates assets into a separate
directory and you want to keep them apart from hand-authored static files.

## Testing

Testing applications with the `Builder` class involves creating a build snapshot
and assigning that to each app instance.

```ts my-app.test.ts
// Best to do this once instead of for every test case for
// performance reasons.
const builder = new Builder();
const applySnapshot = await builder.build({ snapshot: "memory" });

function testApp() {
  const app = new App()
    .get("/", () => new Response("hello"))
    .fsRoutes();

  // Applies build snapshot to this app instance.
  applySnapshot(app);
  return app;
}

Deno.test("My Test", async () => {
  const handler = testApp().handler();

  const response = await handler(new Request("http://localhost"));
  const text = await response.text();

  if (text !== "hello") {
    throw new Error("fail");
  }
});
```

## Tailwindcss

[Tailwindcss](https://tailwindcss.com/) is a utility-first CSS framework that
generates CSS out of the class names that are used in JSX. Since we use
Tailwindcss ourselves here at Deno, Fresh ships with an official plugin for
that.

### Usage

1. Set `nodeModulesDir` in `deno.json` to `"manual"`

```diff deno.json
  {
    "name": "@example/my-cool-project"
+   "nodeModulesDir": "manual",
    "imports": {
      ...
    }
  }
```

2. Run `deno install jsr:@fresh/plugin-tailwind`
3. Update `dev.ts`:

```diff dev.ts
  import { Builder } from "fresh/dev";
+ import { tailwind } from "@fresh/plugin-tailwind";
  
  const builder = new Builder();
+ tailwind(builder);
```

4. Add `@import "tailwindcss";` at the top of your main stylesheet.

For more information on how to use tailwindcss, check out
[their documentation](https://tailwindcss.com/docs/styling-with-utility-classes).

### Options

You can customize the tailwind plugin via the following options:

```ts dev.ts
tailwind(builder, {
  // Exclude certain files from processing
  exclude: ["/admin/**", "*.temp.css"],
  // Force optimization (defaults to production mode)
  optimize: true,
  // Exclude base styles
  base: null,
});
```

### Tailwindcss v3

If you can't update to the current version of tailwindcss we have a dedicated
`@fresh/plugin-tailwindcss-v3` plugin that uses tailwindcss v3. That way you can
decided on your own when it's best to update to v4.

```ts dev.ts
import { Builder } from "fresh/dev";
import { tailwind } from "@fresh/plugin-tailwind-v3";

tailwind(builder, {});
```
