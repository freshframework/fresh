import type { Builder } from "fresh/dev";
import twPostcss from "@tailwindcss/postcss";
import postcss from "postcss";
import type { TailwindPluginOptions } from "./types.ts";

/**
 * @deprecated Use the Vite plugin with `@tailwindcss/vite` instead.
 */
export type { TailwindPluginOptions } from "./types.ts";

/**
 * @deprecated Use the Vite plugin with `@tailwindcss/vite` instead.
 * This plugin is only compatible with the legacy Builder API.
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
