// Islands are the parts of a Fresh page that come alive in the browser.
// Everything else renders once on the server and ships as static HTML; an
// island also re-renders on the client and wires up its own event handlers.
// For that to work the server has to point each rendered island at its *client*
// build when it streams a page — and it has to do so without ever importing
// that client bundle itself.
//
// This module is the build-time half of that handshake. It runs over every
// island source file and tags each exported function with a small marker:
//
//     Counter.__FRESH_SERIALIZABLE_FUNCTION = { specifier, export };
//
// When the renderer later meets a component carrying this marker, it knows
// "this is the `export` from `specifier`" — exactly enough to open a hydration
// boundary that the client runtime picks up after load. The marker is the only
// channel between the two halves; the server module never reaches into the
// client bundle.
//
// We run the transform in the SSR environment only. The client already knows
// which module it is, so the markers would be dead weight in the browser
// bundle — better to leave those bytes on the server.
//
// ## What gets tagged
//
// We cast the net wide on purpose: every export with a local binding is a
// candidate, whatever its shape — a function, a `const`, a destructured
// binding, a re-export. There's no attempt to guess at build time which
// exports are "really" components. Instead, two cheap guards in the emitted
// code keep the tagging harmless at runtime:
//
//   * `typeof X === "function"` — constants, objects, and the like are simply
//     skipped, so tagging a non-component export costs nothing.
//   * `!X.__FRESH_SERIALIZABLE_FUNCTION` — a binding that already carries a
//     marker keeps it, so re-exporting an island from another file
//     (`export { Counter } from "./Counter.tsx"`) preserves the original
//     specifier instead of stamping over it.
//
// ## Anonymous default exports
//
// `export default () => …`, `export default function () {}`, and
// `export default class {}` have no name to hang a property off. For those we
// first rewrite the export to give it one — a generated `const` — and then tag
// that:
//
//     const __fresh_island_default = () => …;
//     export default __fresh_island_default;
//
// Every edit flows through a single `MagicString`, so the transform hands back
// a source map that still lines up with the file the author wrote.

import * as path from "node:path";
import MagicString from "magic-string";
import { parseAst } from "rolldown/parseAst";
import type {
  BindingPattern,
  BindingRestElement,
  ExportDefaultDeclaration,
  ExportNamedDeclaration,
  IdentifierReference,
} from "@oxc-project/types";

/** The property each island export is tagged with, and the object's shape. */
const MARKER_PROP = "__FRESH_SERIALIZABLE_FUNCTION";

/**
 * Which files Fresh treats as islands: the top-level `islands/` directory, and
 * islands co-located with a route inside a `(_islands)/` group folder (the
 * parenthesised folder is dropped from the URL, matching Fresh 2). Only
 * `.tsx`/`.ts`/`.jsx`/`.js` sources qualify.
 */
export const ISLAND_PATH_RE: RegExp =
  /(?:^|[/\\])(?:islands|\(_islands\))[/\\].+\.(?:tsx|ts|jsx|js)$/;

/** The name we lift an anonymous default export onto so it has a binding to tag. */
export const ANON_DEFAULT_LOCAL = "__fresh_island_default";

type Lang = "ts" | "tsx" | "js" | "jsx";
const LANG_BY_EXT: Record<string, Lang> = {
  ".ts": "ts",
  ".tsx": "tsx",
  ".js": "js",
  ".jsx": "jsx",
};

export interface DetectedIslandExport {
  /** The name the value is exported under, or `null` for the default export. */
  exportName: string | null;
  /** The in-file binding the marker assignment attaches to. */
  localName: string;
}

/**
 * Gather every name a `const`/`let`/`var` declarator binds. A plain
 * `export const Foo = …` binds a single name; a destructuring pattern can bind
 * many. We walk array and object patterns all the way down — through nesting,
 * defaults, rest elements, and array holes — so that
 * `export const [a, [b], { c: d, ...e }] = …` yields `["a", "b", "d", "e"]`.
 * For object patterns we take the *value* binding, not the key, so `{ c: d }`
 * binds `d`.
 */
function collectPatternNames(pattern: BindingPattern | BindingRestElement | null): string[] {
  if (!pattern) return [];
  switch (pattern.type) {
    case "Identifier":
      return typeof pattern.name === "string" ? [pattern.name] : [];
    case "ArrayPattern":
      return (pattern.elements ?? []).flatMap(collectPatternNames);
    case "ObjectPattern":
      return (pattern.properties ?? []).flatMap((prop) =>
        prop.type === "RestElement"
          ? collectPatternNames(prop.argument)
          : collectPatternNames(prop.value),
      );
    case "AssignmentPattern": // `[a = 1]` / `{ a = 1 }` — recurse into the binding
      return collectPatternNames(pattern.left);
    case "RestElement": // `[...rest]` / `{ ...rest }`
      return collectPatternNames(pattern.argument);
    default:
      return [];
  }
}

/**
 * The exports introduced by a single `export …` statement that has no `from`
 * source — i.e. ones whose bindings live in this module. Covers
 * `export function`/`export class`, every binding of an `export const/let/var`
 * (including destructuring), and bare `export { … }` specifier lists.
 */
function namedExports(node: ExportNamedDeclaration): DetectedIslandExport[] {
  // `export { Foo } from "./other"` re-exports a binding owned by another
  // module — there's nothing in this file to tag.
  if (node.source) return [];

  const decl = node.declaration;
  if (decl) {
    // `export function Foo() {}` / `export class Foo {}`
    if (
      (decl.type === "FunctionDeclaration" || decl.type === "ClassDeclaration") &&
      decl.id?.name
    ) {
      return [{ exportName: decl.id.name, localName: decl.id.name }];
    }
    // `export const Foo = …`, and every binding a destructuring pattern
    // introduces (`export const { a, b } = …`, `export const [a, b] = …`).
    // Each bound identifier is its own local *and* exported name.
    if (decl.type === "VariableDeclaration") {
      return decl.declarations.flatMap((d) =>
        collectPatternNames(d.id).map((name) => ({ exportName: name, localName: name })),
      );
    }
    // Some other declaration (e.g. `export interface`) — not a value to tag.
    return [];
  }

  // `export { Foo, Bar as Baz }` — each specifier pairs an in-file binding
  // (`local`) with the name it's exported under (`exported`). We tag the local
  // and remember the exported name for the hydration lookup. String-literal
  // aliases (`export { Foo as "a b" }`) aren't usable island names, so skip them.
  const out: DetectedIslandExport[] = [];
  for (const spec of node.specifiers ?? []) {
    const localName = (spec.local as IdentifierReference).name;
    const exportName = spec.exported.type === "Identifier" ? spec.exported.name : null;
    if (typeof exportName === "string") out.push({ exportName, localName });
  }
  return out;
}

/**
 * The export introduced by an `export default …`, or `null` when the default
 * is something that can't be an island (an object, a primitive, …). When the
 * default is an anonymous function or class it has no binding to tag, so we
 * rewrite `s` in place to lift it onto {@link ANON_DEFAULT_LOCAL} first.
 */
function defaultExport(
  node: ExportDefaultDeclaration,
  source: string,
  s: MagicString,
): DetectedIslandExport | null {
  const decl = node.declaration;

  // `export default function Counter() {}` / `export default class Counter {}`
  // already have a name — tag it where it stands, no rewrite needed.
  if (
    (decl.type === "FunctionDeclaration" ||
      decl.type === "FunctionExpression" ||
      decl.type === "ClassDeclaration") &&
    decl.id?.name
  ) {
    return { exportName: null, localName: decl.id.name };
  }

  // `export default Counter` — points at a binding declared elsewhere in the
  // file; tag that binding directly.
  if (decl.type === "Identifier" && typeof decl.name === "string") {
    return { exportName: null, localName: decl.name };
  }

  // Anonymous function/arrow/class default — no name to tag. Lift the value
  // into a generated `const` and re-export that, so there's a binding to stamp.
  if (
    decl.type === "FunctionDeclaration" ||
    decl.type === "FunctionExpression" ||
    decl.type === "ArrowFunctionExpression" ||
    decl.type === "ClassDeclaration" ||
    decl.type === "ClassExpression"
  ) {
    const value = source.slice(decl.start, decl.end);
    s.overwrite(
      node.start,
      node.end,
      `const ${ANON_DEFAULT_LOCAL} = ${value};\nexport default ${ANON_DEFAULT_LOCAL};`,
    );
    return { exportName: null, localName: ANON_DEFAULT_LOCAL };
  }

  // Any other default (object, primitive, call expression, …) isn't an island.
  return null;
}

export interface IslandAnalysis {
  /**
   * The module text as a `MagicString`, already carrying any rewrite an
   * anonymous default export needed. {@link appendIslandMarkers} appends the
   * marker assignments to it; the caller serializes the final result with
   * `s.toString()` and `s.generateMap(...)`.
   */
  s: MagicString;
  /** The exports {@link appendIslandMarkers} should tag. */
  exports: DetectedIslandExport[];
}

/**
 * Parse an island source file and work out what to tag. Returns the module as a
 * `MagicString` (rewritten in place if an anonymous default had to be lifted)
 * alongside the list of exports to mark. Re-exports with a `from` source are
 * left alone — their bindings belong to another module, which the transform
 * tags on its own pass.
 */
export function analyzeIslandSource(source: string, filename: string): IslandAnalysis {
  const lang = LANG_BY_EXT[path.extname(filename)] ?? "tsx";
  const ast = parseAst(source, { lang }, filename);

  const s = new MagicString(source);
  const exports: DetectedIslandExport[] = [];

  for (const node of ast.body) {
    if (node.type === "ExportNamedDeclaration") {
      exports.push(...namedExports(node));
    } else if (node.type === "ExportDefaultDeclaration") {
      const detected = defaultExport(node, source, s);
      if (detected) exports.push(detected);
    }
  }

  return { s, exports };
}

/**
 * Append the marker assignments — one per detected export — to the module.
 * Each assignment is guarded twice: `typeof … === "function"` so non-function
 * exports are skipped at runtime, and `!….__FRESH_SERIALIZABLE_FUNCTION` so a
 * binding that already carries a marker (a re-exported island) keeps its
 * original specifier. A file with no detected exports is left untouched.
 */
export function appendIslandMarkers(
  s: MagicString,
  exports: readonly DetectedIslandExport[],
  specifier: string,
): void {
  if (exports.length === 0) return;

  const lines = ["", `// ${MARKER_PROP} markers injected by fresh/vite`];
  for (const { exportName, localName } of exports) {
    const payload = JSON.stringify({ specifier, export: exportName });
    lines.push(
      `if (typeof ${localName} === "function" && !${localName}.${MARKER_PROP}) ${localName}.${MARKER_PROP} = ${payload};`,
    );
  }
  lines.push("");
  s.append(lines.join("\n"));
}
