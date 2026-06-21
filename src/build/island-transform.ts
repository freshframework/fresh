// SSR-only transform that marks every exported function in an island source
// file with a `__FRESH_SERIALIZABLE_FUNCTION = { specifier, export }` property.
//
// At SSR render time the framework sees these markers on the rendered
// component and emits a hydration boundary keyed by the specifier — without
// the SSR module ever needing to import the client-side bundle.
//
// We run the transform only in the SSR environment so the client bundle stays
// free of these markers (they're useless to the client and we'd rather not
// ship the extra bytes there).
//
// Detection is intentionally broad: every exported identifier with a local
// binding is a candidate. Two runtime guards keep the stamping safe:
//
//   * `typeof X === "function"` skips non-function exports (constants,
//     objects, …) without throwing.
//   * `!X.__FRESH_SERIALIZABLE_FUNCTION` preserves a previously-set marker, so re-exports
//     of an island from another file (`export { Foo } from "./Foo.tsx"`)
//     don't clobber the original specifier.
//
// Anonymous default exports (`export default () => …`, `export default
// function () {}`, `export default class {}`) have no addressable binding
// to hang a property off — they're lifted to a named const
// (`const __fresh_island_default = …; export default
// __fresh_island_default;`) before being reported.
//
// All edits flow through a single `MagicString` instance, so the transform
// returns a proper source map that lines up with the original source.

import * as path from "node:path";
import MagicString from "magic-string";
import { parseAst } from "rolldown/parseAst";
import type { BindingPattern, BindingRestElement, IdentifierReference } from "@oxc-project/types";

/**
 * Detected island file path shapes — the root `islands/…` directory and
 * co-located islands in a `routes/**\/(_islands)/…` route-group folder (the
 * folder is dropped from the URL, Fresh 2 parity).
 */
export const ISLAND_PATH_RE: RegExp =
  /(?:^|[/\\])(?:islands|\(_islands\))[/\\].+\.(?:tsx|ts|jsx|js)$/;

/** Local binding inserted when lifting an anonymous default export. */
export const ANON_DEFAULT_LOCAL = "__fresh_island_default";

type Lang = "ts" | "tsx" | "js" | "jsx";
const LANG_BY_EXT: Record<string, Lang> = {
  ".ts": "ts",
  ".tsx": "tsx",
  ".js": "js",
  ".jsx": "jsx",
};

export interface DetectedIslandExport {
  /** The exported name, or `null` for the default export. */
  exportName: string | null;
  /** The local binding the property assignment attaches to. */
  localName: string;
}

/**
 * Collect every identifier bound by a `const`/`let`/`var` declarator id —
 * either a plain `Identifier` or a destructuring pattern. Walks array and
 * object patterns (including nesting, defaults, rest elements, and array
 * holes), so `export const [a, [b], { c: d, ...e }] = …` yields
 * `["a", "b", "d", "e"]`. For object patterns the *value* binding is taken,
 * not the key, so `{ c: d }` binds `d`.
 */
// deno-lint-ignore no-explicit-any
function collectPatternNames(pattern: BindingPattern | BindingRestElement): string[] {
  if (!pattern) return []; // array hole (`[, x]`) surfaces as a null element
  switch (pattern.type) {
    case "Identifier":
      return typeof pattern.name === "string" ? [pattern.name] : [];
    case "ArrayPattern":
      // deno-lint-ignore no-explicit-any
      return (pattern.elements ?? []).flatMap((el: any) => collectPatternNames(el));
    case "ObjectPattern":
      // deno-lint-ignore no-explicit-any
      return (pattern.properties ?? []).flatMap((prop: any) =>
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

export interface IslandAnalysis {
  /**
   * Live `MagicString` instance carrying the (possibly rewritten) module
   * text. `appendIslandMarkers` will append to it; the caller serializes via
   * `s.toString()` + `s.generateMap(...)` at the end.
   */
  s: MagicString;
  /** Exports the transform should mark. */
  exports: DetectedIslandExport[];
}

/**
 * Parse `source` and return:
 *  - a `MagicString` carrying the (possibly rewritten) module text, and
 *  - the list of exports to mark with `__FRESH_SERIALIZABLE_FUNCTION`.
 *
 * The walk covers function/class declarations, `export const/let/var`
 * declarators — both `Identifier` ids and destructuring patterns
 * (`export const [a, b] = …`, `export const { a, b } = …`) via
 * {@link collectPatternNames} — named-specifier re-exports without a source
 * (`export { Foo, Bar as Baz }`), and `export default …`. Re-exports with a
 * source (`export { Foo } from "./x"`) are skipped — they have no local
 * binding in this module.
 */
export function analyzeIslandSource(source: string, filename: string): IslandAnalysis {
  const ext = path.extname(filename);
  const lang = LANG_BY_EXT[ext] ?? "tsx";
  // Oxc/Rolldown AST surface is large and version-dependent; narrow with
  // structural checks instead of pulling typings.
  // deno-lint-ignore no-explicit-any
  const ast = parseAst(source, { lang }, filename);

  const s = new MagicString(source);
  const exports: DetectedIslandExport[] = [];

  // deno-lint-ignore no-explicit-any
  for (const node of ast.body) {
    if (node.type === "ExportNamedDeclaration") {
      // `export { Foo } from "./other"` — no local binding, skip.
      if (node.source) continue;

      const decl = node.declaration;
      if (decl) {
        if (
          (decl.type === "FunctionDeclaration" || decl.type === "ClassDeclaration") &&
          decl.id?.name
        ) {
          exports.push({ exportName: decl.id.name, localName: decl.id.name });
          continue;
        }
        if (decl.type === "VariableDeclaration") {
          for (const d of decl.declarations) {
            // Plain `export const Foo = …` and destructuring
            // (`export const [a, b] = …`, `export const { a, b } = …`) alike —
            // each bound identifier is its own local + exported name.
            for (const name of collectPatternNames(d.id)) {
              exports.push({ exportName: name, localName: name });
            }
          }
          continue;
        }
      }

      // `export { Foo, Bar as Baz };` — locally-bound specifiers.
      for (const spec of node.specifiers ?? []) {
        const local = (spec.local as IdentifierReference).name;
        // TODO: ensure that all uses of this correctly handle invalid identifier as export names
        const exported = spec.exported.type === "Identifier" ? spec.exported.name : null;
        if (typeof exported === "string") {
          exports.push({ exportName: exported, localName: local });
        }
      }
      continue;
    }

    if (node.type === "ExportDefaultDeclaration") {
      const decl = node.declaration;
      // Named function/class default — already addressable by id.
      if (
        (decl.type === "FunctionDeclaration" ||
          decl.type === "FunctionExpression" ||
          decl.type === "ClassDeclaration") &&
        decl.id?.name
      ) {
        exports.push({ exportName: null, localName: decl.id.name });
        continue;
      }
      // `export default Identifier` — refers to an existing local.
      if (decl.type === "Identifier" && typeof decl.name === "string") {
        exports.push({ exportName: null, localName: decl.name });
        continue;
      }
      // Anonymous function/arrow/class default — lift to a named const.
      if (
        decl.type === "FunctionDeclaration" ||
        decl.type === "FunctionExpression" ||
        decl.type === "ArrowFunctionExpression" ||
        decl.type === "ClassDeclaration" ||
        decl.type === "ClassExpression"
      ) {
        const inner = source.slice(decl.start, decl.end);
        s.overwrite(
          node.start,
          node.end,
          `const ${ANON_DEFAULT_LOCAL} = ${inner};\nexport default ${ANON_DEFAULT_LOCAL};`,
        );
        exports.push({
          exportName: null,
          localName: ANON_DEFAULT_LOCAL,
        });
        continue;
      }
      // Other default expressions (objects, primitives, …) — not islands.
    }
  }

  return { s, exports };
}

/**
 * Stamp `__FRESH_SERIALIZABLE_FUNCTION` onto each detected export, guarded so non-functions
 * (constants, objects) are skipped at runtime and already-marked re-exports
 * preserve their original specifier. Appends to the supplied `MagicString`
 * in place.
 */
export function appendIslandMarkers(
  s: MagicString,
  exports: readonly DetectedIslandExport[],
  specifier: string,
): void {
  if (exports.length === 0) return;
  const lines = ["", "// __FRESH_SERIALIZABLE_FUNCTION markers injected by fresh/vite"];
  for (const { exportName, localName } of exports) {
    const payload = JSON.stringify({ specifier, export: exportName });
    lines.push(
      `if (typeof ${localName} === "function" && !${localName}.__FRESH_SERIALIZABLE_FUNCTION) ${localName}.__FRESH_SERIALIZABLE_FUNCTION = ${payload};`,
    );
  }
  lines.push("");
  s.append(lines.join("\n"));
}
