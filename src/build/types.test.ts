import { test } from "vitest";
import assert from "node:assert/strict";

import {
  detectStateExport,
  errorTypeFileContent,
  generateMiddlewareTypeFile,
  generateRouteTypeFile,
  layoutTypeFileContent,
  middlewareTypeFileContent,
  paramsFromFilePath,
  typeFileContent,
  typeFilePath,
} from "./types.ts";

// ---------- typeFilePath ----------

test("typeFilePath inserts $ before the filename and strips the route extension", () => {
  assert.equal(typeFilePath("routes/index.tsx"), ".fresh/types/routes/$index.ts");
  assert.equal(typeFilePath("routes/about.tsx"), ".fresh/types/routes/$about.ts");
});

test("typeFilePath preserves nesting and bracketed segments", () => {
  assert.equal(
    typeFilePath("routes/admin/post/[slug].tsx"),
    ".fresh/types/routes/admin/post/$[slug].ts",
  );
  assert.equal(
    typeFilePath("routes/files/[...path].tsx"),
    ".fresh/types/routes/files/$[...path].ts",
  );
});

test("typeFilePath accepts ts/jsx/js extensions", () => {
  assert.equal(typeFilePath("routes/a.ts"), ".fresh/types/routes/$a.ts");
  assert.equal(typeFilePath("routes/a.jsx"), ".fresh/types/routes/$a.ts");
  assert.equal(typeFilePath("routes/a.js"), ".fresh/types/routes/$a.ts");
});

test("typeFilePath rejects empty paths", () => {
  assert.throws(() => typeFilePath(""), TypeError);
  assert.throws(() => typeFilePath("/"), TypeError);
});

// ---------- typeFileContent (handlers) ----------

test("typeFileContent imports VNode from preact + Handler/InferData/PageProps from fresh/types", () => {
  const code = typeFileContent([], "routes/index.tsx", null, false);
  assert.match(code, /import type \{ VNode \} from "preact";/);
  assert.match(code, /import type \{ Handler, InferData, PageProps \} from "fresh\/types";/);
  assert.doesNotMatch(code, /export type \{/);
});

test("typeFileContent without a middleware defaults State to an empty interface (extendable)", () => {
  const code = typeFileContent([], "routes/index.tsx", null, false);
  assert.match(code, /interface State \{\}/);
  assert.match(code, /Handler<Params, State>/);
});

test("typeFileContent imports State from the closest middleware when present", () => {
  const code = typeFileContent(
    ["slug"],
    "routes/admin/post/[slug].tsx",
    "routes/admin/_middleware.tsx",
    false,
  );
  // Relative import from .fresh/types/routes/admin/post/$[slug].ts to
  // .fresh/types/routes/admin/$_middleware.ts → "../$_middleware".
  assert.match(code, /import type \{ State \} from "\.\.\/\$_middleware";/);
  assert.doesNotMatch(code, /interface State \{\}/);
});

test("typeFileContent: empty Params interface when no params", () => {
  const code = typeFileContent([], "routes/index.tsx", null, false);
  assert.match(code, /export interface Params \{\}/);
});

test("typeFileContent: typed Params interface for params", () => {
  const code = typeFileContent(["slug"], "routes/blog/[slug].tsx", null, false);
  assert.match(code, /export interface Params \{\n {2}slug: string;\n\}/);
});

test("typeFileContent: Data defaults to never when the user does not export handlers", () => {
  const code = typeFileContent([], "routes/index.tsx", null, false);
  assert.match(code, /type Data = never;/);
});

test("typeFileContent: Data inferred from `import(...).handlers` when the user exports handlers", () => {
  const code = typeFileContent([], "routes/index.tsx", null, true);
  assert.match(code, /type Data = InferData<typeof import\("\.\/index\.tsx"\)\.handlers>;/);
});

test("typeFileContent: emits standalone `handler` and `page` (no `define` namespace)", () => {
  const code = typeFileContent(["slug"], "routes/blog/[slug].tsx", null, false);
  assert.match(code, /export function handler<H extends Handler<Params, State>>\(h: H\): H/);
  assert.match(
    code,
    /export function page\(\s+fn: \(props: PageProps<Data, Params, State>\) => VNode,?\s+\): typeof fn/,
  );
  assert.doesNotMatch(code, /export const define/);
});

test("typeFileContent: standalone handler + page are identity at runtime", () => {
  const code = typeFileContent(["slug"], "routes/blog/[slug].tsx", null, false);
  // Strip the typing bits to get something that evaluates as plain JS.
  const stripped = code
    .replace(/^import [\s\S]*?;\s*$/gm, "")
    .replace(/^type Data = [\s\S]*?;\s*$/m, "")
    .replace(/^type State[\s\S]*?;\s*$/m, "")
    .replace(/^interface State \{\}\s*$/m, "")
    .replace(/^export interface [\s\S]*?\}\n/gm, "")
    .replace(
      /export function handler<H extends Handler<Params, State>>\(h: H\): H \{/,
      "function handler(h) {",
    )
    .replace(/export function page\([\s\S]*?\): typeof fn \{/, "function page(fn) {")
    .replace(/^\/\/.*$/gm, "");
  const mod = new Function(`${stripped}\nreturn { handler, page };`)();
  const fn = (_ctx: unknown) => new Response("ok");
  assert.equal(mod.handler(fn), fn);
  const methodMap = { GET: fn, POST: fn };
  assert.equal(mod.handler(methodMap), methodMap);
  const Page = () => "vnode";
  assert.equal(mod.page(Page), Page);
});

// ---------- middlewareTypeFileContent ----------

test("middlewareTypeFileContent: root middleware defaults ParentState to an empty interface (extendable)", () => {
  const code = middlewareTypeFileContent("routes/_middleware.tsx", null, false);
  assert.match(code, /interface ParentState \{\}/);
  assert.match(code, /type OwnState = ParentState;/);
  assert.match(code, /import type \{ MiddlewareFn \} from "fresh\/types";/);
  assert.match(code, /export type \{ ParentState \};/);
  assert.match(code, /export type State = OwnState;/);
  assert.match(code, /MiddlewareFn<ParentState, OwnState>/);
});

test("middlewareTypeFileContent: nested middleware imports ParentState from the parent typings file", () => {
  const code = middlewareTypeFileContent(
    "routes/admin/_middleware.tsx",
    "routes/_middleware.tsx",
    false,
  );
  // From .fresh/types/routes/admin/$_middleware.ts to
  // .fresh/types/routes/$_middleware.ts → "../$_middleware".
  assert.match(code, /import type \{ State as ParentState \} from "\.\.\/\$_middleware";/);
});

test("middlewareTypeFileContent: OwnState pulls State from the source via dotted import when user exports it", () => {
  const code = middlewareTypeFileContent(
    "routes/admin/_middleware.tsx",
    "routes/_middleware.tsx",
    true,
  );
  assert.match(code, /type OwnState = import\("\.\/_middleware\.tsx"\)\.State;/);
  assert.doesNotMatch(code, /type OwnState = ParentState;/);
});

test("middlewareTypeFileContent: emits standalone `middleware` typed with MiddlewareFn", () => {
  const code = middlewareTypeFileContent("routes/_middleware.tsx", null, false);
  assert.match(
    code,
    /export function middleware\(\s+fn: MiddlewareFn<ParentState, OwnState>,?\s+\): typeof fn/,
  );
  assert.doesNotMatch(code, /export const define/);
});

// ---------- generateMiddlewareTypeFile ----------

test("generateMiddlewareTypeFile returns the typings path next to the source", () => {
  const file = generateMiddlewareTypeFile(
    "routes/admin/_middleware.tsx",
    "routes/_middleware.tsx",
    false,
  );
  assert.equal(file.path, ".fresh/types/routes/admin/$_middleware.ts");
});

// ---------- detectStateExport ----------

test("detectStateExport finds `export interface State`", () => {
  assert.equal(detectStateExport(`export interface State { user: string }`), true);
});

test("detectStateExport finds `export type State`", () => {
  assert.equal(detectStateExport(`export type State = { id: string };`), true);
});

test("detectStateExport ignores unrelated `State` mentions", () => {
  assert.equal(detectStateExport(`const State = 1;`), false);
  assert.equal(detectStateExport(`export const State = {};`), false);
  assert.equal(detectStateExport(``), false);
});

// ---------- generateRouteTypeFile ----------

test("generateRouteTypeFile bundles path + content with the fresh/types specifier", () => {
  const file = generateRouteTypeFile("routes/admin/post/[slug].tsx", ["slug"], null, false);
  assert.equal(file.path, ".fresh/types/routes/admin/post/$[slug].ts");
  assert.match(file.content, /export interface Params \{\n {2}slug: string;\n\}/);
  assert.match(file.content, /from "fresh\/types"/);
});

// ---------- paramsFromFilePath ----------

test("paramsFromFilePath finds bracketed segments", () => {
  assert.deepEqual(paramsFromFilePath("routes/admin/post/[slug].tsx"), ["slug"]);
  assert.deepEqual(paramsFromFilePath("routes/files/[...path].tsx"), ["path"]);
  assert.deepEqual(paramsFromFilePath("routes/[org]/[id].tsx"), ["org", "id"]);
});

test("paramsFromFilePath returns [] when there are no params", () => {
  assert.deepEqual(paramsFromFilePath("routes/index.tsx"), []);
  assert.deepEqual(paramsFromFilePath("routes/admin/users.tsx"), []);
});

// ---------- layoutTypeFileContent ----------

test("layoutTypeFileContent emits a `layout` helper typed against LayoutComponent", () => {
  const content = layoutTypeFileContent("routes/_layout.tsx", null);
  assert.match(content, /import type \{ LayoutComponent \} from "fresh\/types"/);
  // No upstream middleware → empty State interface (extendable).
  assert.match(content, /interface State \{\}/);
  assert.match(
    content,
    /export function layout\(\s*fn: LayoutComponent<unknown, Record<string, string>, State>,?\s*\): typeof fn/,
  );
});

// ---------- errorTypeFileContent ----------

test("errorTypeFileContent emits typed `handler` (ErrorHandler) + `page` (ErrorPageProps) helpers", () => {
  const content = errorTypeFileContent("routes/_error.tsx", []);
  assert.match(
    content,
    /import type \{ EmptyState, ErrorHandler, ErrorPageProps, InferData \} from "fresh\/types"/,
  );
  // No middlewares → State is just EmptyState.
  assert.match(content, /type State = EmptyState;/);
  // Empty Params (the error route isn't URL-addressable).
  assert.match(content, /export interface Params \{\}/);
  // Data inferred from the user's `handlers` export.
  assert.match(content, /type Data = InferData<typeof import\("\.\/_error\.tsx"\)\.handlers>;/);
  // Handler typing is the error-specific shape (single-fn OR method-map,
  // each receiving an ErrorHandlerContext) — not the broken intersection
  // that used to reject method-map handlers.
  assert.match(content, /handler<H extends ErrorHandler<Params, State>>\(h: H\): H/);
  // Page props are ErrorPageProps (extends PageProps with `error`).
  assert.match(content, /ErrorPageProps<Data, Params, State>/);
});

test("errorTypeFileContent unions every middleware's State (plus EmptyState) into State", () => {
  const content = errorTypeFileContent("routes/_error.tsx", [
    "routes/_middleware.tsx",
    "routes/admin/_middleware.tsx",
  ]);
  assert.match(content, /import type \{ State as State_0 \} from "\.\/\$_middleware";/);
  assert.match(content, /import type \{ State as State_1 \} from "\.\/admin\/\$_middleware";/);
  assert.match(content, /type State = EmptyState \| State_0 \| State_1;/);
});

test("layoutTypeFileContent pulls State from the closest middleware when present", () => {
  const content = layoutTypeFileContent("routes/admin/_layout.tsx", "routes/admin/_middleware.tsx");
  assert.match(content, /import type \{ State \} from "\.\/\$_middleware";/);
  assert.doesNotMatch(content, /interface State \{\}/);
});
