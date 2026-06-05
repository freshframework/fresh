import type { OnTransformOptions } from "fresh/dev";

/**
 * Internal option shape forwarded to `@tailwindcss/postcss`. Consumers should
 * use {@linkcode TailwindPluginOptions} instead.
 */
type PluginOptions = {
  /**
   * Base CSS to be included. Set to `null` to exclude base styles.
   */
  base?: string;
  /**
   * Enable or disable CSS optimization. Defaults to `true` when Fresh is
   * running in production mode and `false` otherwise. Pass an object to
   * fine-tune minification behavior.
   *
   * @default {builder.config.mode === "production"}
   */
  optimize?: boolean | {
    minify?: boolean;
  };
};

/**
 * Options accepted by the {@linkcode tailwind} plugin.
 *
 * @example Exclude an admin route and force optimization
 * ```ts
 * import { Builder } from "fresh/dev";
 * import { tailwind } from "@fresh/plugin-tailwind";
 *
 * const builder = new Builder();
 * tailwind(builder, {
 *   exclude: ["/admin/**", "*.temp.css"],
 *   optimize: true,
 * });
 * ```
 */
export interface TailwindPluginOptions extends PluginOptions {
  /**
   * Paths or glob patterns that should be skipped by the Tailwind transform.
   * Forwarded to {@linkcode Builder.onTransformStaticFile}.
   */
  exclude?: OnTransformOptions["exclude"];
}
