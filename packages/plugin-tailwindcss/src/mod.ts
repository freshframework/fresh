import type { Builder } from "fresh/dev";
import * as twPostcss from "@tailwindcss/postcss";
import postcss from "postcss";
import type { TailwindPluginOptions } from "./types.ts";

// Re-export types for public API
export type { TailwindPluginOptions } from "./types.ts";

export function tailwind(
  builder: Builder,
  options: TailwindPluginOptions = {},
): void {
  const { exclude, ...tailwindOptions } = options;
  const instance = postcss(twPostcss.default({
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
