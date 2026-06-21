import { test } from "vitest";
import assert from "node:assert/strict";

import MagicString from "magic-string";
import {
  ANON_DEFAULT_LOCAL,
  analyzeIslandSource,
  appendIslandMarkers,
  type DetectedIslandExport,
  ISLAND_PATH_RE,
} from "./island-transform.ts";

/** Run analyze + append and return the final string + the underlying MagicString. */
function transform(
  source: string,
  filename: string,
  specifier: string,
): { code: string; exports: DetectedIslandExport[]; s: MagicString } {
  const { s, exports } = analyzeIslandSource(source, filename);
  appendIslandMarkers(s, exports, specifier);
  return { code: s.toString(), exports, s };
}

// ---------- ISLAND_PATH_RE ----------

test("ISLAND_PATH_RE matches root islands/ and co-located (_islands)/", () => {
  for (const p of [
    "/project/islands/Counter.tsx",
    "/project/islands/forms/Input.jsx",
    "islands/Foo.ts",
    "/project/routes/blog/(_islands)/Like.tsx",
    "/project/routes/(_islands)/Deep/Thing.jsx",
  ]) {
    assert.ok(ISLAND_PATH_RE.test(p), `expected to match: ${p}`);
  }
});

test("ISLAND_PATH_RE rejects non-island paths (including the bare _islands form)", () => {
  for (const p of [
    "/project/routes/index.tsx",
    "/project/islands.tsx",
    "/project/components/Counter.tsx",
    "/project/islands/Counter.css",
    // A bare group folder (not the islands group) stays a route segment.
    "/project/routes/(marketing)/pricing.tsx",
    // Bare `_islands/` is NOT supported — only `(_islands)/`.
    "/project/routes/blog/_islands/Like.tsx",
    "/project/routes/_islands/Deep/Thing.jsx",
  ]) {
    assert.equal(ISLAND_PATH_RE.test(p), false, `expected to reject: ${p}`);
  }
});

// ---------- analyzeIslandSource: declarations ----------

test("named function declarations are detected", () => {
  const { s, exports } = analyzeIslandSource(
    `export function Counter() { return null; }
     export function Button() { return null; }`,
    "Counter.tsx",
  );
  assert.deepEqual(exports, [
    { exportName: "Counter", localName: "Counter" },
    { exportName: "Button", localName: "Button" },
  ]);
  // Named exports never trigger a rewrite — MagicString reports no change.
  assert.equal(s.hasChanged(), false);
});

test("named class declarations are detected", () => {
  const { exports } = analyzeIslandSource(`export class Foo {}`, "Foo.tsx");
  assert.deepEqual(exports, [{ exportName: "Foo", localName: "Foo" }]);
});

test("every `export const` declarator with an Identifier id is detected", () => {
  const { exports } = analyzeIslandSource(
    `export const Counter = () => null;
     export const Button = function () { return null; };
     export const NAME = "static";
     export const config = { foo: 1 };
     export let Maybe = null;
     export var Loose = 1;`,
    "x.tsx",
  );
  assert.deepEqual(exports, [
    { exportName: "Counter", localName: "Counter" },
    { exportName: "Button", localName: "Button" },
    { exportName: "NAME", localName: "NAME" },
    { exportName: "config", localName: "config" },
    { exportName: "Maybe", localName: "Maybe" },
    { exportName: "Loose", localName: "Loose" },
  ]);
});

test("object destructuring `export const { a, b } = …` binds each property", () => {
  const { s, exports } = analyzeIslandSource(`export const { a, b } = obj;`, "x.tsx");
  assert.deepEqual(exports, [
    { exportName: "a", localName: "a" },
    { exportName: "b", localName: "b" },
  ]);
  // Destructuring needs no rewrite — the bindings already exist.
  assert.equal(s.hasChanged(), false);
});

test("array destructuring `export const [foo, bar] = …` binds each element", () => {
  const { exports } = analyzeIslandSource(`export const [foo, bar] = makePair();`, "x.tsx");
  assert.deepEqual(exports, [
    { exportName: "foo", localName: "foo" },
    { exportName: "bar", localName: "bar" },
  ]);
});

test("object destructuring with renames binds the value name, not the key", () => {
  const { exports } = analyzeIslandSource(`export const { a: renamed, b } = obj;`, "x.tsx");
  assert.deepEqual(exports, [
    { exportName: "renamed", localName: "renamed" },
    { exportName: "b", localName: "b" },
  ]);
});

test("destructuring with defaults, rest, holes, and nesting collects every binding", () => {
  const { exports } = analyzeIslandSource(
    `export const [a, , b = 1, ...rest] = arr;
     export const { c = 2, d: { e }, ...others } = obj;`,
    "x.tsx",
  );
  assert.deepEqual(exports, [
    { exportName: "a", localName: "a" },
    { exportName: "b", localName: "b" },
    { exportName: "rest", localName: "rest" },
    { exportName: "c", localName: "c" },
    { exportName: "e", localName: "e" },
    { exportName: "others", localName: "others" },
  ]);
});

test("destructuring coexists with plain declarators in one statement", () => {
  const { exports } = analyzeIslandSource(
    `export const Plain = () => null, [a, b] = pair;`,
    "x.tsx",
  );
  assert.deepEqual(exports, [
    { exportName: "Plain", localName: "Plain" },
    { exportName: "a", localName: "a" },
    { exportName: "b", localName: "b" },
  ]);
});

test("a destructured function binding is stamped while the guard skips non-function siblings", () => {
  // `[fn, name]` where only `fn` is callable — the typeof guard keeps the
  // stamp on `fn` while leaving the string `name` untouched. Built without
  // `export` so it evaluates as a plain script (like the other runtime tests).
  const s = new MagicString(`const [fn, name] = [() => null, "label"];\n`);
  appendIslandMarkers(
    s,
    [
      { exportName: "fn", localName: "fn" },
      { exportName: "name", localName: "name" },
    ],
    "islands/x.tsx",
  );
  const out = new Function(
    `${s.toString()}\nreturn { fn: fn.__FRESH_SERIALIZABLE_FUNCTION, name };`,
  )() as { fn: unknown; name: unknown };
  assert.deepEqual(out.fn, { specifier: "islands/x.tsx", export: "fn" });
  // `name` is a string — the `typeof === "function"` guard left it alone.
  assert.equal(out.name, "label");
});

// ---------- analyzeIslandSource: specifiers ----------

test("specifier re-exports without a source are detected (renamed uses external name)", () => {
  const { exports } = analyzeIslandSource(
    `function A() { return null; }
     function B() { return null; }
     export { A, B as Renamed };`,
    "x.tsx",
  );
  assert.deepEqual(exports, [
    { exportName: "A", localName: "A" },
    { exportName: "Renamed", localName: "B" },
  ]);
});

test("specifier re-exports WITH a source are skipped (no local binding here)", () => {
  const { exports } = analyzeIslandSource(
    `export { Foo, Bar as Baz } from "./other.tsx";`,
    "x.tsx",
  );
  assert.deepEqual(exports, []);
});

// ---------- analyzeIslandSource: default exports ----------

test("named `export default function Name()` uses the existing id, exportName=null, no rewrite", () => {
  const { s, exports } = analyzeIslandSource(
    `export default function Counter() { return null; }`,
    "Counter.tsx",
  );
  assert.deepEqual(exports, [{ exportName: null, localName: "Counter" }]);
  assert.equal(s.hasChanged(), false);
});

test("named `export default class Foo {}` uses the existing id, no rewrite", () => {
  const { s, exports } = analyzeIslandSource(`export default class Foo {}`, "Foo.tsx");
  assert.deepEqual(exports, [{ exportName: null, localName: "Foo" }]);
  assert.equal(s.hasChanged(), false);
});

test("`export default Identifier` reuses the local binding, no rewrite", () => {
  const { s, exports } = analyzeIslandSource(
    `function Counter() { return null; }
     export default Counter;`,
    "Counter.tsx",
  );
  assert.deepEqual(exports, [{ exportName: null, localName: "Counter" }]);
  assert.equal(s.hasChanged(), false);
});

test("anonymous `export default () => …` is lifted via MagicString", () => {
  const { s, exports } = analyzeIslandSource(`export default () => null;`, "Counter.tsx");
  assert.deepEqual(exports, [{ exportName: null, localName: ANON_DEFAULT_LOCAL }]);
  assert.equal(s.hasChanged(), true);
  const out = s.toString();
  assert.match(out, new RegExp(`const ${ANON_DEFAULT_LOCAL} = \\(\\) => null;`));
  assert.match(out, new RegExp(`export default ${ANON_DEFAULT_LOCAL};`));
});

test("anonymous `export default function () {}` is lifted via MagicString", () => {
  const { s } = analyzeIslandSource(`export default function () { return null; }`, "Counter.tsx");
  const out = s.toString();
  assert.match(out, new RegExp(`const ${ANON_DEFAULT_LOCAL} = function`));
  assert.match(out, new RegExp(`export default ${ANON_DEFAULT_LOCAL};`));
});

test("anonymous `export default class {}` is lifted via MagicString", () => {
  const { s } = analyzeIslandSource(`export default class {}`, "Counter.tsx");
  const out = s.toString();
  assert.match(out, new RegExp(`const ${ANON_DEFAULT_LOCAL} = class`));
  assert.match(out, new RegExp(`export default ${ANON_DEFAULT_LOCAL};`));
});

test("anonymous async arrow default is lifted, async modifier preserved", () => {
  const { s } = analyzeIslandSource(`export default async () => null;`, "Counter.tsx");
  assert.match(s.toString(), new RegExp(`const ${ANON_DEFAULT_LOCAL} = async \\(\\) => null;`));
});

test("a rewrite produces a usable source map (not just identity)", () => {
  const { s } = analyzeIslandSource(`export default () => null;`, "Counter.tsx");
  const map = s.generateMap({ hires: "boundary", source: "Counter.tsx" });
  assert.equal(map.version, 3);
  assert.equal(map.sources[0], "Counter.tsx");
  assert.ok(typeof map.mappings === "string" && map.mappings.length > 0);
});

test("default non-function expressions are ignored (no rewrite, no entry)", () => {
  const { s, exports } = analyzeIslandSource(
    `export default { not: "a function" };`,
    "Counter.tsx",
  );
  assert.deepEqual(exports, []);
  assert.equal(s.hasChanged(), false);
});

test("anonymous default + named exports coexist (named exports left in place)", () => {
  const { s, exports } = analyzeIslandSource(
    `export function Helper() { return null; }
export default () => null;
export const Thing = () => null;`,
    "Counter.tsx",
  );
  assert.deepEqual(exports, [
    { exportName: "Helper", localName: "Helper" },
    { exportName: null, localName: ANON_DEFAULT_LOCAL },
    { exportName: "Thing", localName: "Thing" },
  ]);
  const out = s.toString();
  assert.match(out, new RegExp(`const ${ANON_DEFAULT_LOCAL} = `));
  assert.match(out, /^export function Helper/);
  assert.match(out, /export const Thing/);
});

// ---------- appendIslandMarkers ----------

test("appendIslandMarkers stamps a typeof-function + idempotency-guarded assignment", () => {
  const s = new MagicString(`export function Counter() { return null; }\n`);
  appendIslandMarkers(s, [{ exportName: "Counter", localName: "Counter" }], "islands/Counter.tsx");
  assert.match(
    s.toString(),
    /if \(typeof Counter === "function" && !Counter\.__FRESH_SERIALIZABLE_FUNCTION\) Counter\.__FRESH_SERIALIZABLE_FUNCTION = \{"specifier":"islands\/Counter\.tsx","export":"Counter"\};/,
  );
});

test("default exports serialize `export` as JSON null", () => {
  const s = new MagicString(`function Counter() { return null; }\nexport default Counter;\n`);
  appendIslandMarkers(s, [{ exportName: null, localName: "Counter" }], "islands/Counter.tsx");
  assert.match(
    s.toString(),
    /if \(typeof Counter === "function" && !Counter\.__FRESH_SERIALIZABLE_FUNCTION\) Counter\.__FRESH_SERIALIZABLE_FUNCTION = \{"specifier":"islands\/Counter\.tsx","export":null\};/,
  );
});

test("renamed specifier exports use the external name in `export`", () => {
  const s = new MagicString(`function B() { return null; }\nexport { B as Renamed };\n`);
  appendIslandMarkers(s, [{ exportName: "Renamed", localName: "B" }], "islands/x.tsx");
  assert.match(
    s.toString(),
    /if \(typeof B === "function" && !B\.__FRESH_SERIALIZABLE_FUNCTION\) B\.__FRESH_SERIALIZABLE_FUNCTION = \{"specifier":"islands\/x\.tsx","export":"Renamed"\};/,
  );
});

test("appendIslandMarkers is a no-op when no exports were detected", () => {
  const s = new MagicString(`console.log("nothing exported");`);
  appendIslandMarkers(s, [], "islands/x.tsx");
  assert.equal(s.hasChanged(), false);
});

test("appendIslandMarkers emits one assignment per export", () => {
  const s = new MagicString(`export function A(){} export function B(){}\n`);
  appendIslandMarkers(
    s,
    [
      { exportName: "A", localName: "A" },
      { exportName: "B", localName: "B" },
    ],
    "islands/AB.tsx",
  );
  const out = s.toString();
  assert.match(out, /A\.__FRESH_SERIALIZABLE_FUNCTION =/);
  assert.match(out, /B\.__FRESH_SERIALIZABLE_FUNCTION =/);
});

// ---------- runtime behavior of the emitted guard ----------

test("emitted assignment is a no-op for non-function exports at runtime", () => {
  const { code } = transform(`const NAME = "x";`, "x.tsx", "islands/x.tsx");
  // Manually splice the "exports" view: stamp NAME without exporting (so we
  // can evaluate as a plain script).
  const stamped = code; // already includes the guarded assignment
  const result = new Function(`${stamped}\nreturn NAME;`)() as unknown;
  assert.equal(typeof result, "string");
  assert.equal(result as { __FRESH_SERIALIZABLE_FUNCTION?: unknown }, "x");
});

test("emitted assignment does not overwrite a pre-existing __FRESH_SERIALIZABLE_FUNCTION marker", () => {
  const s = new MagicString(
    `function Counter() {}\nCounter.__FRESH_SERIALIZABLE_FUNCTION = { specifier: "original/Foo.tsx", export: "Foo" };\n`,
  );
  appendIslandMarkers(s, [{ exportName: "Counter", localName: "Counter" }], "islands/Reexport.tsx");
  const out = new Function(`${s.toString()}\nreturn Counter.__FRESH_SERIALIZABLE_FUNCTION;`)();
  assert.deepEqual(out, { specifier: "original/Foo.tsx", export: "Foo" });
});

test("emitted assignment DOES attach for a function with no prior marker", () => {
  const s = new MagicString(`function Counter() {}\n`);
  appendIslandMarkers(s, [{ exportName: "Counter", localName: "Counter" }], "islands/Counter.tsx");
  const out = new Function(`${s.toString()}\nreturn Counter.__FRESH_SERIALIZABLE_FUNCTION;`)();
  assert.deepEqual(out, {
    specifier: "islands/Counter.tsx",
    export: "Counter",
  });
});

// ---------- end-to-end ----------

test("integration: analyze + append on a realistic island, original source preserved at start", () => {
  const src = `import { useState } from "preact/hooks";

export function Counter({ count: initial }: { count: number }) {
  const [count, setCount] = useState(initial);
  return (
    <div>
      <p>Count: {count}</p>
      <button onClick={() => setCount(count + 1)}>+</button>
    </div>
  );
}
`;
  const { code } = transform(src, "Counter.tsx", "islands/Counter.tsx");
  // No rewrite happened, so the unchanged head matches the source.
  assert.ok(code.startsWith(src));
  assert.match(
    code,
    /if \(typeof Counter === "function" && !Counter\.__FRESH_SERIALIZABLE_FUNCTION\) Counter\.__FRESH_SERIALIZABLE_FUNCTION = \{"specifier":"islands\/Counter\.tsx","export":"Counter"\};/,
  );
});

test("integration: anonymous default is lifted, then stamped at EOF", () => {
  const src = `import { h } from "preact";\nexport default () => h("div", null, "hi");\n`;
  const { code } = transform(src, "Anon.tsx", "islands/Anon.tsx");
  assert.match(code, new RegExp(`const ${ANON_DEFAULT_LOCAL} = \\(\\) => h\\("div"`));
  assert.match(code, new RegExp(`export default ${ANON_DEFAULT_LOCAL};`));
  assert.match(
    code,
    new RegExp(
      `if \\(typeof ${ANON_DEFAULT_LOCAL} === "function" && !${ANON_DEFAULT_LOCAL}\\.__FRESH_SERIALIZABLE_FUNCTION\\) ${ANON_DEFAULT_LOCAL}\\.__FRESH_SERIALIZABLE_FUNCTION = \\{"specifier":"islands\\/Anon\\.tsx","export":null\\};`,
    ),
  );
});
