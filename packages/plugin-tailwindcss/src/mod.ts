/**
 * Tailwind CSS v4 plugin for Fresh.
 *
 * Registers a static-file transform on the supplied {@linkcode Builder} that
 * runs `.css` files through `@tailwindcss/postcss`. CSS is optimized
 * automatically when Fresh is in production mode.
 *
 * @example
 * ```ts
 * // dev.ts
 * import { Builder } from "fresh/dev";
 * import { app } from "./main.ts";
 * import { tailwind } from "@fresh/plugin-tailwind";
 *
 * const builder = new Builder();
 * tailwind(builder);
 *
 * if (Deno.args.includes("build")) {
 *   await builder.build(app);
 * } else {
 *   await builder.listen(app);
 * }
 * ```
 *
 * @module
 */

import type { Builder } from "fresh/dev";
import twPostcss from "@tailwindcss/postcss";
import postcss from "postcss";
import type { TailwindPluginOptions } from "./types.ts";

// Re-export types for public API
export type { TailwindPluginOptions } from "./types.ts";

/**
 * Register the Tailwind CSS v4 transform on a Fresh {@linkcode Builder}.
 *
 * The plugin attaches a `.css` static-file transform that processes stylesheets
 * with `@tailwindcss/postcss`. When `builder.config.mode === "production"` the
 * default `optimize` setting is `true`; in development it is `false`. Either
 * default can be overridden via `options.optimize`.
 *
 * Files matched by `options.exclude` are passed through untouched, which is
 * useful for routes or partials that ship their own CSS.
 *
 * @param builder The Fresh dev builder to attach the transform to.
 * @param options Optional Tailwind and exclusion settings. See
 *                {@linkcode TailwindPluginOptions}.
 *
 * @example Basic usage
 * ```ts
 * import { Builder } from "fresh/dev";
 * import { tailwind } from "@fresh/plugin-tailwind";
 *
 * const builder = new Builder();
 * tailwind(builder);
 * ```
 *
 * @example Customize options
 * ```ts
 * import { Builder } from "fresh/dev";
 * import { tailwind } from "@fresh/plugin-tailwind";
 *
 * const builder = new Builder();
 * tailwind(builder, {
 *   exclude: ["/admin/**", "*.temp.css"],
 *   optimize: { minify: true },
 * });
 * ```
 */
export function tailwind(
  builder: Builder,
  options: TailwindPluginOptions = {},
): void {
  const { exclude, ...tailwindOptions } = options;
  const instance = postcss(twPostcss({
    optimize: builder.config.mode === "production",
    ...tailwindOptions,
  }));

  builder.onTransformStaticFile(
    { pluginName: "tailwind", filter: /\.css$/, exclude },
    async (args) => {
      const res = await instance.process(args.text, {
        from: args.path,
      });
      return {
        content: res.content,
        map: res.map?.toString(),
      };
    },
  );
}
