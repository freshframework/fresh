// deno-lint-ignore-file no-console
import * as colors from "@std/fmt/colors";
import * as path from "@std/path";
import * as semver from "@std/semver";
import initConfig from "../deno.json" with { type: "json" };

// Keep these as is, as we replace these version in our release script
const FRESH_VERSION = "2.3.3";
const FRESH_TAILWIND_VERSION = "1.0.0";
const FRESH_VITE_PLUGIN = "1.1.2";
const PREACT_VERSION = "10.29.1";
const PREACT_SIGNALS_VERSION = "2.9.0";
const TAILWINDCSS_VERSION = "4.1.10";
const TAILWINDCSS_POSTCSS_VERSION = "4.1.10";
const POSTCSS_VERSION = "8.5.6";

function css(strs: TemplateStringsArray, ...exprs: string[]): string {
  let out = "";

  for (let i = 0; i < exprs.length; i++) {
    out += strs[i];
    out += String(exprs[i]);
  }
  out += strs.at(-1) ?? "";

  return out;
}

export class InitError extends Error {}

function error(message: string): never {
  console.error(`%cerror%c: ${message}`, "color: red; font-weight: bold", "");
  throw new InitError();
}

export const HELP_TEXT = `
${
  colors.bgRgb8(
    colors.rgb8(
      ` 🍋 @fresh/init${colors.rgb8(`@${initConfig.version}`, 248)} `,
      0,
    ),
    121,
  )
}

Initialize a new Fresh project. This will create all the necessary files
for a new project.

To generate a project in the './foobar' subdirectory:
    ${colors.rgb8("deno run -Ar jsr:@fresh/init ./foobar", 245)}

To generate a project in the current directory:
    ${colors.rgb8("deno run -Ar jsr:@fresh/init .", 245)}

${colors.rgb8("USAGE:", 3)}
    ${colors.rgb8("deno run -Ar jsr:@fresh/init [DIRECTORY]", 245)}

${colors.rgb8("OPTIONS:", 3)}
    ${colors.rgb8("--force", 2)}      Overwrite existing files
    ${colors.rgb8("--tailwind", 2)}   Use Tailwind for styling
    ${colors.rgb8("--vscode", 2)}     Setup project for VS Code
    ${colors.rgb8("--docker", 2)}     Setup Project to use Docker
    ${colors.rgb8("--builder", 2)}    Setup with builder instead of vite
    ${colors.rgb8("--help, -h", 2)}   Show this help message
`;

export const CONFIRM_EMPTY_MESSAGE =
  "The target directory is not empty (files could get overwritten). Do you want to continue anyway?";
export const CONFIRM_TAILWIND_MESSAGE = `Set up ${
  colors.cyan("Tailwind CSS")
} for styling?`;
export const CONFIRM_VSCODE_MESSAGE = `Do you use ${colors.cyan("VS Code")}?`;
export const CONFIRM_VITE_MESSAGE = `Set up ${
  colors.cyan("Vite")
} for build tooling?`;

export async function initProject(
  cwd = Deno.cwd(),
  input: (string | number)[],
  flags: {
    docker?: boolean | null;
    force?: boolean | null;
    tailwind?: boolean | null;
    vscode?: boolean | null;
    builder?: boolean | null;
    help?: boolean | null;
    h?: boolean | null;
    skipInstall?: boolean | null;
  } = {},
): Promise<void> {
  const freshVersion = await getLatestVersion("@fresh/core", FRESH_VERSION);

  if (flags.help || flags.h) {
    console.log(HELP_TEXT);
    return;
  }

  console.log();
  console.log(
    colors.bgRgb8(
      colors.rgb8(" 🍋 Fresh: The next-gen web framework. ", 0),
      121,
    ),
  );
  console.log(`    version ${colors.rgb8(freshVersion, 4)}`);
  console.log();

  let unresolvedDirectory;
  if (input.length !== 1) {
    const userInput = prompt(
      "Project Name:",
      "fresh-project",
    );
    if (!userInput) {
      error(HELP_TEXT);
    }

    unresolvedDirectory = userInput;
  } else {
    unresolvedDirectory = String(input[0]);
  }

  const projectDir = path.resolve(cwd, unresolvedDirectory);

  try {
    const dir = [...Deno.readDirSync(projectDir)];
    const isEmpty = dir.length === 0 ||
      dir.length === 1 && dir[0].name === ".git";
    if (
      !isEmpty &&
      !(flags.force === null ? confirm(CONFIRM_EMPTY_MESSAGE) : flags.force)
    ) {
      error("Directory is not empty.");
    }
  } catch (err) {
    if (!(err instanceof Deno.errors.NotFound)) {
      throw err;
    }
  }

  const useVite = !flags.builder;

  const useDocker = flags.docker;
  let useTailwind = flags.tailwind || false;
  if (flags.tailwind == null) {
    if (
      confirm(CONFIRM_TAILWIND_MESSAGE)
    ) {
      useTailwind = true;
    }
  }

  const useVSCode = flags.vscode == null
    ? confirm(CONFIRM_VSCODE_MESSAGE)
    : flags.vscode;

  const writeFile = async (
    pathname: string,
    content:
      | string
      | Uint8Array
      | ReadableStream<Uint8Array>
      | Record<string, unknown>,
  ) => await writeProjectFile(projectDir, pathname, content);

  const GITIGNORE = `# dotenv environment variable files
.env
.env.development.local
.env.test.local
.env.production.local
.env.local

# Fresh build directory
_fresh/
# npm + other dependencies
node_modules/
vendor/
`;

  await writeFile(".gitignore", GITIGNORE);

  if (useDocker) {
    const DENO_VERSION = Deno.version.deno;
    const DOCKERFILE_TEXT = `
FROM denoland/deno:${DENO_VERSION}

ARG GIT_REVISION
ENV DENO_DEPLOYMENT_ID=\${GIT_REVISION}

WORKDIR /app

COPY . .
RUN deno cache _fresh/server.js

EXPOSE 8000

CMD ["serve", "-A", "_fresh/server.js"]

`;
    await writeFile("Dockerfile", DOCKERFILE_TEXT);
  }

  // deno-fmt-ignore
  const GRADIENT_CSS = css`.fresh-gradient {
  background-color: rgb(134, 239, 172);
  background-image: linear-gradient(
    to right bottom,
    rgb(219, 234, 254),
    rgb(187, 247, 208),
    rgb(254, 249, 195)
  );
}`;
  // deno-fmt-ignore
  const NO_TAILWIND_STYLES = css`*,
*::before,
*::after {
  box-sizing: border-box;
}
* {
  margin: 0;
}
button {
  color: inherit;
}
button, [role="button"] {
  cursor: pointer;
}
code {
  font-family:
    ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono",
    "Courier New", monospace;
  font-size: 1em;
}
img,
svg {
  display: block;
}
img,
video {
  max-width: 100%;
  height: auto;
}

html {
  line-height: 1.5;
  -webkit-text-size-adjust: 100%;
  font-family:
    ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI",
    Roboto, "Helvetica Neue", Arial, "Noto Sans", sans-serif,
    "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol",
    "Noto Color Emoji";
}
.transition-colors {
  transition-property: background-color, border-color, color, fill, stroke;
  transition-timing-function: cubic-bezier(0.4, 0, 0.2, 1);
  transition-duration: 150ms;
}
.my-6 {
  margin-bottom: 1.5rem;
  margin-top: 1.5rem;
}
.text-4xl {
  font-size: 2.25rem;
  line-height: 2.5rem;
}
.mx-2 {
  margin-left: 0.5rem;
  margin-right: 0.5rem;
}
.my-4 {
  margin-bottom: 1rem;
  margin-top: 1rem;
}
.mx-auto {
  margin-left: auto;
  margin-right: auto;
}
.px-4 {
  padding-left: 1rem;
  padding-right: 1rem;
}
.py-8 {
  padding-bottom: 2rem;
  padding-top: 2rem;
}
.bg-\\[\\#86efac\\] {
  background-color: #86efac;
}
.text-3xl {
  font-size: 1.875rem;
  line-height: 2.25rem;
}
.py-6 {
  padding-bottom: 1.5rem;
  padding-top: 1.5rem;
}
.px-2 {
  padding-left: 0.5rem;
  padding-right: 0.5rem;
}
.py-1 {
  padding-bottom: 0.25rem;
  padding-top: 0.25rem;
}
.border-gray-500 {
  border-color: #6b7280;
}
.bg-white {
  background-color: #fff;
}
.flex {
  display: flex;
}
.gap-8 {
  grid-gap: 2rem;
  gap: 2rem;
}
.font-bold {
  font-weight: 700;
}
.max-w-screen-md {
  max-width: 768px;
}
.flex-col {
  flex-direction: column;
}
.items-center {
  align-items: center;
}
.justify-center {
  justify-content: center;
}
.border-2 {
  border-width: 2px;
}
.rounded-sm {
  border-radius: 0.25rem;
}
.hover\\:bg-gray-200:hover {
  background-color: #e5e7eb;
}
.tabular-nums {
  font-variant-numeric: tabular-nums;
}
.min-h-screen {
  min-height: 100vh;
}

${GRADIENT_CSS}`;
  // deno-fmt-ignore
  const TAILWIND_CSS = css`@import "tailwindcss";
${GRADIENT_CSS}`;

  const cssStyles = useTailwind ? TAILWIND_CSS : NO_TAILWIND_STYLES;

  if (useVite) {
    await writeFile("assets/styles.css", cssStyles);
    await writeFile(
      "client.ts",
      `// Import CSS files here for hot module reloading to work.
import "./assets/styles.css";`,
    );
  } else {
    await writeFile("static/styles.css", cssStyles);
  }
  // deno-fmt-ignore
  const STATIC_LOGO =
    `<svg width="40" height="40" fill="none" xmlns="http://www.w3.org/2000/svg">
  <path
    d="M34.092 8.845C38.929 20.652 34.092 27 30 30.5c1 3.5-2.986 4.222-4.5 2.5-4.457 1.537-13.512 1.487-20-5C2 24.5 4.73 16.714 14 11.5c8-4.5 16-7 20.092-2.655Z"
    fill="#FFDB1E"
  />
  <path
    d="M14 11.5c6.848-4.497 15.025-6.38 18.368-3.47C37.5 12.5 21.5 22.612 15.5 25c-6.5 2.587-3 8.5-6.5 8.5-3 0-2.5-4-5.183-7.75C2.232 23.535 6.16 16.648 14 11.5Z"
    fill="#fff"
    stroke="#FFDB1E"
  />
  <path
    d="M28.535 8.772c4.645 1.25-.365 5.695-4.303 8.536-3.732 2.692-6.606 4.21-7.923 4.83-.366.173-1.617-2.252-1.617-1 0 .417-.7 2.238-.934 2.326-1.365.512-4.223 1.29-5.835 1.29-3.491 0-1.923-4.754 3.014-9.122.892-.789 1.478-.645 2.283-.645-.537-.773-.534-.917.403-1.546C17.79 10.64 23 8.77 25.212 8.42c.366.014.82.35.82.629.41-.14 2.095-.388 2.503-.278Z"
    fill="#FFE600"
  />
  <path
    d="M14.297 16.49c.985-.747 1.644-1.01 2.099-2.526.566.121.841-.08 1.29-.701.324.466 1.657.608 2.453.701-.715.451-1.057.852-1.452 2.106-1.464-.611-3.167-.302-4.39.42Z"
    fill="#fff"
  />
</svg>`;
  await writeFile("static/logo.svg", STATIC_LOGO);

  try {
    const res = await fetch("https://fresh.deno.dev/favicon.ico");
    const buf = await res.arrayBuffer();
    await writeFile("static/favicon.ico", new Uint8Array(buf));
  } catch {
    // Skip this and be silent if there is a network issue.
  }

  const MAIN_TS = `import { App, staticFiles } from "fresh";
import { define, type State } from "./utils.ts";

export const app = new App<State>();

app.use(staticFiles());

// Pass a shared value from a middleware
app.use(async (ctx) => {
  ctx.state.shared = "hello";
  return await ctx.next();
});

// this is the same as the /api/:name route defined via a file. feel free to delete this!
app.get("/api2/:name", (ctx) => {
  const name = ctx.params.name;
  return new Response(
    \`Hello, \${name.charAt(0).toUpperCase() + name.slice(1)}!\`,
  );
});

// this can also be defined via a file. feel free to delete this!
const exampleLoggerMiddleware = define.middleware((ctx) => {
  console.log(\`\${ctx.req.method} \${ctx.req.url}\`);
  return ctx.next();
});
app.use(exampleLoggerMiddleware);

// Include file-system based routes here
app.fsRoutes();`;
  await writeFile("main.ts", MAIN_TS);

  const COMPONENTS_BUTTON_TSX =
    `import type { ComponentChildren } from "preact";

export interface ButtonProps {
  id?: string;
  onClick?: () => void;
  children?: ComponentChildren;
  disabled?: boolean;
}

export function Button(props: ButtonProps) {
  return (
    <button
      {...props}
      class="px-2 py-1 border-gray-500 border-2 rounded-sm bg-white hover:bg-gray-200 transition-colors"
    />
  );
}`;
  await writeFile("components/Button.tsx", COMPONENTS_BUTTON_TSX);

  const UTILS_TS = `import { createDefine } from "fresh";

// This specifies the type of "ctx.state" which is used to share
// data among middlewares, layouts and routes.
export interface State {
  shared: string;
}

export const define = createDefine<State>();`;
  await writeFile("utils.ts", UTILS_TS);

  const ROUTES_HOME = `import { useSignal } from "@preact/signals";
import { Head } from "fresh/runtime";
import { define } from "../utils.ts";
import Counter from "../islands/Counter.tsx";

export default define.page(function Home(ctx) {
  const count = useSignal(3);

  console.log("Shared value " + ctx.state.shared);

  return (
    <div class="px-4 py-8 mx-auto fresh-gradient min-h-screen">
      <Head>
        <title>Fresh counter</title>
      </Head>
      <div class="max-w-screen-md mx-auto flex flex-col items-center justify-center">
        <img
          class="my-6"
          src="/logo.svg"
          width="128"
          height="128"
          alt="the Fresh logo: a sliced lemon dripping with juice"
        />
        <h1 class="text-4xl font-bold">Welcome to Fresh</h1>
        <p class="my-4">
          Try updating this message in the
          <code class="mx-2">./routes/index.tsx</code> file, and refresh.
        </p>
        <Counter count={count} />
      </div>
    </div>
  );
});`;
  await writeFile("routes/index.tsx", ROUTES_HOME);

  const APP_WRAPPER = `import { define } from "../utils.ts";

export default define.page(function App({ Component }) {
  return (
    <html>
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>${path.basename(projectDir)}</title>${
    useVite ? "" : `\n        <link rel="stylesheet" href="/styles.css" />`
  }
      </head>
      <body>
        <Component />
      </body>
    </html>
  );
});`;
  await writeFile("routes/_app.tsx", APP_WRAPPER);

  const API_NAME = `import { define } from "../../utils.ts";

export const handler = define.handlers({
  GET(ctx) {
    const name = ctx.params.name;
    return new Response(
      \`Hello, \${name.charAt(0).toUpperCase() + name.slice(1)}!\`,
    );
  },
});`;
  await writeFile("routes/api/[name].tsx", API_NAME);

  const ISLANDS_COUNTER_TSX = `import type { Signal } from "@preact/signals";
import { Button } from "../components/Button.tsx";

interface CounterProps {
  count: Signal<number>;
}

export default function Counter(props: CounterProps) {
  return (
    <div class="flex gap-8 py-6">
      <Button id="decrement" onClick={() => props.count.value -= 1}>-1</Button>
      <p class="text-3xl tabular-nums">{props.count}</p>
      <Button id="increment" onClick={() => props.count.value += 1}>+1</Button>
    </div>
  );
}`;
  await writeFile("islands/Counter.tsx", ISLANDS_COUNTER_TSX);

  const DEV_TS = `#!/usr/bin/env -S deno run -A --watch=static/,routes/
${useTailwind ? `import { tailwind } from "@fresh/plugin-tailwind";\n` : ""}
import { Builder } from "fresh/dev";

const builder = new Builder();
${useTailwind ? "tailwind(builder);" : ""}
if (Deno.args.includes("build")) {
  await builder.build();
} else {
  await builder.listen(() => import("./main.ts"));
}`;

  if (!useVite) {
    await writeFile("dev.ts", DEV_TS);
  }

  const denoJson = {
    nodeModulesDir: "manual",
    tasks: {
      check: "deno fmt --check . && deno lint . && deno check",
      dev: "deno run -A --watch=static/,routes/ dev.ts",
      build: "deno run -A dev.ts build",
      start: "deno serve -A _fresh/server.js",
      update: "deno run -A -r jsr:@fresh/update .",
    },
    lint: {
      rules: {
        tags: ["fresh", "recommended"],
      },
    },
    exclude: ["**/_fresh/*"],
    imports: {
      "@/": "./",
      "fresh": `jsr:@fresh/core@^${freshVersion}`,
      "preact": `npm:preact@^${PREACT_VERSION}`,
      "@preact/signals": `npm:@preact/signals@^${PREACT_SIGNALS_VERSION}`,
    } as Record<string, string>,
    compilerOptions: {
      lib: ["dom", "dom.asynciterable", "dom.iterable", "deno.ns"],
      jsx: "precompile",
      jsxImportSource: "preact",
      jsxPrecompileSkipElements: [
        "a",
        "img",
        "source",
        "body",
        "html",
        "head",
        "title",
        "meta",
        "script",
        "link",
        "style",
        "base",
        "noscript",
        "template",
      ],
    } as Record<string, unknown>,
  };

  if (useVite) {
    denoJson.compilerOptions.types = ["vite/client"];
    denoJson.tasks.dev = "vite";
    denoJson.tasks.build = "vite build";

    const vitePluginVersion = await getLatestVersion(
      "@fresh/plugin-vite",
      FRESH_VITE_PLUGIN,
    );

    denoJson.imports["@fresh/plugin-vite"] =
      `jsr:@fresh/plugin-vite@^${vitePluginVersion}`;
    denoJson.imports["vite"] = "npm:vite@^7.1.3";
    denoJson.imports["@types/babel__core"] = "npm:@types/babel__core@^7.20.5";

    if (useTailwind) {
      denoJson.imports["tailwindcss"] =
        `npm:tailwindcss@^${TAILWINDCSS_VERSION}`;
      denoJson.imports["@tailwindcss/vite"] = `npm:@tailwindcss/vite@^4.1.12`;
    }
  } else if (useTailwind) {
    denoJson.imports["tailwindcss"] = `npm:tailwindcss@^${TAILWINDCSS_VERSION}`;
    denoJson.imports["@fresh/plugin-tailwind"] =
      `jsr:@fresh/plugin-tailwind@^${FRESH_TAILWIND_VERSION}`;
    denoJson.imports["@tailwindcss/postcss"] =
      `npm:@tailwindcss/postcss@^${TAILWINDCSS_POSTCSS_VERSION}`;
    denoJson.imports["postcss"] = `npm:postcss@^${POSTCSS_VERSION}`;
  }

  await writeFile("deno.json", denoJson);

  if (useVite) {
    let viteConfig = `import { defineConfig } from "vite";
import { fresh } from "@fresh/plugin-vite";\n`;

    if (useTailwind) {
      viteConfig += `import tailwindcss from "@tailwindcss/vite";\n`;
    }

    viteConfig += `\nexport default defineConfig({
  plugins: [fresh()${useTailwind ? ", tailwindcss()" : ""}],
});`;

    await writeFile("vite.config.ts", viteConfig);
  }

  const README_MD = `# Fresh project

Your new Fresh project is ready to go. You can follow the Fresh "Getting
Started" guide here: https://fresh.deno.dev/docs/getting-started

### Usage

Make sure to install Deno:
https://docs.deno.com/runtime/getting_started/installation

Then start the project in development mode:

\`\`\`
deno task dev
\`\`\`

This will watch the project directory and restart as necessary.`;
  await writeFile("README.md", README_MD);

  if (useVSCode) {
    const vscodeSettings = {
      "deno.enable": true,
      "deno.lint": true,
      "editor.defaultFormatter": "denoland.vscode-deno",
      "[typescriptreact]": {
        "editor.defaultFormatter": "denoland.vscode-deno",
      },
      "[typescript]": {
        "editor.defaultFormatter": "denoland.vscode-deno",
      },
      "[javascriptreact]": {
        "editor.defaultFormatter": "denoland.vscode-deno",
      },
      "[javascript]": {
        "editor.defaultFormatter": "denoland.vscode-deno",
      },
      "files.associations": useTailwind
        ? {
          "*.css": "tailwindcss",
        }
        : undefined,
    };

    await writeFile(".vscode/settings.json", vscodeSettings);

    const recommendations = ["denoland.vscode-deno"];
    if (useTailwind) recommendations.push("bradlc.vscode-tailwindcss");
    await writeFile(".vscode/extensions.json", { recommendations });
  }

  if (!flags.skipInstall) {
    console.log("Installing dependencies...");
    await new Deno.Command(Deno.execPath(), {
      cwd: unresolvedDirectory,
      args: ["install"],
    }).output();
    console.log("Installing dependencies...%cdone!", "color: green");
  }

  // Specifically print unresolvedDirectory, rather than resolvedDirectory in order to
  // not leak personal info (e.g. `/Users/MyName`)
  console.log(
    "\n%cProject initialized!\n",
    "color: green; font-weight: bold",
  );

  if (unresolvedDirectory !== ".") {
    console.log(
      `Enter your project directory using %ccd ${unresolvedDirectory}%c.`,
      "color: cyan",
      "",
    );
  }
  console.log(
    "Run %cdeno task dev%c to start the project. %cCTRL-C%c to stop.",
    "color: cyan",
    "",
    "color: cyan",
    "",
  );
  console.log();
  console.log(
    "Stuck? Join our Discord %chttps://discord.gg/deno",
    "color: cyan",
    "",
  );
  console.log();
  console.log(
    "%cHappy hacking! 🦕",
    "color: gray",
  );
}

async function writeProjectFile(
  projectDir: string,
  pathname: string,
  content:
    | string
    | Uint8Array
    | ReadableStream<Uint8Array>
    | Record<string, unknown>,
) {
  const filePath = path.join(
    projectDir,
    ...pathname.split("/").filter(Boolean),
  );
  try {
    await Deno.mkdir(
      path.dirname(filePath),
      { recursive: true },
    );
    if (typeof content === "string") {
      let formatted = content;
      if (!content.endsWith("\n\n")) {
        formatted += "\n";
      }
      await Deno.writeTextFile(filePath, formatted);
    } else if (
      content instanceof Uint8Array || content instanceof ReadableStream
    ) {
      await Deno.writeFile(filePath, content);
    } else {
      await Deno.writeTextFile(
        filePath,
        JSON.stringify(content, null, 2) + "\n",
      );
    }
  } catch (err) {
    if (!(err instanceof Deno.errors.AlreadyExists)) {
      throw err;
    }
  }
}

interface JsrMeta {
  scope: string;
  name: string;
  latest: string | null;
  versions: Record<string, unknown>;
}

async function getLatestVersion(
  pkg: string,
  fallback: string,
): Promise<string> {
  // deno-lint-ignore no-explicit-any
  if ((globalThis as any).INIT_TEST) {
    return fallback;
  }

  try {
    const res = await fetch(`https://jsr.io/${pkg}/meta.json`);
    const json = (await res.json()) as JsrMeta;

    if (json.latest !== null) {
      return json.latest;
    }

    const versions = Object.keys(json.versions);
    if (versions.length === 0) throw new Error("No versions");

    versions.sort((a, b) => {
      const s1 = semver.parse(a);
      const s2 = semver.parse(b);
      return semver.compare(s1, s2);
    });

    return versions.at(-1)!;
  } catch {
    console.log(
      `Could not fetch latest ${pkg} version. Falling back to: ${fallback}`,
    );
    return fallback;
  }
}
