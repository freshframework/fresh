/**
 * Don't use this package directly. It's considered internal for Fresh.
 *
 * @example
 * ```ts
 * // `BUILD_ID` is based on the `DENO_DEPLOYMENT_ID` environment variable.
 * ```
 *
 * @see https://usefresh.dev/docs/deployment/docker
 *
 * @module
 * @private
 */

import { encodeHex } from "@std/encoding/hex";

export const DENO_DEPLOYMENT_ID: string | undefined = Deno.env.get(
  "DENO_DEPLOYMENT_ID",
);
const deploymentId = DENO_DEPLOYMENT_ID ||
  // For CI
  Deno.env.get("GITHUB_SHA") ||
  Deno.env.get("CI_COMMIT_SHA") ||
  crypto.randomUUID();
const buildIdHash = await crypto.subtle.digest(
  "SHA-1",
  new TextEncoder().encode(deploymentId),
);

export let BUILD_ID: string = encodeHex(buildIdHash);

export function setBuildId(buildId: string): void {
  BUILD_ID = buildId;
}
