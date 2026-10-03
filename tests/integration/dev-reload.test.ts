import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, expect, test } from "vitest";
import { createServer, type ViteDevServer } from "vite";
import { fresh } from "fresh/vite";

// Adding or removing a route file while the dev server runs must take effect
// without a restart. Runs against a throwaway app (created under the fixture so
// `fresh` / `preact` resolve from its node_modules) rather than the fixture
// itself, so the route churn can't disturb the other suites' servers.

const fixtureRoot = fileURLToPath(new URL("../fixture", import.meta.url));
let root: string;
let server: ViteDevServer;
let base: string;

beforeAll(async () => {
  root = await mkdtemp(path.join(fixtureRoot, ".tmp-dev-reload-"));
  await mkdir(path.join(root, "routes"));
  await writeFile(
    path.join(root, "routes/index.tsx"),
    `export default function Page() {\n  return <p>home</p>;\n}\n`,
  );
  server = await createServer({
    root,
    configFile: false,
    plugins: [fresh()],
    server: { port: 0, strictPort: false },
    logLevel: "error",
  });
  await server.listen();
  base = server.resolvedUrls!.local[0].replace(/\/$/, "");
}, 60_000);

afterAll(async () => {
  await server?.close();
  if (root) await rm(root, { recursive: true, force: true });
});

/** Poll `path` until it answers `status`, returning the final response. */
async function waitForStatus(pathname: string, status: number): Promise<Response> {
  const deadline = Date.now() + 10_000;
  for (;;) {
    const res = await fetch(`${base}${pathname}`);
    if (res.status === status || Date.now() > deadline) return res;
    await res.body?.cancel();
    await new Promise((r) => setTimeout(r, 50));
  }
}

test("a route added and then removed at dev time is picked up without a restart", async () => {
  expect((await waitForStatus("/", 200)).status).toBe(200);
  expect((await waitForStatus("/added", 404)).status).toBe(404);

  const file = path.join(root, "routes/added.tsx");
  for (let round = 0; round < 2; round++) {
    await writeFile(file, `export default function Page() {\n  return <p>added route</p>;\n}\n`);
    const added = await waitForStatus("/added", 200);
    expect(added.status).toBe(200);
    expect(await added.text()).toContain("added route");

    await rm(file);
    expect((await waitForStatus("/added", 404)).status).toBe(404);

    // Re-evaluating the SSR graph must not stack render hooks: the existing
    // page still renders, with a single injected `<title>`/head.
    const home = await waitForStatus("/", 200);
    expect(home.status).toBe(200);
    const html = await home.text();
    expect(html).toContain("home");
    expect(html.match(/<head>/g)).toHaveLength(1);
  }
}, 60_000);
