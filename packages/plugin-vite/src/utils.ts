import * as path from "@std/path";
import type { FsRouteFileNoMod, UniqueNamer } from "fresh/internal-dev";
import type { ImportCheck } from "./plugins/verify_imports.ts";

export const JS_REG = /\.([tj]sx?|[mc]?[tj]s)(\?.*)?$/;
export const JSX_REG = /\.[tj]sx(\?.*)?$/;

/** Split a Vite module id into specifier and query/hash (e.g. `?raw`, `?v=`). */
export function splitViteQuery(
  id: string,
): { specifier: string; query: string } {
  const hashIdx = id.indexOf("#");
  const base = hashIdx === -1 ? id : id.slice(0, hashIdx);
  const hash = hashIdx === -1 ? "" : id.slice(hashIdx);
  const qIdx = base.indexOf("?");
  if (qIdx === -1) {
    return { specifier: base, query: hash };
  }
  return {
    specifier: base.slice(0, qIdx),
    query: base.slice(qIdx) + hash,
  };
}

export function joinViteQuery(specifier: string, query: string): string {
  return query ? specifier + query : specifier;
}

export function pathWithRoot(fileOrDir: string, root?: string): string {
  if (path.isAbsolute(fileOrDir)) return fileOrDir;

  if (root === undefined) {
    return path.join(Deno.cwd(), fileOrDir);
  }

  if (path.isAbsolute(root)) return path.join(root, fileOrDir);

  return path.join(Deno.cwd(), root, fileOrDir);
}

export interface FreshState {
  namer: UniqueNamer;
  root: string;
  serverEntry: string;
  islandDir: string;
  routeDir: string;
  dev: boolean;
  islands: Map<string, { name: string; chunk: string | null }>;
  // deno-lint-ignore no-explicit-any
  routes: FsRouteFileNoMod<any>[];
  clientOutDir: string;
  serverOutDir: string;
}

export interface ClientSnapshot {
  entry: string;
}

/** Configuration options for Fresh when using the Vite plugin */
export interface FreshViteConfig {
  /** Path to main server entry file. Default: `main.ts` */
  serverEntry?: string;
  /** Path to main client entry file. Default: `client.ts` */
  clientEntry?: string;
  /** Path to islands directory. Default: `./islands` */
  islandsDir?: string;
  /** Path to routes directory. Default: `./routes` */
  routeDir?: string;
  /**
   * The directory (or directories) to serve static files from.
   * When multiple directories are specified, they are searched in order
   * and the first match wins. Default: `"static"`
   */
  staticDir?: string | string[];
  /**
   * Ignore file paths matching any of the provided regexes when
   * crawling the islands and routes directories.
   */
  ignore?: RegExp[];
  /**
   * Treat these specifiers as island files. This is used to declare
   * islands from remote packages.
   */
  islandSpecifiers?: string[];
  /**
   * A list of checks that will be performed for imports.
   *
   * Can be used to warn or error when certain imports exist in
   * server or client code. Useful to enforce that some dependencies
   * are not imported in Islands running in the browser.
   */
  checkImports?: ImportCheck[];
}

export type ResolvedFreshViteConfig =
  & Required<
    Omit<FreshViteConfig, "islandSpecifiers" | "staticDir">
  >
  & {
    staticDir: string[];
    islandSpecifiers: Map<string, string>;
    namer: UniqueNamer;
  };
