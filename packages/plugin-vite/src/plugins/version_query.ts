import { cleanId } from "../utils.ts";

/** The parts of Vite's `DepsOptimizer` we rely on. */
export interface DepsOptimizerLike {
  metadata: { browserHash: string };
  options: { extensions?: string[] };
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
): DepsOptimizerLike | undefined {
  return (environment as { depsOptimizer?: DepsOptimizerLike }).depsOptimizer;
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
  depsOptimizer: DepsOptimizerLike,
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
