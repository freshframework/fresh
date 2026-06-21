import { test } from "vitest";
import assert from "node:assert/strict";

import { computed, signal } from "@preact/signals";

import {
  buildImportLines,
  createSerializer,
  SIGNAL_HELPER_EXPORT,
  SIGNAL_HELPER_SPECIFIER,
} from "./serialization.ts";
import { navigating } from "../runtime/navigation.ts";

/**
 * The factories in `client/builtin-signals.ts` only stamp their
 * `__FRESH_SERIALIZABLE_FUNCTION` marker under `import.meta.env.SSR` — so
 * in a Node test runtime (where that flag is undefined) the markers
 * aren't set. Re-stamp them here to simulate the SSR build environment.
 */
async function loadBuiltinsForSsr(): Promise<typeof import("../client/builtin-signals.ts")> {
  const m = await import("../client/builtin-signals.ts");
  const SPEC = "fresh/signals";
  for (const name of ["equals", "test", "and", "or", "not"] as const) {
    const fn = m[name] as unknown as { __FRESH_SERIALIZABLE_FUNCTION?: unknown };
    if (fn.__FRESH_SERIALIZABLE_FUNCTION === undefined) {
      fn.__FRESH_SERIALIZABLE_FUNCTION = { specifier: SPEC, export: name };
    }
  }
  return m;
}

/**
 * Tag a function as a SerializableFunction the same way the island
 * transform / framework-shipped factories do.
 */
function tagIslandExport<T extends (...args: never[]) => unknown>(
  fn: T,
  specifier: string,
  exportName: string | null,
): T {
  (fn as unknown as { __FRESH_SERIALIZABLE_FUNCTION: unknown }).__FRESH_SERIALIZABLE_FUNCTION = {
    specifier,
    export: exportName,
  };
  return fn;
}

/**
 * Eval a serialized data expression. Each import alias is bound to a
 * call-recording sentinel that returns a fresh `{__call:…}` record
 * capturing `(specifier, export, args)` — useful for asserting on the
 * eval'd shape without booting Preact.
 */
function evalProgram(
  dataSrc: string,
  imports: Map<string, { index: number; imports: Map<string | null, number> }>,
): unknown {
  const lines: string[] = [];
  for (const [specifier, entry] of imports) {
    for (const [exportName, idx] of entry.imports) {
      const alias = `_${entry.index}_${idx}`;
      lines.push(
        `const ${alias} = (...args) => ({ __call: { specifier: ${JSON.stringify(
          specifier,
        )}, export: ${JSON.stringify(exportName)}, args } });`,
      );
    }
  }
  const body = `${lines.join("\n")}\nreturn ${dataSrc};`;
  return new Function(body)();
}

// ---------- Bare signal ----------

test("a bare signal becomes a `<signalAlias>(<value>)` call expression and registers SIGNAL_HELPER", () => {
  const ser = createSerializer();
  const src = ser.serialize(signal(42));
  // Just the call expression — no shared-decl indirection.
  assert.match(src, /^_\d+_\d+\(42\)$/);
  // SIGNAL_HELPER_SPECIFIER registered with SIGNAL_HELPER_EXPORT.
  const entry = ser.imports.get(SIGNAL_HELPER_SPECIFIER);
  assert.ok(entry, "SIGNAL_HELPER_SPECIFIER must be registered");
  assert.equal(entry.imports.get(SIGNAL_HELPER_EXPORT), 0);
});

test("a signal referenced twice survives as one shared instance via devalue's IIFE-bound local", () => {
  const ser = createSerializer();
  const s = signal("hello");
  const src = ser.serialize({ a: s, b: s });
  // Eval with sentinels — both positions must reference the same call
  // record (= same JS object). devalue handles this via the IIFE
  // pattern around our replacer-returned string.
  const built = evalProgram(src, ser.imports) as { a: unknown; b: unknown };
  assert.equal(built.a, built.b, "shared signal must round-trip to a single object");
});

test("plain `computed()` signals (no factory marker) throw at serialize time", () => {
  const ser = createSerializer();
  const s = signal(2);
  const c = computed(() => s.value * 21);
  assert.throws(() => ser.serialize({ c }), /Cannot serialize a computed signal/);
});

// ---------- SerializableFunction ----------

test("a bare island-exported function becomes the alias `_<m>_<s>` directly", () => {
  const ser = createSerializer();
  const fn = tagIslandExport(() => null, "islands/Counter.tsx", "Counter");
  const src = ser.serialize(fn);
  // Module-index 0, export-index 0 → `_0_0`.
  assert.equal(src, "_0_0");
  const entry = ser.imports.get("islands/Counter.tsx");
  assert.ok(entry);
  assert.equal(entry.index, 0);
  assert.equal(entry.imports.get("Counter"), 0);
});

test("multiple exports from the same module share a module index but get distinct export indices", () => {
  const ser = createSerializer();
  const a = tagIslandExport(() => null, "islands/utils.tsx", "fa");
  const b = tagIslandExport(() => null, "islands/utils.tsx", "fb");
  ser.serialize([a, b]);
  const entry = ser.imports.get("islands/utils.tsx");
  assert.ok(entry);
  assert.equal(entry.index, 0);
  assert.equal(entry.imports.get("fa"), 0);
  assert.equal(entry.imports.get("fb"), 1);
});

test("exports from different modules get monotonic module indices in insertion order", () => {
  const ser = createSerializer();
  const a = tagIslandExport(() => null, "islands/A.tsx", "x");
  const b = tagIslandExport(() => null, "islands/B.tsx", "y");
  const src = ser.serialize([a, b]);
  assert.match(src, /\[_0_0,_1_0\]/);
  assert.equal(ser.imports.get("islands/A.tsx")?.index, 0);
  assert.equal(ser.imports.get("islands/B.tsx")?.index, 1);
});

test("the SAME exported function used twice gets ONE entry in the imports map", () => {
  const ser = createSerializer();
  const fn = tagIslandExport(() => null, "islands/utils.tsx", "fa");
  ser.serialize({ a: fn, b: fn });
  const entry = ser.imports.get("islands/utils.tsx")!;
  assert.equal(entry.imports.size, 1);
});

test("a `null` export name is recorded under the default-export slot", () => {
  const ser = createSerializer();
  const fn = tagIslandExport(() => null, "islands/Default.tsx", null);
  ser.serialize(fn);
  const entry = ser.imports.get("islands/Default.tsx")!;
  assert.equal(entry.imports.get(null), 0);
});

// ---------- FactoryFunction ----------

test("a factory-wrapped value becomes a `(<factoryAlias>)(<args>)` call expression inline", () => {
  const ser = createSerializer();
  const factory = tagIslandExport((b: number) => b * 2, "islands/utils.tsx", "doubled");
  // Any object carrying `__FRESH_FROM_FACTORY` IS the factory result —
  // the whole value collapses to the call expression.
  const result = { __FRESH_FROM_FACTORY: { factory, args: [21] } };
  const src = ser.serialize(result);
  assert.equal(src, "(_0_0)(21)");
});

test("a factory whose wrapper isn't a SerializableFunction throws a clear error", () => {
  const ser = createSerializer();
  const result = {
    __FRESH_FROM_FACTORY: { factory: () => 0, args: [] },
  };
  assert.throws(() => ser.serialize(result), /factory\(\.\.\.\) wrapper isn't/);
});

test("factory args are recursively walked through the replacer — signals inside args become live signal calls", () => {
  const ser = createSerializer();
  const factory = tagIslandExport((s: unknown) => ({ derived: s }), "islands/utils.tsx", "wrap");
  const sig = signal(7);
  const result = { __FRESH_FROM_FACTORY: { factory, args: [sig] } };
  // Serialize the factory result on its own. (Sharing `sig` across the
  // factory args AND a sibling position is NOT preserved — see the next
  // test — and would push devalue into its IIFE-dedup form, which is a
  // different shape than what this test is asserting about.)
  const src = ser.serialize(result);
  // The arg is itself a signal-call expression — proving the args
  // went back through the replacer rather than being inlined as a
  // plain `Signal` object literal.
  assert.match(src, /^\(_0_0\)\(_\d+_\d+\(7\)\)$/);
  // Sanity-check via eval: arg[0] is a `signal(7)` call record.
  const built = evalProgram(src, ser.imports) as {
    __call: { args: Array<{ __call: { export: string; args: unknown[] } }> };
  };
  assert.equal(built.__call.args[0].__call.export, SIGNAL_HELPER_EXPORT);
  assert.deepEqual(built.__call.args[0].__call.args, [7]);
});

test("the SAME factory-result reference used twice survives as one instance via devalue's IIFE-bound local", () => {
  // The simpler dedup case — two references to the same factory
  // result. devalue notices the same JS object and IIFE-wraps the
  // shared expression. (Cross-boundary sharing — same signal both
  // inside a factory's args AND as a sibling — is NOT preserved; that
  // would require hoisting expressions into top-level `const`
  // bindings, which we don't.)
  const ser = createSerializer();
  const factory = tagIslandExport(
    (n: number) => ({ doubled: n * 2 }),
    "islands/utils.tsx",
    "doubled",
  );
  const result = { __FRESH_FROM_FACTORY: { factory, args: [21] } };
  const src = ser.serialize({ a: result, b: result });
  const built = evalProgram(src, ser.imports) as { a: unknown; b: unknown };
  assert.equal(built.a, built.b);
});

// ---------- aliasFor (post-hoc imports, e.g. the boot runtime) ----------

test("aliasFor can register an additional import after serialize() — gets the next module index", () => {
  const ser = createSerializer();
  ser.serialize(tagIslandExport(() => null, "islands/A.tsx", "A"));
  const bootAlias = ser.aliasFor(SIGNAL_HELPER_SPECIFIER, "boot");
  assert.equal(bootAlias, "_1_0");
});

test("aliasFor re-registering the same (specifier, export) returns the same alias", () => {
  const ser = createSerializer();
  const a = ser.aliasFor("foo", "bar");
  const b = ser.aliasFor("foo", "bar");
  assert.equal(a, b);
});

// ---------- buildImportLines ----------

test('buildImportLines emits `import { name as _<m>_<s>, … } from "<url>";` per module', () => {
  const ser = createSerializer();
  ser.aliasFor("specA", "x");
  ser.aliasFor("specA", "y");
  ser.aliasFor("specB", null);
  const urls = new Map([
    ["specA", "/assets/A.js"],
    ["specB", "/assets/B.js"],
  ]);
  const lines = buildImportLines(ser.imports, (s) => urls.get(s)!);
  assert.deepEqual(lines, [
    `import {x as _0_0,y as _0_1} from "/assets/A.js";`,
    `import {default as _1_0} from "/assets/B.js";`,
  ]);
});

// ---------- end-to-end with framework-shipped built-ins ----------

test('end-to-end: `equals(role, "admin")` rides FactoryFunction → SerializableFunction via fresh/signals', async () => {
  const builtinSignals = await loadBuiltinsForSsr();
  const role = signal("guest");
  const isAdmin = builtinSignals.equals(role, "admin");
  const ser = createSerializer();
  const src = ser.serialize(isAdmin);
  // The whole expression is `(equalsAlias)(signalAlias("guest"),"admin")`.
  assert.match(src, /\(_\d+_\d+\)\(_\d+_\d+\("guest"\),"admin"\)/);
  // fresh/signals must be in the imports map under `equals`.
  const freshSignals = ser.imports.get("fresh/signals");
  assert.ok(freshSignals);
  assert.ok(freshSignals.imports.has("equals"));
  // SIGNAL_HELPER_SPECIFIER is in too (for the role signal).
  assert.ok(ser.imports.has(SIGNAL_HELPER_SPECIFIER));
});

test("`navigating()` serializes as a factory call via fresh/signals (not a bare computed)", () => {
  // `navigating` only stamps its marker under `import.meta.env.SSR`; re-stamp
  // it for the Node test runtime (same as the built-ins above).
  const nav = navigating as unknown as { __FRESH_SERIALIZABLE_FUNCTION?: unknown };
  if (nav.__FRESH_SERIALIZABLE_FUNCTION === undefined) {
    nav.__FRESH_SERIALIZABLE_FUNCTION = { specifier: "fresh/signals", export: "navigating" };
  }
  const ser = createSerializer();
  // The whole value collapses to a `(factoryAlias)()` call — proving it rides
  // the FactoryFunction path instead of throwing "Cannot serialize a computed
  // signal" the way a bare `computed()` does.
  const src = ser.serialize(navigating());
  assert.match(src, /^\(_\d+_\d+\)\(\)$/);
  const entry = ser.imports.get("fresh/signals");
  assert.ok(entry, "fresh/signals must be registered");
  assert.ok(entry.imports.has("navigating"));
});

// ---------- `</script>` injection safety via uneval ----------

test("strings containing `</script>` are escaped by devalue.uneval — `</script>` never appears verbatim", () => {
  const ser = createSerializer();
  const src = ser.serialize({ html: "</script><script>alert(1)" });
  assert.doesNotMatch(src, /<\/script>/);
  // devalue.uneval encodes `<` as `<` inside string literals.
  assert.match(src, /\\u003C\/script>/i);
});
