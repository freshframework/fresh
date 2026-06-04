# Tailwind CSS plugin for Fresh

A Tailwind CSS plugin to use in Fresh.

## Basic Usage

```ts
// dev.ts
import { Builder } from "fresh/dev";
import { app } from "./main.ts";
import { tailwind } from "@fresh/plugin-tailwind";

const builder = new Builder();
tailwind(builder, app);

if (Deno.args.includes("build")) {
  builder.build(app);
} else {
  builder.listen(app);
}
```

## Option Configuration

```ts
// dev.ts
import { Builder } from "fresh/dev";
import { app } from "./main.ts";
import { tailwind } from "@fresh/plugin-tailwind";

const builder = new Builder();
tailwind(builder, app, {
  // Exclude certain files from processing
  exclude: ["/admin/**", "*.temp.css"],

  // Force optimization (defaults to production mode)
  optimize: true,

  // Exclude base styles
  base: null,
});

if (Deno.args.includes("build")) {
  builder.build(app);
} else {
  builder.listen(app);
}
```

To learn more about Fresh go to [https://usefresh.dev/](https://usefresh.dev/).
