// deno-lint-ignore-file no-console
import * as path from "@std/path";
import * as colors from "@std/fmt/colors";
import { error, findProjectRoot } from "../utils.ts";

export interface RoutesFlags {
  dir: string | undefined;
}

interface RouteEntry {
  file: string;
  pattern: string;
  type: "page" | "api" | "middleware" | "layout" | "app" | "error" | "404";
}

export function routesCommand(flags: RoutesFlags): void {
  const startDir = flags.dir ?? Deno.cwd();
  const root = findProjectRoot(startDir);
  if (!root) {
    error("Could not find a Fresh project. Run from inside a Fresh project.");
  }

  const routesDir = path.join(root, "routes");
  const islandsDir = path.join(root, "islands");
  const entries: RouteEntry[] = [];

  try {
    crawl(routesDir, routesDir, entries);
  } catch {
    error(`Could not read routes directory: ${routesDir}`);
  }

  entries.sort((a, b) => a.pattern.localeCompare(b.pattern));

  console.log(colors.bold("\nRoutes:\n"));

  const maxPattern = Math.max(...entries.map((e) => e.pattern.length), 7);
  const maxType = Math.max(...entries.map((e) => e.type.length), 4);

  console.log(
    `  ${colors.dim(pad("PATTERN", maxPattern))}  ${colors.dim(pad("TYPE", maxType))}  ${colors.dim("FILE")}`,
  );
  console.log(
    `  ${colors.dim("─".repeat(maxPattern))}  ${colors.dim("─".repeat(maxType))}  ${colors.dim("─".repeat(30))}`,
  );

  for (const entry of entries) {
    const typeColor = entry.type === "page"
      ? colors.green
      : entry.type === "api"
      ? colors.blue
      : entry.type === "middleware"
      ? colors.yellow
      : colors.dim;
    console.log(
      `  ${pad(entry.pattern, maxPattern)}  ${typeColor(pad(entry.type, maxType))}  ${colors.dim(entry.file)}`,
    );
  }

  // Count islands
  let islandCount = 0;
  try {
    for (const entry of Deno.readDirSync(islandsDir)) {
      if (entry.isFile && /\.[tj]sx?$/.test(entry.name)) islandCount++;
    }
  } catch { /* no islands dir */ }

  console.log(
    `\n  ${colors.bold(String(entries.filter((e) => e.type === "page").length))} pages, ` +
      `${colors.bold(String(entries.filter((e) => e.type === "api").length))} API routes, ` +
      `${colors.bold(String(entries.filter((e) => e.type === "middleware").length))} middleware, ` +
      `${colors.bold(String(islandCount))} islands\n`,
  );
}

function pad(str: string, len: number): string {
  return str + " ".repeat(Math.max(0, len - str.length));
}

function crawl(
  dir: string,
  routesRoot: string,
  entries: RouteEntry[],
): void {
  for (const entry of Deno.readDirSync(dir)) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory) {
      crawl(full, routesRoot, entries);
      continue;
    }
    if (!entry.isFile || !/\.[tj]sx?$/.test(entry.name)) continue;

    const rel = path.relative(routesRoot, full);
    const type = getRouteType(entry.name);
    const pattern = fileToPattern(rel);

    entries.push({ file: `routes/${rel}`, pattern, type });
  }
}

function getRouteType(
  filename: string,
): RouteEntry["type"] {
  if (filename.startsWith("_middleware")) return "middleware";
  if (filename.startsWith("_layout")) return "layout";
  if (filename.startsWith("_app")) return "app";
  if (filename.startsWith("_error") || filename.startsWith("_500")) {
    return "error";
  }
  if (filename.startsWith("_404")) return "404";

  // Heuristic: .ts files without JSX extension are likely API routes
  if (filename.endsWith(".ts") || filename.endsWith(".js")) return "api";
  return "page";
}

function fileToPattern(rel: string): string {
  // Remove extension
  let pattern = rel.replace(/\.[tj]sx?$/, "");

  // Remove index
  pattern = pattern.replace(/\/index$/, "");
  if (pattern === "index") pattern = "";

  // Convert dynamic params
  pattern = pattern.replace(/\[\.\.\.(\w+)\]/g, ":$1*");
  pattern = pattern.replace(/\[\[(\w+)\]\]/g, "{:$1}?");
  pattern = pattern.replace(/\[(\w+)\]/g, ":$1");

  // Strip route groups
  pattern = pattern.replace(/\([^)]+\)\/?/g, "");

  // Handle special files
  if (pattern.includes("_middleware")) return pattern.replace("_middleware", "(middleware)");
  if (pattern.includes("_layout")) return pattern.replace("_layout", "(layout)");
  if (pattern.includes("_app")) return "(app)";
  if (pattern.includes("_error") || pattern.includes("_500")) {
    return pattern.replace(/_error|_500/, "(error)");
  }
  if (pattern.includes("_404")) return pattern.replace("_404", "(404)");

  return "/" + pattern;
}
