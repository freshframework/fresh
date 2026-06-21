// Server-side serialization of a value tree to JS expression source via
// `devalue.uneval`. The matching client-side runtime is the boot chunk
// (`fresh/internal/client`), which exports `signal` (the `Signal` branch
// of the replacer emits calls into it) and `boot` (the renderer adds it
// as an extra import and calls it at the end of the inline script).
//
// The serializer cooperates with the renderer to produce a single
// `<script type="module">` body that:
//
//   1. statically imports every function the page needs (island
//      Component exports, factory functions, the `signal` helper, the
//      `boot` runtime) under generated aliases `_<m>_<s>` — `<m>` is
//      the module's insertion index in `imports`, `<s>` is the
//      export's insertion index within that module;
//
//   2. assigns `const data = <uneval-output>;` — the value tree with
//      custom-typed nodes replaced by alias / call expressions. Shared
//      references survive because devalue's `uneval` notices when the
//      same JS object appears in two places and hoists it into an
//      IIFE-bound local — including across `recurse` boundaries — so
//      a signal that appears as an island prop AND inside an event-
//      handler factory's args revives as ONE instance;
//
//   3. calls `boot(data);` to drive hydration.
//
// Three custom shapes are recognized in the value tree (priority order):
//
//   * **FactoryFunction** — values carrying
//     `__FRESH_FROM_FACTORY = { factory, args }`. The factory itself
//     must be a SerializableFunction; emitted as
//     `(<factoryAlias>)(<args>)` — args go back through the replacer
//     so signals/functions/nested factories inside them dedupe.
//
//   * **SerializableFunction** — functions carrying
//     `__FRESH_SERIALIZABLE_FUNCTION = { specifier, export }`. The
//     marker is auto-stamped by the island transform on every export of
//     an `islands/` file, and manually stamped on framework-shipped
//     factories. Emitted as the bare alias `_<m>_<s>`.
//
//   * **Signal** — `@preact/signals` signals without the factory
//     marker. Plain `computed()` signals throw (no way to reproduce the
//     derivation client-side). Live signals are emitted as
//     `<signalAlias>(<peeked-value>)`; the peeked inner value goes back
//     through the replacer for nested signal / factory handling.

import { uneval } from "../vendor/devalue/index.js";

const SIGNAL_BRAND = Symbol.for("preact-signals");

/**
 * Logical specifier of the runtime helper module. Caller resolves to a URL
 * (typically `clientBootAssets.entry`) before emitting the import lines.
 */
export const SIGNAL_HELPER_SPECIFIER = "fresh/internal/client";
/** Named export within `SIGNAL_HELPER_SPECIFIER` that wraps a value in a signal. */
export const SIGNAL_HELPER_EXPORT = "signal";
/**
 * Named export within `SIGNAL_HELPER_SPECIFIER` that revives an island "slot"
 * prop (JSX passed to an island) from its server-rendered DOM by index.
 */
export const SLOT_HELPER_EXPORT = "slot";

interface SerializableFunctionMarker {
  specifier: string;
  /** Named export, or `null` for the default export. */
  export: string | null;
}

interface FactoryMarker {
  factory: unknown;
  args: unknown[];
}

interface SignalLike {
  brand: symbol;
  /** Reads the current value without subscribing the surrounding reactive scope. */
  peek: () => unknown;
  /** Computed signals expose `x` as the recomputation function. Plain signals don't. */
  x?: unknown;
  __FRESH_FROM_FACTORY?: FactoryMarker;
}

function isSignalLike(v: unknown): v is SignalLike {
  return v !== null && typeof v === "object" && (v as { brand?: unknown }).brand === SIGNAL_BRAND;
}

function isSerializableFunction(v: unknown): v is {
  __FRESH_SERIALIZABLE_FUNCTION: SerializableFunctionMarker;
} {
  return (
    typeof v === "function" &&
    (v as { __FRESH_SERIALIZABLE_FUNCTION?: unknown }).__FRESH_SERIALIZABLE_FUNCTION !== undefined
  );
}

function isFromFactory(v: unknown): v is { __FRESH_FROM_FACTORY: FactoryMarker } {
  if (v === null) return false;
  if (typeof v !== "object" && typeof v !== "function") return false;
  return (v as { __FRESH_FROM_FACTORY?: unknown }).__FRESH_FROM_FACTORY !== undefined;
}

export interface ImportEntry {
  /** Module's insertion index — the `<m>` in `_<m>_<s>`. */
  index: number;
  /**
   * Export name → insertion index. `null` key = default export. The
   * index is the `<s>` in `_<m>_<s>`.
   */
  imports: Map<string | null, number>;
}

export interface Serializer {
  /**
   * Walk `value`'s tree, replace custom-typed nodes with import-alias
   * expressions, and return the JS source to place after `const data =
   * ` and before `;`. Shared references survive — devalue's own
   * IIFE-bound-local mechanism dedupes any value reached via the same
   * JS object identity more than once, including across `recurse`
   * boundaries.
   */
  serialize(value: unknown): string;
  /**
   * Register an import the caller needs that isn't in the value tree
   * (e.g. the `boot` runtime itself). Returns the generated `_<m>_<s>`
   * alias. Safe to call before or after `serialize`.
   */
  aliasFor(specifier: string, exportName: string | null): string;
  /** Specifier → {module index, named-import map}. */
  readonly imports: Map<string, ImportEntry>;
}

export interface SerializerOptions {
  /**
   * Classify a value as an island "slot" — JSX passed as an island prop. Return
   * the slot's index (emitted as `slot(<index>)`, revived client-side from its
   * server-rendered DOM) or `null` to leave the value to the default handling.
   * The serializer stays preact-agnostic; the caller supplies VNode detection
   * and index allocation.
   */
  slot?: (value: unknown) => number | null;
}

export function createSerializer(options: SerializerOptions = {}): Serializer {
  const imports = new Map<string, ImportEntry>();

  function aliasFor(specifier: string, exportName: string | null): string {
    let mod = imports.get(specifier);
    if (!mod) {
      mod = { index: imports.size, imports: new Map() };
      imports.set(specifier, mod);
    }
    let idx = mod.imports.get(exportName);
    if (idx === undefined) {
      idx = mod.imports.size;
      mod.imports.set(exportName, idx);
    }
    return `_${mod.index}_${idx}`;
  }

  // devalue's `uneval` invokes the replacer as `(value, recurse)` where
  // `recurse` is a bound helper that shares the outer call's reference
  // graph and dedup state. Recursing through it (rather than calling
  // `uneval(...)` again) is what lets devalue notice when the same
  // signal / factory-result / function reference appears in two places
  // and emit a single IIFE-bound local — so reactivity is preserved
  // across an island prop + a `{signal}` text child + an event-handler
  // argument without us tracking sharing ourselves.
  const replacer = (v: unknown, recurse: (value: unknown) => string): string | undefined => {
    // Order matters. `makeComputed` results carry BOTH the factory
    // marker AND the signal brand — the only correct round-trip path
    // is to re-invoke the factory, so FactoryFunction wins.
    if (isFromFactory(v)) {
      const { factory, args } = (v as { __FRESH_FROM_FACTORY: FactoryMarker }).__FRESH_FROM_FACTORY;
      // The factory is itself a SerializableFunction — `recurse(factory)`
      // re-enters the replacer, hits the `isSerializableFunction`
      // branch below, registers the import, and returns the alias. The
      // pre-check just gives a specific error message instead of
      // devalue's generic "can't uneval a function".
      if (!isSerializableFunction(factory)) {
        throw new TypeError(
          "factory(...) wrapper isn't an island-exported function — make sure the factory itself is exported from an `islands/` module (or shipped by a `fresh/...` runtime entrypoint).",
        );
      }
      const factorySrc = recurse(factory);
      const argSources = args.map(recurse);
      return `(${factorySrc})(${argSources.join(",")})`;
    }

    if (isSerializableFunction(v)) {
      const { specifier, export: exp } = v.__FRESH_SERIALIZABLE_FUNCTION;
      return aliasFor(specifier, exp);
    }

    if (isSignalLike(v)) {
      // FactoryFunction already had its chance above; anything left
      // with `.x` here is a plain `computed(...)` whose derivation we
      // can't reproduce client-side.
      if (typeof v.x === "function") {
        throw new TypeError(
          "Cannot serialize a computed signal; wrap its factory with `makeComputed()` from `fresh/signals` or pass a plain signal instead.",
        );
      }
      const innerSrc = recurse(v.peek());
      const signalAlias = aliasFor(SIGNAL_HELPER_SPECIFIER, SIGNAL_HELPER_EXPORT);
      return `${signalAlias}(${innerSrc})`;
    }

    // A VNode prop (JSX passed to an island) — not structurally serializable
    // (its `type` may be any component). The caller renders it to DOM and gives
    // us a slot index; the client revives it from that DOM.
    if (options.slot !== undefined) {
      const slotIndex = options.slot(v);
      if (slotIndex !== null) {
        const slotAlias = aliasFor(SIGNAL_HELPER_SPECIFIER, SLOT_HELPER_EXPORT);
        return `${slotAlias}(${slotIndex})`;
      }
    }

    return undefined;
  };

  return {
    serialize(value: unknown): string {
      return uneval(value, replacer);
    },
    aliasFor,
    imports,
  };
}

/**
 * Build `import { foo as _<m>_<s>, … } from "<url>";` lines from an
 * imports map. Caller resolves each logical specifier (the keys of the
 * map) to a real URL — typically via the SSR-side islands map for
 * island/factory specifiers, and `clientBootAssets.entry` for
 * `SIGNAL_HELPER_SPECIFIER`.
 */
export function buildImportLines(
  imports: Map<string, ImportEntry>,
  resolve: (specifier: string) => string,
): string[] {
  const lines: string[] = [];
  for (const [specifier, entry] of imports) {
    const url = resolve(specifier);
    const specs: string[] = [];
    // Insertion order = export-index order.
    for (const [name, idx] of entry.imports) {
      const alias = `_${entry.index}_${idx}`;
      specs.push(name === null ? `default as ${alias}` : `${name} as ${alias}`);
    }
    lines.push(`import {${specs.join(",")}} from ${JSON.stringify(url)};`);
  }
  return lines;
}
