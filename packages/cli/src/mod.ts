// deno-lint-ignore-file no-console
import { parseArgs } from "@std/cli/parse-args";
import * as colors from "@std/fmt/colors";
import { generateCommand } from "./commands/generate.ts";
import { devCommand } from "./commands/dev.ts";
import { buildCommand } from "./commands/build.ts";
import { startCommand } from "./commands/start.ts";
import { initCommand } from "./commands/init.ts";
import { routesCommand } from "./commands/routes.ts";

const VERSION = "0.1.0";

const HELP = `
${
  colors.bgRgb8(
    colors.rgb8(` 🍋 fresh cli ${colors.rgb8(`v${VERSION}`, 248)} `, 0),
    121,
  )
}

${colors.bold("Usage:")} fresh <command> [options]

${colors.bold("Commands:")}
  init [dir]             Create a new Fresh project
  dev                    Start the development server
  build                  Build for production
  start                  Start the production server
  generate <type> <name> Generate a route, island, middleware, layout, api, or component
  routes                 List all routes in the project

${colors.bold("Generate types:")}
  route <path>           Create a page route          ${colors.dim("routes/<path>.tsx")}
  api <path>             Create an API route           ${colors.dim("routes/<path>.ts")}
  island <name>          Create an island component    ${colors.dim("islands/<name>.tsx")}
  middleware [path]       Create a middleware            ${colors.dim("routes/[path/]_middleware.ts")}
  layout [path]           Create a layout               ${colors.dim("routes/[path/]_layout.tsx")}
  component <name>       Create a server component     ${colors.dim("components/<name>.tsx")}

${colors.bold("Options:")}
  --help, -h             Show this help message
  --version, -V          Show version
  --dir <path>           Project root directory
  --force                Overwrite existing files (generate)
  --dry-run              Preview without writing (generate)
  --handler              Include handler (generate route)
  --port <port>          Port number (dev, start)
  --host <host>          Host to bind (dev)

${colors.bold("Examples:")}
  fresh init my-app
  fresh dev
  fresh generate route about
  fresh generate route users/[id] --handler
  fresh generate api users
  fresh generate island SearchBar
  fresh generate middleware admin
  fresh routes
  fresh build
  fresh start
`;

const args = parseArgs(Deno.args, {
  boolean: ["help", "version", "force", "dry-run", "handler"],
  string: ["dir", "port", "host"],
  alias: {
    h: "help",
    V: "version",
    f: "force",
    n: "dry-run",
    p: "port",
  },
});

const command = args._[0] as string | undefined;
const rest = args._.slice(1).map(String);

if (args.version) {
  console.log(`fresh ${VERSION}`);
  Deno.exit(0);
}

if (args.help && !command) {
  console.log(HELP);
  Deno.exit(0);
}

switch (command) {
  case "init":
    await initCommand(rest);
    break;

  case "dev":
    await devCommand({
      port: args.port,
      host: args.host,
      dir: args.dir,
    });
    break;

  case "build":
    await buildCommand({ dir: args.dir });
    break;

  case "start":
    await startCommand({
      port: args.port,
      dir: args.dir,
    });
    break;

  case "generate":
  case "gen":
  case "g":
    generateCommand(rest, {
      handler: args.handler,
      force: args.force,
      "dry-run": args["dry-run"],
      dir: args.dir,
    });
    break;

  case "routes":
    routesCommand({ dir: args.dir });
    break;

  case undefined:
    console.log(HELP);
    break;

  default:
    console.error(
      `${colors.red(colors.bold("error"))}: Unknown command: ${command}`,
    );
    console.error(`Run ${colors.bold("fresh --help")} for available commands.`);
    Deno.exit(1);
}
