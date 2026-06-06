// deno-lint-ignore-file no-console
import * as path from "@std/path";
import * as colors from "@std/fmt/colors";
import {
  checkCollisions,
  computeUtilsImport,
  error,
  findProjectRoot,
  toPascalCase,
  warn,
  writeFile,
} from "../utils.ts";
import { routeTemplate } from "../templates/route.ts";
import { apiTemplate } from "../templates/api.ts";
import { islandTemplate } from "../templates/island.ts";
import { middlewareTemplate } from "../templates/middleware.ts";
import { layoutTemplate } from "../templates/layout.ts";
import { componentTemplate } from "../templates/component.ts";

export interface GenerateFlags {
  handler: boolean;
  force: boolean;
  "dry-run": boolean;
  dir: string | undefined;
}

const GENERATOR_TYPES = [
  "route",
  "island",
  "middleware",
  "layout",
  "api",
  "component",
] as const;

type GeneratorType = typeof GENERATOR_TYPES[number];

export function generateCommand(
  args: string[],
  flags: GenerateFlags,
): void {
  const type = args[0] as GeneratorType | undefined;
  const name = args[1];

  if (!type) {
    console.log(`
${colors.bold("Usage:")} fresh generate <type> <name> [options]

${colors.bold("Types:")}
  route <path>        Create a page route          ${colors.dim("routes/<path>.tsx")}
  api <path>          Create an API route           ${colors.dim("routes/<path>.ts")}
  island <name>       Create an island component    ${colors.dim("islands/<name>.tsx")}
  middleware [path]    Create a middleware            ${colors.dim("routes/[path/]_middleware.ts")}
  layout [path]        Create a layout               ${colors.dim("routes/[path/]_layout.tsx")}
  component <name>    Create a server component     ${colors.dim("components/<name>.tsx")}

${colors.bold("Options:")}
  --handler            Include a handler (route only)
  --force              Overwrite existing files
  --dry-run            Preview without writing files
  --dir <path>         Project root directory

${colors.bold("Examples:")}
  fresh generate route about
  fresh generate route users/[id] --handler
  fresh generate api users/[id]
  fresh generate island Counter
  fresh generate middleware admin
  fresh generate layout dashboard
  fresh generate component Button
`);
    return;
  }

  if (!GENERATOR_TYPES.includes(type)) {
    error(
      `Unknown generator type: ${type}\n  Available: ${GENERATOR_TYPES.join(", ")}`,
    );
  }

  // middleware and layout don't require a name (defaults to root)
  if (!name && type !== "middleware" && type !== "layout") {
    error(`Missing name argument. Usage: fresh generate ${type} <name>`);
  }

  const startDir = flags.dir ? path.resolve(flags.dir) : Deno.cwd();
  const projectRoot = findProjectRoot(startDir);
  if (!projectRoot) {
    error(
      "Could not find a Fresh project (no deno.json with a 'fresh' import).\n  Run this command from inside a Fresh project, or use --dir.",
    );
  }

  const writeOpts = { force: flags.force, dryRun: flags["dry-run"] };

  switch (type) {
    case "route":
      generateRoute(projectRoot, name, flags, writeOpts);
      break;
    case "api":
      generateApi(projectRoot, name, writeOpts);
      break;
    case "island":
      generateIsland(projectRoot, name, writeOpts);
      break;
    case "middleware":
      generateMiddleware(projectRoot, name ?? "", writeOpts);
      break;
    case "layout":
      generateLayout(projectRoot, name ?? "", writeOpts);
      break;
    case "component":
      generateComponent(projectRoot, name, writeOpts);
      break;
  }
}

function generateRoute(
  root: string,
  name: string,
  flags: GenerateFlags,
  writeOpts: { force: boolean; dryRun: boolean },
): void {
  const relPath = `routes/${name}.tsx`;
  const absPath = path.join(root, relPath);

  const collision = checkCollisions(relPath, root);
  if (collision) warn(collision);

  const componentName = toPascalCase(name.split("/").pop() ?? "Page");
  const utilsImport = computeUtilsImport(relPath);

  const content = routeTemplate({
    name: componentName,
    utilsImport,
    hasHandler: flags.handler,
  });

  writeFile(absPath, content, writeOpts);
}

function generateApi(
  root: string,
  name: string,
  writeOpts: { force: boolean; dryRun: boolean },
): void {
  const relPath = `routes/${name}.ts`;
  const absPath = path.join(root, relPath);

  const collision = checkCollisions(relPath, root);
  if (collision) warn(collision);

  const utilsImport = computeUtilsImport(relPath);
  const content = apiTemplate({ utilsImport });

  writeFile(absPath, content, writeOpts);
}

function generateIsland(
  root: string,
  name: string,
  writeOpts: { force: boolean; dryRun: boolean },
): void {
  const relPath = `islands/${name}.tsx`;
  const absPath = path.join(root, relPath);
  const componentName = toPascalCase(name.split("/").pop() ?? "Island");
  const content = islandTemplate({ name: componentName });

  writeFile(absPath, content, writeOpts);
}

function generateMiddleware(
  root: string,
  name: string,
  writeOpts: { force: boolean; dryRun: boolean },
): void {
  const dir = name ? `routes/${name}` : "routes";
  const relPath = `${dir}/_middleware.ts`;
  const absPath = path.join(root, relPath);
  const utilsImport = computeUtilsImport(relPath);
  const content = middlewareTemplate({ utilsImport });

  writeFile(absPath, content, writeOpts);
}

function generateLayout(
  root: string,
  name: string,
  writeOpts: { force: boolean; dryRun: boolean },
): void {
  const dir = name ? `routes/${name}` : "routes";
  const relPath = `${dir}/_layout.tsx`;
  const absPath = path.join(root, relPath);
  const utilsImport = computeUtilsImport(relPath);
  const componentName = name
    ? toPascalCase(name.split("/").pop() ?? "")
    : "Root";
  const content = layoutTemplate({ name: componentName, utilsImport });

  writeFile(absPath, content, writeOpts);
}

function generateComponent(
  root: string,
  name: string,
  writeOpts: { force: boolean; dryRun: boolean },
): void {
  const relPath = `components/${name}.tsx`;
  const absPath = path.join(root, relPath);
  const componentName = toPascalCase(name.split("/").pop() ?? "Component");
  const content = componentTemplate({ name: componentName });

  writeFile(absPath, content, writeOpts);
}
