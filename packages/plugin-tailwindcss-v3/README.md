# Tailwind CSS v3 plugin for Fresh

A Tailwind CSS v3 plugin to use in Fresh.

> [info]: If you want to use latest tailwindcss use `@fresh/plugin-tailwindcss`
> instead.

## Basic Usage

```ts
// dev.ts
import { Builder } from "fresh/dev";
import { tailwind } from "@fresh/plugin-tailwind-v3";

const builder = new Builder();
tailwind(builder);

if (Deno.args.includes("build")) {
  builder.build();
} else {
  builder.listen(() => import("./main.ts"));
}
```

## Option Configuration

```ts
tailwind(builder, {
  // Exclude certain files from processing
  exclude: ["/admin/**", "*.temp.css"],

  // Force optimization (defaults to production mode)
  optimize: true,

  // Exclude base styles
  base: null,
});
```

To learn more about Fresh go to [https://usefresh.dev/](https://usefresh.dev/).
