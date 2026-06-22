---
description: Plugins can add new functionality to Fresh without requiring significant complexity.
---

Plugins can dynamically add new functionality to Fresh without exposing
significant complexity to the user. Users can add plugins by importing and
initializing them in their `main.ts` file:

```ts main.ts
import { start } from "$fresh/server.ts";
import manifest from "./fresh.gen.ts";

import twindPlugin from "$fresh/plugins/twind.ts";
import twindConfig from "./twind.config.js";

await start(manifest, {
  plugins: [
    // This line configures Fresh to use the first-party twind plugin.
    twindPlugin(twindConfig),
  ],
});
```

Currently, the only available first-party plugin is the Twind plugin.
Third-party plugins are also supported - they can be imported from any HTTP
server, like any other Deno module.

Plugin hooks are executed in the order that the plugins are defined in the
`plugins` array. This means that the first plugin in the array will be executed
first, and the last plugin in the array will be executed last. For many plugins,
this does not matter, but for some plugins it may.

## Creating a plugin

Fresh plugins are in essence a collection of hooks that allow the plugin to hook
into various systems inside of Fresh.

A Fresh plugin is just a JavaScript object that conforms to the
[Plugin](https://jsr.io/@fresh/core) interface. The only
required property of a plugin is its name. Names must only contain the
characters `a`-`z`, and `_`.

```ts my-plugin.ts
import { Plugin } from "$fresh/server.ts";

const plugin: Plugin = {
  name: "my_plugin",
};
```

A plugin containing only a name is technically valid, but not very useful. To be
able to do anything with a plugin, it must register some hooks, middlewares, or
routes.

### Hook: `render`

The render hook allows plugins to:

- Control timing of the synchronous render of a page.
- Inject additional CSS and JS into the rendered page.

This is commonly used to set thread local variables for the duration of the
render (for example preact global context, preact option hooks, or for style
libraries like Twind). After render is complete, the plugin can inject inline
CSS and JS modules (with attached state) into the page.

The render hook is called with the
[`PluginRenderContext`](https://jsr.io/@fresh/coreRenderContext)
object, which contains a `render()` method. This method must be invoked during
the render hook to actually render the page. It is a terminal error to not call
the `render()` method during the render hook.

The `render()` method returns a
[`PluginRenderFunctionResult`](https://jsr.io/@fresh/coreRenderFunctionResult)
object which contains the HTML text of the rendered page, as well as a boolean
indicating whether the page contains any islands that will be hydrated on the
client.

The `render` hook needs to synchronously return a
[`PluginRenderResult`](https://jsr.io/@fresh/coreRenderResult)
object. Additional CSS and JS modules can be added to be injected into the page
by adding them to `styles`, `links` and `scripts` arrays in this object. The
plugin can also replace the HTML in side the `<body>`-element of the page by
including a `htmlText` string in this object.

`styles` are injected into the `<head>` of the page as inline CSS. Each entry
can define the CSS text to inject, as well as an optional `id` for the style
tag, and an optional `media` attribute for the style tag.

`links` are injected into the `<head>` of the page as `<link>` tags. A link tag
is created for each entry, with attributes from the entry's properties.

`scripts` define JavaScript/TypeScript modules to be injected into the page. The
possibly loaded modules need to be defined up front in the `Plugin#entrypoints`
property. Each defined module must be a JavaScript/TypeScript module that has a
default export of a function that takes one (arbitrary) argument, and returns
nothing (or a promise resolving to nothing). Fresh will call this function with
the state defined in the `scripts` entry. The state can be any arbitrary JSON
serializable JavaScript value.

For an example of a plugin that uses the `render` hook, see the first-party
[Twind plugin](https://github.com/denoland/fresh/blob/1.x/plugins/twind.ts).

### Hook: `renderAsync`

This hook is largely the same as the `render` hook, with a couple of key
differences to make asynchronous style and script generation possible. It must
asynchronously return its
[`PluginRenderResult`](https://jsr.io/@fresh/coreRenderResult),
either from an `async/await` function or wrapped within a promise.

The render hook is called with the
[`PluginAsyncRenderContext`](https://jsr.io/@fresh/coreAsyncRenderContext)
object, which contains a `renderAsync()` method. This method must be invoked
during the render hook to actually render the page. It is a terminal error to
not call the `renderAsync()` method during the render hook.

This is useful for when plugins are generating styles and scripts with
asynchronous dependencies based on the `htmlText`. Unlike the synchronous render
hook, async render hooks for multiple pages can be running at the same time.
This means that unlike the synchronous render hook, you can not use global
variables to propagate state between the render hook and the renderer.

The `renderAsync` hooks start before any page rendering occurs, and finish after
all rendering is complete -- they wrap around the underlying JSX->string
rendering, plugin `render` hooks, and the
[`RenderFunction`](https://jsr.io/@fresh/core) that
may be provided to Fresh's `start` entrypoint in the `main.ts` file.

### Hook: `buildStart`

This hook is run at the start of the Fresh
[ahead-of-time build task](/docs/1.x/concepts/ahead-of-time-builds). It may be
synchronous or asynchronous.

The build start hook is called with the
[`ResolvedFreshConfig`](https://jsr.io/@fresh/core)
object, which contains the full Fresh configuration.

This hook may be used to generate precompiled static assets. Any files saved to
the `static` subfolder of `config.build.outDir` (typically `_fresh`) will be
served the same as other [static files](/docs/1.x/concepts/static-files).

### Hook: `buildEnd`

This hook is run at the end of the Fresh
[ahead-of-time build task](/docs/1.x/concepts/ahead-of-time-builds). It may be
synchronous or asynchronous.

### Routes and Middlewares

You can create routes and middlewares that get loaded and rendered like the
normal [routes](/docs/1.x/concepts/routes) and
[middlewares](/docs/1.x/concepts/middleware).

The plugin routes and middlewares need a defined path in the format of a file
name without a filetype inside the routes directory(E.g. `blog/index`,
`blog/[slug]`).

For more examples see the [Concepts: Routing](/docs/1.x/concepts/routing) page.

To create a middleware you need to create a `MiddlewareHandler` function.

And to create a route you can create both a Handler and/or component.

Below is an example plugin that creates a route and middleware

```ts my-route-and-middleware-plugin.ts
import { MiddlewareHandlerContext, Plugin } from "$fresh/server.ts";
import { handler as testMiddleware } from "./sample_routes/_middleware.ts";
import { SimpleRoute } from "./sample_routes/simple-route.tsx";
export type { Options };

interface Options {
  title: string;
}
export type PluginMiddlewareState = {
  num: number;
  test: string;
};

const twoPointlessMiddlewares = [
  async (
    _req: Request,
    ctx: MiddlewareHandlerContext<PluginMiddlewareState>,
  ) => {
    ctx.state.num = ctx.state.num === undefined ? 1 : ctx.state.num + 1;
    return await ctx.next();
  },
  async (
    _req: Request,
    ctx: MiddlewareHandlerContext<PluginMiddlewareState>,
  ) => {
    ctx.state.num = ctx.state.num === undefined ? 1 : ctx.state.num + 1;
    return await ctx.next();
  },
];

export default function routePlugin(
  options: Options,
): Plugin<PluginMiddlewareState> {
  return {
    name: "routePlugin",
    middlewares: [{
      middleware: { handler: testMiddleware },
      path: "/",
    }, {
      middleware: {
        handler: twoPointlessMiddlewares,
      },
      path: "lots-of-middleware",
    }],
    routes: [
      { path: "no-leading-slash-here", component: SimpleRoute },
    ],
  };
}
```

### Islands

Islands from plugins can be loaded by specifying a list of file paths in your
plugin. Those files will be treated by Fresh as if they had been placed inside
the `islands/` directory. They will be processed and bundled for the browser in
the same way.

```tsx my-island-plugin.ts
import { Plugin } from "$fresh/server.ts";

export default function myIslandPlugin(): Plugin {
  return {
    name: "my-island-plugin",
    islands: {
      baseLocation: import.meta.url,
      paths: [
        "./plugin/MyPluginIsland.tsx",
        "./plugin/OtherPluginIsland.tsx",
      ],
    },
  };
}
```
