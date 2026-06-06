import type { Builder, ResolvedBuildConfig } from "fresh/dev";
import tailwindCss, { type Config } from "tailwindcss";
import postcss from "postcss";
import cssnano from "cssnano";
import autoprefixer from "autoprefixer";
import * as path from "@std/path";

/**
 * @deprecated Use the Vite plugin with `@tailwindcss/vite` instead.
 */
export interface AutoprefixerOptions {
  /** environment for `Browserslist` */
  env?: string;

  /** should Autoprefixer use Visual Cascade, if CSS is uncompressed */
  cascade?: boolean;

  /** should Autoprefixer add prefixes. */
  add?: boolean;

  /** should Autoprefixer [remove outdated] prefixes */
  remove?: boolean;

  /** should Autoprefixer add prefixes for @supports parameters. */
  supports?: boolean;

  /** should Autoprefixer add prefixes for flexbox properties */
  flexbox?: boolean | "no-2009";

  /** should Autoprefixer add IE 10-11 prefixes for Grid Layout properties */
  grid?: boolean | "autoplace" | "no-autoplace";

  /** custom usage statistics for > 10% in my stats browsers query */
  stats?: {
    [browser: string]: {
      [version: string]: number;
    };
  };

  /**
   * list of queries for target browsers.
   * Try to not use it.
   * The best practice is to use `.browserslistrc` config or `browserslist` key in `package.json`
   * to share target browsers with Babel, ESLint and Stylelint
   */
  overrideBrowserslist?: string | string[];

  /** do not raise error on unknown browser version in `Browserslist` config. */
  ignoreUnknownVersions?: boolean;
}

/**
 * @deprecated Use the Vite plugin with `@tailwindcss/vite` instead.
 */
export interface TailwindPluginOptions {
  autoprefixer?: AutoprefixerOptions;
}

/**
 * @deprecated Use the Vite plugin with `@tailwindcss/vite` instead.
 * This plugin is only compatible with the legacy Builder API.
 */
export function tailwind(
  builder: Builder,
  options: TailwindPluginOptions = {},
): void {
  const processor = initTailwind(builder.config, options);

  builder.onTransformStaticFile(
    { pluginName: "tailwind", filter: /\.css$/ },
    async (args) => {
      const instance = await processor;
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

const CONFIG_EXTENSIONS = ["ts", "js", "mjs"];

async function findTailwindConfigFile(directory: string): Promise<string> {
  let dir = directory;
  while (true) {
    for (let i = 0; i < CONFIG_EXTENSIONS.length; i++) {
      const ext = CONFIG_EXTENSIONS[i];
      const filePath = path.join(dir, `tailwind.config.${ext}`);
      try {
        const stat = await Deno.stat(filePath);
        if (stat.isFile) {
          return filePath;
        }
      } catch (err) {
        if (!(err instanceof Deno.errors.NotFound)) {
          throw err;
        }
      }
    }

    const parent = path.dirname(dir);
    if (parent === dir) {
      throw new Error(
        `Could not find a tailwind config file in the current directory or any parent directory.`,
      );
    }

    dir = parent;
  }
}

async function initTailwind(
  config: ResolvedBuildConfig,
  options: TailwindPluginOptions,
): Promise<postcss.Processor> {
  const root = config.root;

  const configPath = await findTailwindConfigFile(root);
  const url = path.toFileUrl(configPath).href;
  const tailwindConfig = (await import(url)).default as Config;

  if (!Array.isArray(tailwindConfig.content)) {
    throw new Error(`Expected tailwind "content" option to be an array`);
  }

  // deno-lint-ignore no-explicit-any
  tailwindConfig.content = tailwindConfig.content.map((pattern: any) => {
    if (typeof pattern === "string") {
      const relative = path.relative(Deno.cwd(), path.dirname(configPath));

      if (!relative.startsWith("..")) {
        return path.join(relative, pattern);
      }
    }
    return pattern;
  });

  // PostCSS types cause deep recursion
  const plugins = [
    // deno-lint-ignore no-explicit-any
    tailwindCss(tailwindConfig) as any,
    // deno-lint-ignore no-explicit-any
    autoprefixer(options.autoprefixer) as any,
  ];

  if (config.mode === "production") {
    plugins.push(cssnano());
  }

  return postcss(plugins);
}
