---
description: |
  Migrating from twind to Tailwind CSS
---

Starting with version 1.6 Fresh comes with a proper Tailwind CSS plugin out of
the box. When you create a new Fresh project, checking the Tailwind CSS option
will now install the Tailwind CSS plugin instead of twind like it did before.

## Requirements before migrating

The tailwind plugin requires Fresh's
[ahead of time builds](/docs/1.x/concepts/ahead-of-time-builds) to be set up,
otherwise it won't work. Make sure to switch your projects to ahead of time
builds in your project before continuing this guide. If your project is already
configured to use ahead of time builds, then you're good to go.

## Migrating to Tailwind CSS

1. Create a `<project>/tailwind.config.ts` file in your project folder:

```ts tailwind.config.ts
import { type Config } from "tailwindcss";

export default {
  content: ["{routes,islands,components}/**/*.{ts,tsx}"],
} satisfies Config;
```

2. Create a css file in your static directory `<project>/static/styles.css`:

```css static/styles.css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

3. Add the created stylesheet in your HTML in `<project>/routes/_app.tsx`:

```diff routes/_app.tsx
  import { AppProps } from "$fresh/server.ts";

  export default function App({ Component }: AppProps) {
    return (
      <html>
        <head>
          <meta charset="utf-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1.0" />
          <title>My Fresh Project</title>
+         <link rel="stylesheet" href="/styles.css" />
        </head>
        <body>
          <Component />
      </body>
      </html>
    );
  }
```

4. Replace the `twind` plugin with `tailwind`

```diff fresh.config.ts
  import { defineConfig } from "$fresh/server.ts";
- import twind from "$fresh/plugins/twind.ts";
+ import tailwind from "$fresh/plugins/tailwind.ts";

  export default defineConfig({
-   plugins: [twind()],
+   plugins: [tailwind()],
  });
```

5. Update your `deno.json` file and add the following `tailwindcss` imports. To
   make the
   [vscode Tailwind CSS extension](https://marketplace.visualstudio.com/items?itemName=bradlc.vscode-tailwindcss)
   work, we also need to set `"nodeModulesDir": "manual"`. This will create a
   `node_modules` directory in your project folder when you run `deno install`.

```diff deno.json
  {
+   "nodeModulesDir": "manual",
    "imports": {
      "$fresh/": "https://deno.land/x/fresh@1.5.2/",
      "preact": "https://esm.sh/preact@10.22.0",
      "preact/": "https://esm.sh/preact@10.22.0/",
-     "twind": "https://esm.sh/twind@0.16.19",
-     "twind/": "https://esm.sh/twind@0.16.19/"
+     "tailwindcss": "npm:tailwindcss@3.4.1"
    }
  }
```

6. Add `node_modules` to your `.gitignore` or create one if the file is not
   present in your project root directory.

```diff .gitignore
+ node_modules/
```

That's it! Now you can use Tailwind CSS in your project.

> [info]: If you're a vscode user, be sure to install the
> [official Tailwind CSS extension](https://marketplace.visualstudio.com/items?itemName=bradlc.vscode-tailwindcss)
> to get full intellisense support. For it to work you also need to set
> `"nodeModulesDir": "manual"` in your `deno.json`.

> [warn]: Tailwind CSS doesn't support the grouping syntax from twind:
> `text(lg uppercase gray-100)`. These need to be rewritten to their expanded
> values like `text-lg uppercase text-gray-100`. Selecting `data-*` or `aria-*`
> attributes works a little different with Tailwind CSS as well.
>
> | Twind                       | Tailwind CSS                |
> | --------------------------- | --------------------------- |
> | `[data-current]:bg-red-600` | `data-[current]:bg-red-300` |
> | `[aria-current]:bg-red-600` | `aria-[current]:bg-red-300` |

> [warn]: Tailwind CSS does not allow you to generate and apply CSS classes
> dynamically, which means you need to explicitly specify the class you want to
> apply. In other words, to use dynamic classes, you need to ensure that they
> are present in the final CSS file.
>
> | Twind                               | Tailwind CSS                                                   |
> | ----------------------------------- | -------------------------------------------------------------- |
> | ``<a class={`link-${color}`}></a>`` | ``<a class={color === 'blue' ?`link-blue`:`link-green`}></a>`` |

## Frequently Asked Questions (FAQ)

### What are the differences between twind and Tailwind CSS?

Twind is a project that tries to enable you to use Tailwind-like styling
capabilities in a single script that can also be used in the browser. The key
difference between the two is that twind generates CSS on the fly on every
request and was shipped to the browser to make newly generated classes by
islands work in Fresh. Overall, this wasn't an ideal setup for building
performant sites.

In contrast to that, Tailwind CSS extracts generates the resulting CSS file
ahead of time, which only happens once per deployment. There is no runtime
component needed, which makes your Fresh project respond faster to requests.

During the Tailwind CSS v2 days twind pushed a lot of great ideas like allowing
any number to be used for classes like `opacity-82` and others, but it hasn't
kept up with recent developments of Tailwind CSS. In fact, twind has been
unmaintained for more than a year by now. We never could get autocompletion with
twind to work either.

### Why did Fresh use twind instead of Tailwind CSS?

When Fresh was originally built, Deno didn't support npm modules or node APIs.
This meant that Tailwind CSS didn't work with Deno. Now, many years later, Deno
does ship with support for both of that and we can use the same npm
`tailwindcss` module as everyone else.
