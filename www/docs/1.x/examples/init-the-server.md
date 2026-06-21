---
description: |
  For when you have some complicated setup that needs to be performed once.
---

Let's pretend you've just initialized a new Fresh project. You want to do some complicated setup that runs once, before the server is started. This is, fortunately, quite easy. Here's how. Modify your `fresh.config.ts` like this:

```diff fresh.config.ts
 import twindConfig from "./twind.config.ts";
+import { Context } from "./routes/_middleware.ts";
+
+await Context.init();

 export default defineConfig({
   plugins: [twindPlugin(twindConfig)],
```

So your full `fresh.config.ts` should look like this:

```ts fresh.config.ts
import { defineConfig } from "$fresh/server.ts";
import twindPlugin from "$fresh/plugins/twind.ts";
import twindConfig from "./twind.config.ts";
import { Context } from "./routes/_middleware.ts";

await Context.init();

export default defineConfig({
  plugins: [twindPlugin(twindConfig)],
});
```

But what's going on in this new `_middleware.ts` we've created?

```ts routes/_middleware.ts
import { FreshContext } from "$fresh/server.ts";

export interface State {
  context: Context;
}

export class Context {
  private static context: Context;
  private complicatedStartupValue: number;

  public constructor() {
    console.log("i'm logged during initialization, and not during handling!");
    // presumably this involves connecting to a
    // database or doing some heavy computation
    this.complicatedStartupValue = 42;
  }

  public static async init() {
    Context.context = new Context();
  }

  public static instance() {
    if (this.context) return this.context;
    else throw new Error("Context is not initialized!");
  }
}

export async function handler(_req: Request, ctx: FreshContext<State>) {
  ctx.state.context = Context.instance();
  if (ctx.destination === "route") {
    console.log("i'm logged during a request!");
    console.log(ctx.state.context);
  }
  const resp = await ctx.next();
  return resp;
}
```

So now in this `handler` (or any other `handler` functions you create) you can have access to the complicated initialization step by calling `Context.instance()`.

## Proving it out

### Dev

When you run `deno task start` you should see the following output:

```txt Terminal output
Task start deno run -A --watch=static/,routes/ dev.ts
Watcher Process started.
i'm logged during initialization, and not during handling!
The manifest has been generated for 6 routes and 1 islands.

 🍋 Fresh ready
    Local: http://localhost:8000/
```

Going to `http://localhost:8000/` should produce:

```txt Terminal output
i'm logged during a request!
Context { complicatedStartupValue: 42 }
```

### Build

When you run `deno task build` you should see:

```txt Terminal output
Task build deno run -A dev.ts build
i'm logged during initialization, and not during handling!
The manifest has been generated for 6 routes and 1 islands.
Assets written to: /path/to/my/project/_fresh
```

There's no handling of routes associated with this, but note that the initialization occurred.

### Preview

Finally when you run `deno task preview` you should see:

```txt Terminal output
Task preview deno run -A main.ts
i'm logged during initialization, and not during handling!
Using snapshot found at /Users/reed/code/temp/1763/_fresh

 🍋 Fresh ready
    Local: http://localhost:8000/
```

Going to `http://localhost:8000/` should produce:

```txt Terminal output
i'm logged during a request!
Context { complicatedStartupValue: 42 }
```
