import type { DevEnvironment } from "vite";
import { cleanId } from "../utils.ts";

/**
 * Vite does not export `DepsOptimizer`, but it is reachable through the
 * `DevEnvironment` type, so we can use Vite's own definition rather than
 * describing the shape ourselves.
 */
export type DepsOptimizer = NonNullable<DevEnvironment["depsOptimizer"]>;

/**
 * Mirrors `tryOptimizedResolve()` from Vite's `vite:resolve` plugin.
 *
 * When a dependency has been pre-bundled, Vite serves it from its own cache
 * (`/.vite/deps/…`) rather than from the package on disk. We have to return
 * the same id, otherwise the specifiers we resolve keep pointing at the
 * original files and the dependency is loaded a second time alongside the
 * bundle.
 *
 * Vite looks the dependency up by specifier, which only works for the bare
 * names it uses itself. Deno rewrites imports inside jsr modules to `npm:`
 * specifiers (`npm:@preact/signals@^2.0.0`), so we additionally match on the
 * file the dependency was pre-bundled from, which is independent of how the
 * specifier was written.
 */
export async function tryOptimizedResolve(
  specifier: string,
  resolved: string,
  depsOptimizer: DepsOptimizer,
): Promise<string | undefined> {
  // Metadata is incomplete until dependency scanning has settled.
  await depsOptimizer.scanProcessing;

  const { optimized, discovered, chunks, depInfoList } = depsOptimizer.metadata;

  const bySpecifier = optimized[specifier] ?? discovered[specifier] ??
    chunks[specifier];
  if (bySpecifier !== undefined) {
    return depsOptimizer.getOptimizedDepId(bySpecifier);
  }

  const file = cleanId(resolved);
  const bySource = depInfoList.find((info) =>
    info.src !== undefined && cleanId(info.src) === file
  );
  if (bySource !== undefined) {
    return depsOptimizer.getOptimizedDepId(bySource);
  }

  return undefined;
}

const DEP_VERSION_REG = /[?&]v=/;
/** Mirrors Vite's `OPTIMIZABLE_ENTRY_RE`, which also excludes `.jsx`/`.tsx`. */
const OPTIMIZABLE_REG = /\.[cm]?[jt]s$/;

/**
 * The dependency optimizer only exists on a dev environment, and is absent
 * from the base `Environment` type that plugin hooks are handed.
 */
export function depsOptimizerOf(
  environment: unknown,
): DepsOptimizer | undefined {
  return (environment as { depsOptimizer?: DepsOptimizer }).depsOptimizer;
}

/**
 * Mirrors `ensureVersionQuery()` from Vite's `vite:resolve` plugin.
 *
 * That is where Vite attaches the optimizer's `?v=<hash>` to a dependency,
 * but `vite:resolve` never runs for the specifiers we resolve ourselves. Both
 * resolvers have to produce the same url for a given file: the browser keys
 * modules on the url it was told to fetch, so a file reachable under two urls
 * is loaded twice as two independent instances.
 */
export function ensureVersionQuery(
  resolved: string,
  depsOptimizer: DepsOptimizer,
): string {
  // Only dependencies are versioned; app source uses `?t=` for HMR instead.
  if (!resolved.includes("node_modules")) return resolved;
  if (DEP_VERSION_REG.test(resolved)) return resolved;

  // Empty until the optimizer has finished initialising.
  const { browserHash } = depsOptimizer.metadata;
  if (!browserHash) return resolved;

  // Vite only versions what it could pre-bundle, so we must match.
  const file = cleanId(resolved);
  const { extensions } = depsOptimizer.options;
  const optimizable = OPTIMIZABLE_REG.test(file) ||
    (extensions?.some((ext) => file.endsWith(ext)) ?? false);
  if (!optimizable) return resolved;

  return injectVersionQuery(resolved, browserHash);
}

function injectVersionQuery(id: string, browserHash: string): string {
  const hashIndex = id.indexOf("#");
  const fragment = hashIndex >= 0 ? id.slice(hashIndex) : "";
  const rest = hashIndex >= 0 ? id.slice(0, hashIndex) : id;

  const queryIndex = rest.indexOf("?");
  if (queryIndex >= 0) {
    const pathname = rest.slice(0, queryIndex);
    const query = rest.slice(queryIndex + 1);
    return `${pathname}?v=${browserHash}&${query}${fragment}`;
  }

  return `${rest}?v=${browserHash}${fragment}`;
}
