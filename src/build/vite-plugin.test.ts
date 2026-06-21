import { test } from "vitest";
import assert from "node:assert/strict";

import { createMemFs, type FreshConfig } from "./fs-routes.ts";
import type { Plugin } from "vite";
import {
  fresh as freshUntyped,
  generateIslandsModule,
  islandEntryName,
  ISLANDS_VIRTUAL_ID,
} from "./vite-plugin.ts";

// `fresh()` is typed as `PluginOption[]` (per Vite's broad plugin-list
// type, which permits falsy / promise / nested-array entries). The test
// surface only ever cares about the concrete `Plugin` objects in the
// returned array, so we widen the call signature at the boundary instead
// of casting at every call site.
const fresh = freshUntyped as unknown as (...args: Parameters<typeof freshUntyped>) => Plugin[];
import {
  CLIENT_BOOT_SPECIFIER,
  ROUTE_VIRTUAL_PREFIX,
  ROUTER_VIRTUAL_ID,
  SERVER_ENTRY_VIRTUAL_ID,
} from "./codegen.ts";

// Evaluate a generated `export default <expr>` module. Used for the islands
// virtual module which is a plain `new Map([...])`; no imports to stub.
function evalModule<T>(code: string): T {
  const body = code.replace(/^\s*export default\s+/, "return ");
  return new Function(body)() as T;
}

const noopWrite = (): Promise<void> => Promise.resolve();

// Vite's `Plugin.resolveId` / `load` / `configureServer` are typed as
// `ObjectHook<Fn> | Fn`. Unwrap to the function form for direct testing.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function asFn(hook: any): any {
  if (typeof hook === "function") return hook;
  return hook.handler;
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const resolveId = (p: Plugin) => asFn(p.resolveId) as (id: string, importer?: string) => any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const load = (p: Plugin) => asFn(p.load) as (id: string) => any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const configureServer = (p: Plugin) => asFn(p.configureServer) as (server: unknown) => any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const config = (p: Plugin) =>
  asFn(p.config) as (userConfig: Record<string, unknown>, env?: { command?: string }) => any;

// ---------- islandEntryName ----------

test("islandEntryName produces stable kebab keys under islands/", () => {
  assert.equal(islandEntryName("islands/Counter.tsx"), "islands/Counter");
  assert.equal(islandEntryName("islands/forms/Input.tsx"), "islands/forms-Input");
  assert.equal(islandEntryName("islands/Nested/Deep/Thing.jsx"), "islands/Nested-Deep-Thing");
});

// ---------- generateIslandsModule ----------

test("generateIslandsModule emits a Map of relative path -> () => import('…?assets=client').then(m => m.default)", () => {
  const cfg: FreshConfig = {
    islands: [{ path: "islands/Button.tsx" }, { path: "islands/forms/Input.tsx" }],
    routes: new Map(),
    app: null,
    error: null,
    clientEntry: null,
    serverEntry: null,
  };
  const code = generateIslandsModule(cfg);
  // Loader unwraps `.default` so the SSR side sees a flat descriptor.
  assert.match(
    code,
    /\["islands\/Button\.tsx", \(\) => import\("\/islands\/Button\.tsx\?assets=client"\)\.then\(\(m\) => m\.default\)\]/,
  );

  const mod = evalModule<Map<string, () => Promise<unknown>>>(code);
  assert.ok(mod instanceof Map);
  // The framework-shipped factory modules ride the same map under their
  // bare package specifiers — always present, always first.
  assert.deepEqual(
    [...mod.keys()],
    ["fresh/signals", "fresh/events", "islands/Button.tsx", "islands/forms/Input.tsx"],
  );
  for (const loader of mod.values()) {
    assert.equal(typeof loader, "function");
  }
});

test("generateIslandsModule always includes the framework factory chunks, even with no user islands", () => {
  const cfg: FreshConfig = {
    islands: [],
    routes: new Map(),
    app: null,
    error: null,
    clientEntry: null,
    serverEntry: null,
  };
  const mod = evalModule<Map<string, unknown>>(generateIslandsModule(cfg));
  assert.ok(mod instanceof Map);
  // Only the framework specifiers — no user entries.
  assert.deepEqual([...mod.keys()], ["fresh/signals", "fresh/events"]);
});

// ---------- plugin orchestration ----------

test("fresh() returns [freshPlugin, ...nitroPlugins] and bundles the nitro vite plugin", () => {
  const plugins = fresh({ fs: createMemFs([]), writeFile: noopWrite });
  assert.ok(Array.isArray(plugins));
  assert.ok(plugins.length >= 2, "expected fresh plugin + at least one nitro plugin");
  assert.equal(plugins[0].name, "fresh");
  assert.ok(
    plugins.slice(1).some((p) => typeof p.name === "string" && p.name.startsWith("nitro")),
    "expected at least one nitro-named plugin in the returned array",
  );
});

test("plugin: resolveId maps every fresh virtual id and ignores others", () => {
  const [p] = fresh({ fs: createMemFs([]), writeFile: noopWrite });
  assert.equal(resolveId(p)(ISLANDS_VIRTUAL_ID), "\0" + ISLANDS_VIRTUAL_ID);
  assert.equal(resolveId(p)(SERVER_ENTRY_VIRTUAL_ID), "\0" + SERVER_ENTRY_VIRTUAL_ID);
  assert.equal(resolveId(p)(ROUTER_VIRTUAL_ID), "\0" + ROUTER_VIRTUAL_ID);
  assert.equal(
    resolveId(p)(ROUTE_VIRTUAL_PREFIX + "blog/[slug]"),
    "\0" + ROUTE_VIRTUAL_PREFIX + "blog/[slug]",
  );
  assert.equal(resolveId(p)("react"), null);
  assert.equal(resolveId(p)("fresh:internal/routes"), null);
  // The boot entry is a real package specifier (`fresh/internal/client`),
  // not a virtual — Vite resolves it through node_modules. The plugin
  // returns `null` so the default resolver wins.
  assert.equal(resolveId(p)(CLIENT_BOOT_SPECIFIER), null);
  assert.equal(resolveId(p)(CLIENT_BOOT_SPECIFIER + "?assets=client"), null);
});

test("plugin: config() routes the SSR env to the single server-entrypoint virtual (consumer: server)", async () => {
  const fs = createMemFs([
    "/project/routes/index.tsx",
    "/project/routes/about.tsx",
    "/project/routes/blog/[slug].tsx",
  ]);
  const [p] = fresh({ fs, writeFile: noopWrite });
  const cfg = (await config(p)({ root: "/project" }, { command: "build" })) as {
    environments: {
      ssr: {
        consumer: string;
        build: { rolldownOptions: { input: string } };
      };
    };
  };
  assert.equal(cfg.environments.ssr.consumer, "server");
  assert.equal(cfg.environments.ssr.build.rolldownOptions.input, SERVER_ENTRY_VIRTUAL_ID);
});

test("plugin: config() puts islands + entry.client in environments.client.build.rolldownOptions.input", async () => {
  const fs = createMemFs([
    "/project/islands/Counter.tsx",
    "/project/islands/Button.tsx",
    "/project/entry.client.ts",
    "/project/routes/index.tsx",
  ]);
  const [p] = fresh({ fs, writeFile: noopWrite });
  const cfg = (await config(p)({ root: "/project" }, { command: "build" })) as {
    environments: {
      client: {
        build: {
          manifest: boolean;
          rolldownOptions: { input: Record<string, string> };
        };
      };
    };
  };
  const client = cfg.environments.client.build;
  assert.equal(client.manifest, true);
  assert.deepEqual(Object.keys(client.rolldownOptions.input).sort(), [
    "entry.client",
    "fresh.boot",
    "fresh.events",
    "fresh.signals",
    "islands/Button",
    "islands/Counter",
  ]);
  assert.match(client.rolldownOptions.input["entry.client"], /\/project\/entry\.client\.ts$/);
});

test("plugin: environments.client is configured even in dev mode", async () => {
  const fs = createMemFs(["/project/islands/Counter.tsx", "/project/routes/index.tsx"]);
  const [p] = fresh({ fs, writeFile: noopWrite });
  const cfg = (await config(p)({ root: "/project" }, { command: "serve" })) as {
    environments: {
      client: { build: { rolldownOptions: { input: Record<string, string> } } };
    };
  };
  assert.deepEqual(Object.keys(cfg.environments.client.build.rolldownOptions.input).sort(), [
    "fresh.boot",
    "fresh.events",
    "fresh.signals",
    "islands/Counter",
  ]);
});

test("plugin: load() serves the islands virtual module", async () => {
  const fs = createMemFs(["/project/islands/Counter.tsx", "/project/routes/index.tsx"]);
  const [p] = fresh({ fs, writeFile: noopWrite });
  await config(p)({ root: "/project" });

  const code = (await load(p)("\0" + ISLANDS_VIRTUAL_ID)) as string;
  assert.match(
    code,
    /\["islands\/Counter\.tsx", \(\) => import\("\/islands\/Counter\.tsx\?assets=client"\)\.then\(\(m\) => m\.default\)\]/,
  );
});

test("plugin: load() returns the server-entrypoint source for its virtual id", async () => {
  const fs = createMemFs(["/project/routes/index.tsx"]);
  const [p] = fresh({ fs, writeFile: noopWrite });
  await config(p)({ root: "/project" });

  const code = (await load(p)("\0" + SERVER_ENTRY_VIRTUAL_ID)) as string;
  assert.match(code, /from "fresh:internal\/router"/);
  assert.match(code, /export default \{/);
  assert.match(code, /fetch\(req\)/);
});

test("plugin: load() returns a pre-compiled router (compileRouterToString) for its virtual id", async () => {
  const fs = createMemFs([
    "/project/routes/index.tsx",
    "/project/routes/blog/[slug].tsx",
    "/project/routes/files/[...path].tsx",
  ]);
  const [p] = fresh({ fs, writeFile: noopWrite });
  await config(p)({ root: "/project" });

  const code = (await load(p)("\0" + ROUTER_VIRTUAL_ID)) as string;
  // Pre-compiled: a plain `const match = ...; export { match };`. No runtime
  // construction (no `createRouter` / `addRoute` / `compileRouter` imports).
  assert.match(code, /const match\s*=/);
  assert.match(code, /export\s*\{\s*match\s*\}/);
  assert.doesNotMatch(code, /from "rou3"/);
  assert.doesNotMatch(code, /createRouter\(/);
  assert.doesNotMatch(code, /addRoute\(/);
  // Each route serializes to an inline dynamic-import thunk for its
  // fresh:routes/<id> virtual.
  assert.match(code, /\(\)\s*=>\s*import\("fresh:routes\/index"\)/);
  assert.match(code, /\(\)\s*=>\s*import\("fresh:routes\/blog\/\[slug\]"\)/);
  assert.match(code, /\(\)\s*=>\s*import\("fresh:routes\/files\/\[\.\.\.path\]"\)/);
});

test("plugin: transform attaches __FRESH_SERIALIZABLE_FUNCTION markers in the SSR env only", async () => {
  const fs = createMemFs(["/project/islands/Counter.tsx", "/project/routes/index.tsx"]);
  const [p] = fresh({ fs, writeFile: noopWrite });
  await config(p)({ root: "/project" });

  // Unwrap the transform hook (object form), same pattern as resolveId/load.
  const transformFn = asFn((p as unknown as { transform: unknown }).transform) as (
    this: { environment?: { name: string } },
    code: string,
    id: string,
    // deno-lint-ignore no-explicit-any
  ) => any;

  const islandSource = `export function Counter() { return null; }\n`;
  const islandAbsPath = "/project/islands/Counter.tsx";

  // SSR env → markers appended; transform now returns `{ code, map }`.
  const ssrCtx = { environment: { name: "ssr" } };
  const ssrOut = transformFn.call(ssrCtx, islandSource, islandAbsPath) as
    | { code: string; map: { version: number } }
    | undefined;
  assert.ok(ssrOut, "ssr transform should return a result");
  assert.match(
    ssrOut!.code,
    /if \(typeof Counter === "function" && !Counter\.__FRESH_SERIALIZABLE_FUNCTION\) Counter\.__FRESH_SERIALIZABLE_FUNCTION = \{"specifier":"islands\/Counter\.tsx","export":"Counter"\};/,
  );
  assert.equal(ssrOut!.map.version, 3, "should produce a v3 source map");

  // Client env → bypassed.
  const clientCtx = { environment: { name: "client" } };
  assert.equal(
    transformFn.call(clientCtx, islandSource, islandAbsPath),
    undefined,
    "client env should NOT be transformed",
  );

  // Non-island file under the SSR env → bypassed.
  assert.equal(
    transformFn.call(ssrCtx, islandSource, "/project/routes/index.tsx"),
    undefined,
    "non-island paths should NOT be transformed even in SSR",
  );
});

test("plugin: load() returns the per-route module for a fresh:routes/<id> virtual", async () => {
  const fs = createMemFs(["/project/routes/_middleware.tsx", "/project/routes/blog/[slug].tsx"]);
  const [p] = fresh({ fs, writeFile: noopWrite });
  await config(p)({ root: "/project" });

  const code = (await load(p)("\0" + ROUTE_VIRTUAL_PREFIX + "blog/[slug]")) as string;
  assert.match(code, /from "fresh\/internal\/server"/);
  // Imports the user handler module + its ?assets=ssr metadata.
  assert.match(code, /import \* as __handler from "\/project\/routes\/blog\/\[slug\]\.tsx"/);
  assert.match(
    code,
    /import __handler_ssrAssets from "\/project\/routes\/blog\/\[slug\]\.tsx\?assets=ssr"/,
  );
  // Middleware wildcard import.
  assert.match(code, /import \* as __mw0 from "\/project\/routes\/_middleware\.tsx"/);
  // Default export wires the freshHandler.
  assert.match(code, /export default freshHandler\(/);
});

test("plugin: load() throws for an unknown route id", async () => {
  const fs = createMemFs(["/project/routes/index.tsx"]);
  const [p] = fresh({ fs, writeFile: noopWrite });
  await config(p)({ root: "/project" });
  await assert.rejects(
    () => load(p)("\0" + ROUTE_VIRTUAL_PREFIX + "does-not-exist"),
    /unknown route id/,
  );
});

test("plugin: load() returns null for unrelated ids", async () => {
  const [p] = fresh({ fs: createMemFs([]) });
  assert.equal(await load(p)("some/other/id"), null);
});

test("plugin: configureServer watches islands/ and routes/ and invalidates the islands module", async () => {
  const fs = createMemFs(["/project/islands/Counter.tsx", "/project/routes/index.tsx"]);
  const [p] = fresh({ fs, writeFile: noopWrite });
  await config(p)({ root: "/project" });

  const watched: string[] = [];
  const handlers: Record<string, ((file: string) => unknown)[]> = {
    add: [],
    change: [],
    unlink: [],
  };
  const invalidated: unknown[] = [];
  const wsMessages: unknown[] = [];

  const fakeMods = new Map<string, { id: string }>();
  fakeMods.set("\0" + ISLANDS_VIRTUAL_ID, { id: "islands-mod" });

  // Minimal SSR module graph: the island file resolves to a node with no
  // importers + the island's own file, so `changeAffectsServerRender` treats
  // it as client-only (no reload). Any other file → no node → no reload.
  interface FakeNode {
    id: string;
    file: string | null;
    importers: Set<FakeNode>;
  }
  const ssrNodes = new Map<string, Set<FakeNode>>();
  const islandNode: FakeNode = {
    id: "/project/islands/Counter.tsx",
    file: "/project/islands/Counter.tsx",
    importers: new Set<FakeNode>(),
  };
  ssrNodes.set("/project/islands/Counter.tsx", new Set([islandNode]));
  // A route file: imported by its server-render virtual (a non-island root).
  const routeVirtual: FakeNode = {
    id: "\0fresh:routes/index",
    file: null,
    importers: new Set<FakeNode>(), // server-render root (no importers)
  };
  const routeNode: FakeNode = {
    id: "/project/routes/index.tsx",
    file: "/project/routes/index.tsx",
    importers: new Set([routeVirtual]),
  };
  ssrNodes.set("/project/routes/index.tsx", new Set([routeNode]));
  // A shared component imported by BOTH the route and the island. Because one
  // importer (the route) is non-island, a change must full-reload.
  ssrNodes.set(
    "/project/components/Button.tsx",
    new Set([
      {
        id: "/project/components/Button.tsx",
        file: "/project/components/Button.tsx",
        importers: new Set([routeNode, islandNode]),
      },
    ]),
  );
  // A component imported ONLY by the island → client-only → no reload.
  ssrNodes.set(
    "/project/components/Badge.tsx",
    new Set([
      {
        id: "/project/components/Badge.tsx",
        file: "/project/components/Badge.tsx",
        importers: new Set([islandNode]),
      },
    ]),
  );

  const server = {
    environments: {
      ssr: {
        moduleGraph: {
          getModulesByFile(file: string) {
            return ssrNodes.get(file);
          },
        },
      },
    },
    watcher: {
      add(paths: string | string[]) {
        watched.push(...(Array.isArray(paths) ? paths : [paths]));
      },
      on(event: "add" | "change" | "unlink", cb: (file: string) => unknown) {
        handlers[event].push(cb);
      },
    },
    moduleGraph: {
      getModuleById(id: string) {
        return fakeMods.get(id) ?? null;
      },
      invalidateModule(mod: unknown) {
        invalidated.push(mod);
      },
    },
    ws: {
      send(payload: unknown) {
        wsMessages.push(payload);
      },
    },
  };

  await configureServer(p)(server);
  assert.deepEqual(watched.sort(), ["/project/islands", "/project/routes"]);

  // A structural change (add) invalidates the islands virtual + full-reloads.
  await handlers.add[0]!("/project/islands/New.tsx");
  assert.deepEqual(invalidated, [{ id: "islands-mod" }]);
  assert.deepEqual(wsMessages, [{ type: "full-reload" }]);

  // `unlink` behaves the same.
  invalidated.length = 0;
  wsMessages.length = 0;
  await handlers.unlink[0]!("/project/islands/New.tsx");
  assert.deepEqual(invalidated, [{ id: "islands-mod" }]);
  assert.deepEqual(wsMessages, [{ type: "full-reload" }]);

  // A content edit (change) to an island does NOT reload — HMR / prefresh
  // handle it in place so island state survives.
  invalidated.length = 0;
  wsMessages.length = 0;
  await handlers.change[0]!("/project/islands/Counter.tsx");
  assert.deepEqual(invalidated, []);
  assert.deepEqual(wsMessages, []);

  // A content edit to a route (reachable from a server-render root without
  // crossing an island) DOES full-reload.
  wsMessages.length = 0;
  await handlers.change[0]!("/project/routes/index.tsx");
  assert.deepEqual(wsMessages, [{ type: "full-reload" }]);

  // A shared component imported by the route (even though also used by an
  // island) DOES full-reload — it lives outside islands/ + routes/, so this
  // proves the reload check isn't gated on those directories.
  wsMessages.length = 0;
  await handlers.change[0]!("/project/components/Button.tsx");
  assert.deepEqual(wsMessages, [{ type: "full-reload" }]);

  // A component imported ONLY by an island does NOT reload.
  wsMessages.length = 0;
  await handlers.change[0]!("/project/components/Badge.tsx");
  assert.deepEqual(wsMessages, []);

  // Stylesheets get Vite's built-in CSS HMR — skip the reload check even when
  // their importer chain would otherwise trigger one.
  ssrNodes.set(
    "/project/style.css",
    new Set([
      {
        id: "/project/style.css",
        file: "/project/style.css",
        importers: new Set([routeNode]),
      },
    ]),
  );
  wsMessages.length = 0;
  await handlers.change[0]!("/project/style.css");
  assert.deepEqual(wsMessages, []);

  // Paths outside islands/ + routes/ are ignored by the structural handler.
  wsMessages.length = 0;
  await handlers.add[0]!("/project/somewhere/else.tsx");
  assert.deepEqual(invalidated, []);
  assert.deepEqual(wsMessages, []);
});

test("plugin: no longer registers Nitro routes/virtuals (routing is service-internal)", async () => {
  const fs = createMemFs([
    "/project/routes/_middleware.tsx",
    "/project/routes/index.tsx",
    "/project/routes/blog/[slug].tsx",
  ]);
  const [p] = fresh({ fs, writeFile: noopWrite });
  await config(p)({ root: "/project" });
  assert.equal(
    (p as { nitro?: unknown }).nitro,
    undefined,
    "fresh plugin should no longer carry a nitro setup module",
  );
});

test("plugin: writes per-route + per-middleware typings plus a .fresh/tsconfig.json", async () => {
  const fs = createMemFs({
    "/project/routes/_middleware.tsx": "",
    "/project/routes/admin/_middleware.tsx": "export interface State { user: string }",
    "/project/routes/index.tsx": "",
    "/project/routes/admin/post/[slug].tsx": "",
    "/project/routes/files/[...path].tsx": "",
  });

  const writes = new Map<string, string>();
  const writeFile = (p: string, content: string): Promise<void> => {
    writes.set(p, content);
    return Promise.resolve();
  };

  const [p] = fresh({ fs, writeFile });
  await config(p)({ root: "/project" });

  assert.deepEqual([...writes.keys()].sort(), [
    "/project/.fresh/tsconfig.json",
    "/project/.fresh/types/routes/$_middleware.ts",
    "/project/.fresh/types/routes/$index.ts",
    "/project/.fresh/types/routes/admin/$_middleware.ts",
    "/project/.fresh/types/routes/admin/post/$[slug].ts",
    "/project/.fresh/types/routes/files/$[...path].ts",
  ]);

  const tsconfig = JSON.parse(writes.get("/project/.fresh/tsconfig.json")!);
  assert.deepEqual(tsconfig.compilerOptions.rootDirs, ["..", "./types"]);
  assert.equal(tsconfig.compilerOptions.jsx, "react-jsx");
  assert.equal(tsconfig.compilerOptions.jsxImportSource, "preact");

  const indexFile = writes.get("/project/.fresh/types/routes/$index.ts")!;
  assert.match(indexFile, /export interface Params \{\}/);
  assert.match(indexFile, /export function handler</);
  assert.match(indexFile, /export function page\(/);
  assert.match(indexFile, /from "fresh\/types"/);
  assert.match(indexFile, /import type \{ State \} from "\.\/\$_middleware";/);

  const rootMw = writes.get("/project/.fresh/types/routes/$_middleware.ts")!;
  assert.match(rootMw, /interface ParentState \{\}/);
  assert.match(rootMw, /type OwnState = ParentState;/);

  const adminMw = writes.get("/project/.fresh/types/routes/admin/$_middleware.ts")!;
  assert.match(adminMw, /import type \{ State as ParentState \} from "\.\.\/\$_middleware";/);
  assert.match(adminMw, /type OwnState = import\("\.\/_middleware\.tsx"\)\.State;/);

  const slugFile = writes.get("/project/.fresh/types/routes/admin/post/$[slug].ts")!;
  assert.match(slugFile, /export interface Params \{\n {2}slug: string;\n\}/);
  assert.match(slugFile, /import type \{ State \} from "\.\.\/\$_middleware";/);

  const catchAllFile = writes.get("/project/.fresh/types/routes/files/$[...path].ts")!;
  assert.match(catchAllFile, /export interface Params \{\n {2}path: string;\n\}/);
  assert.match(catchAllFile, /import type \{ State \} from "\.\.\/\$_middleware";/);
});

test("plugin: writes $_error.ts typings when routes/_error.tsx exists", async () => {
  const fs = createMemFs({
    "/project/routes/_middleware.tsx": "",
    "/project/routes/admin/_middleware.tsx": "export interface State { user: string }",
    "/project/routes/_error.tsx": "",
    "/project/routes/index.tsx": "",
    "/project/routes/admin/users.tsx": "",
  });

  const writes = new Map<string, string>();
  const writeFile = (p: string, content: string): Promise<void> => {
    writes.set(p, content);
    return Promise.resolve();
  };

  const [p] = fresh({ fs, writeFile });
  await config(p)({ root: "/project" });

  const errorTyping = writes.get("/project/.fresh/types/routes/$_error.ts")!;
  assert.ok(errorTyping, "expected $_error.ts to be written");
  // State unions EVERY middleware in the project + EmptyState.
  assert.match(errorTyping, /type State = EmptyState \| State_0 \| State_1;/);
  // Both middleware imports are present.
  assert.match(errorTyping, /from "\.\/\$_middleware"/);
  assert.match(errorTyping, /from "\.\/admin\/\$_middleware"/);
});

test("plugin: writes per-layout typings, pulling State from the closest middleware", async () => {
  const fs = createMemFs({
    "/project/routes/_middleware.tsx": "",
    "/project/routes/_layout.tsx": "",
    "/project/routes/admin/_middleware.tsx": "export interface State { user: string }",
    "/project/routes/admin/_layout.tsx": "",
    "/project/routes/index.tsx": "",
    "/project/routes/admin/users.tsx": "",
  });

  const writes = new Map<string, string>();
  const writeFile = (p: string, content: string): Promise<void> => {
    writes.set(p, content);
    return Promise.resolve();
  };

  const [p] = fresh({ fs, writeFile });
  await config(p)({ root: "/project" });

  // Root layout → root middleware → State = ParentState (empty interface).
  const rootLayout = writes.get("/project/.fresh/types/routes/$_layout.ts")!;
  assert.ok(rootLayout, "expected $_layout.ts at root");
  assert.match(rootLayout, /import type \{ LayoutComponent \} from "fresh\/types"/);
  assert.match(rootLayout, /import type \{ State \} from "\.\/\$_middleware";/);
  assert.match(rootLayout, /export function layout\(/);

  // Admin layout → admin middleware → State pulled from `routes/admin`.
  const adminLayout = writes.get("/project/.fresh/types/routes/admin/$_layout.ts")!;
  assert.ok(adminLayout, "expected $_layout.ts under admin/");
  assert.match(adminLayout, /import type \{ State \} from "\.\/\$_middleware";/);
});

test("plugin: emits $_app.ts typings when _app.tsx is present", async () => {
  const fs = createMemFs({
    "/project/routes/_app.tsx": "",
    "/project/routes/index.tsx": "",
  });
  const writes = new Map<string, string>();
  const writeFile = (p: string, content: string): Promise<void> => {
    writes.set(p, content);
    return Promise.resolve();
  };

  const [p] = fresh({ fs, writeFile });
  await config(p)({ root: "/project" });

  const appTyping = writes.get("/project/.fresh/types/routes/$_app.ts");
  assert.ok(appTyping, "expected $_app.ts typings to be written");
  assert.match(appTyping!, /export function app\(/);
  assert.match(appTyping!, /AppComponent/);
  assert.match(appTyping!, /from "fresh\/types"/);
});

test("plugin: intercepts `./$<name>.ts` imports from route files with no-op helpers", async () => {
  const fs = createMemFs(["/project/routes/blog/[slug].tsx"]);
  const [p] = fresh({ fs, writeFile: noopWrite });
  await config(p)({ root: "/project" });

  const resolved = resolveId(p)("./$[slug].ts", "/project/routes/blog/[slug].tsx");
  assert.ok(resolved && resolved.startsWith("\0fresh:internal/define"));

  assert.equal(resolveId(p)("./$[slug].ts", "/project/somewhere/else.tsx"), null);
  assert.equal(resolveId(p)("./Counter.tsx", "/project/routes/blog/[slug].tsx"), null);

  const code = (await load(p)(resolved!)) as string;
  assert.match(code, /export const handler = \(h\) => h;/);
  assert.match(code, /export const page = \(fn\) => fn;/);
  assert.match(code, /export const middleware = \(fn\) => fn;/);
});

test("plugin: regenerates type files on watcher change", async () => {
  const fs = createMemFs(["/project/routes/index.tsx"]);

  let writeCount = 0;
  const writeFile = (): Promise<void> => {
    writeCount++;
    return Promise.resolve();
  };

  const [p] = fresh({ fs, writeFile });
  await config(p)({ root: "/project" });
  const initial = writeCount;
  assert.ok(initial > 0, "should write at least once during config()");

  const handlers: Record<string, ((file: string) => unknown)[]> = {
    add: [],
    change: [],
    unlink: [],
  };
  const server = {
    watcher: {
      add() {},
      on(event: "add" | "change" | "unlink", cb: (file: string) => unknown) {
        handlers[event].push(cb);
      },
    },
    moduleGraph: { getModuleById: () => null, invalidateModule() {} },
    ws: { send() {} },
  };
  await configureServer(p)(server);

  await handlers.change[0]!("/project/routes/index.tsx");
  assert.ok(writeCount > initial, `expected more writes after change, got ${writeCount}`);
});
