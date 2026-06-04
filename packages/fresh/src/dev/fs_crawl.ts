import { type FsAdapter, fsAdapter } from "../fs.ts";
import type { WalkEntry } from "@std/fs/walk";
import { type FsRouteFileNoMod, toPosix } from "./dev_build_cache.ts";
import * as path from "@std/path";
import { pathToPattern } from "../router.ts";
import { CommandType } from "../commands.ts";
import { sortRoutePaths } from "../fs_routes.ts";
import type { RouteConfig } from "../types.ts";

const GROUP_REG = /[/\\\\]\((_[^/\\\\]+)\)[/\\\\]/;

export async function crawlRouteDir<State>(
  fs: FsAdapter,
  routeDir: string,
  ignore: RegExp[],
  onIslandSpecifier: (spec: string) => void,
): Promise<FsRouteFileNoMod<State>[]> {
  const files: FsRouteFileNoMod<State>[] = [];

  await walkDir(fs, routeDir, async (entry) => {
    // A `(_islands)` path segment is a local island folder.
    // Any route path segment wrapped in `(_...)` is ignored
    // during route collection.
    const match = entry.path.match(GROUP_REG);
    if (match !== null) {
      if (match[1] === "_islands") {
        onIslandSpecifier(entry.path);
      }
      return;
    }

    let lazy = false;
    const relative = path.relative(routeDir, entry.path);
    const url = new URL(relative, "http://localhost/");
    const id = url.pathname.slice(0, url.pathname.lastIndexOf("."));

    let overrideConfig: RouteConfig | undefined;
    let pattern = "*";
    let routePattern = pattern;
    let type = CommandType.Route;
    if (id.endsWith("/_middleware")) {
      type = CommandType.Middleware;
      pattern = pathToPattern(
        id.slice(1, -"/_middleware".length),
        { keepGroups: true },
      );
      routePattern = pattern;
    } else if (id.endsWith("/_layout")) {
      type = CommandType.Layout;
      pattern = pathToPattern(
        id.slice(1, -"/_layout".length),
        { keepGroups: true },
      );
      routePattern = pattern;
    } else if (id.endsWith("/_app")) {
      type = CommandType.App;
    } else if (id.endsWith("/_404")) {
      type = CommandType.NotFound;
    } else if (id.endsWith("/_error") || id.endsWith("/_500")) {
      type = CommandType.Error;
      pattern = pathToPattern(
        id.slice(1, -"/_error".length),
        { keepGroups: true },
      );
      routePattern = pattern;
    } else {
      pattern = pathToPattern(id.slice(1), { keepGroups: true });
      if (id.endsWith("/index")) {
        if (!pattern.endsWith("/")) {
          pattern += "/";
        }
      }

      routePattern = pathToPattern(id.slice(1));

      const code = await fs.readTextFile(entry.path);
      lazy = !code.includes("routeOverride") && !code.includes("prerender");

      // TODO: We could do an AST parse here to detect the
      // kind of handler that's used to get a more accurate
      // list of methods this route supports.
      overrideConfig = {
        methods: "ALL",
      };
    }

    files.push({
      id,
      filePath: toPosix(entry.path),
      type,
      pattern,
      routePattern,
      lazy,
      css: [],
      overrideConfig,
    });
  }, ignore);

  files.sort((a, b) => sortRoutePaths(a.id, b.id));

  return files;
}

export async function walkDir(
  fs: FsAdapter,
  dir: string,
  callback: (entry: WalkEntry) => void | Promise<void>,
  ignore: RegExp[],
) {
  if (!await fs.isDirectory(dir)) return;

  const entries = fs.walk(dir, {
    includeDirs: false,
    includeFiles: true,
    exts: ["tsx", "jsx", "ts", "js"],
    skip: ignore,
  });

  for await (const entry of entries) {
    await callback(entry);
  }
}

export async function crawlFsItem(
  options: { islandDir: string; routeDir: string; ignore: RegExp[] },
): Promise<{ islands: string[]; routes: FsRouteFileNoMod<unknown>[] }> {
  const islands: string[] = [];

  const [, routes] = await Promise.all([
    walkDir(
      fsAdapter,
      options.islandDir,
      (entry) => {
        islands.push(entry.path);
      },
      options.ignore,
    ),
    crawlRouteDir(
      fsAdapter,
      options.routeDir,
      options.ignore,
      (entry) => islands.push(entry),
    ),
  ]);

  return { islands, routes };
}
