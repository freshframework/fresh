// Framework-shipped built-in computed signals from `fresh/signals` —
// `equals` / `test` / `and` / `or` / `not`. All of them are plain
// `makeComputed` factories; the implementation just lives here instead
// of in a user island file.

import { type ReadonlySignal, type Signal } from "@preact/signals";
import { makeComputed } from "./signals.ts";

const BUILTIN_SIGNALS_SPECIFIER = "fresh/signals";

const SIGNAL_BRAND = Symbol.for("preact-signals");

function isSignal(v: unknown): v is Signal<unknown> {
  return v !== null && typeof v === "object" && (v as { brand?: unknown }).brand === SIGNAL_BRAND;
}

/**
 * Read-only signal that's `true` while its two inputs are strictly equal
 * (`===`), `false` otherwise. Updates whenever either input changes.
 *
 * Each input may be a signal (read reactively) or a plain literal.
 *
 *   ```ts
 *   const isAdmin = equals(role, "admin");
 *   const sameUser = equals(currentUserId, otherUserId);
 *   ```
 */
const equals_ = makeComputed(<T>(a: ReadonlySignal<T>, b: ReadonlySignal<T> | T): boolean => {
  const av = a.value;
  const bv = isSignal(b) ? (b as ReadonlySignal<T>).value : b;
  return av === bv;
});
export const equals: <T>(
  a: ReadonlySignal<T>,
  b: ReadonlySignal<T> | T,
) => ReadonlySignal<boolean> = equals_[0];
export const useEquals: <T>(
  a: ReadonlySignal<T>,
  b: ReadonlySignal<T> | T,
) => ReadonlySignal<boolean> = equals_[1];
if (typeof import.meta.env !== "undefined" && import.meta.env.SSR) {
  (equals as unknown as { __FRESH_SERIALIZABLE_FUNCTION: unknown }).__FRESH_SERIALIZABLE_FUNCTION =
    {
      specifier: BUILTIN_SIGNALS_SPECIFIER,
      export: "equals",
    };
  (
    useEquals as unknown as { __FRESH_SERIALIZABLE_FUNCTION: unknown }
  ).__FRESH_SERIALIZABLE_FUNCTION = {
    specifier: BUILTIN_SIGNALS_SPECIFIER,
    export: "useEquals",
  };
}

/**
 * Read-only signal that's `true` while the regex matches the input's
 * string value, `false` otherwise. Updates whenever the input changes.
 *
 *   ```ts
 *   const looksLikeEmail = test(input, /^[^@]+@[^@]+\.[^@]+$/);
 *   const isHex = test(color, /^#[0-9a-f]{6}$/i);
 *   ```
 */
const test_ = makeComputed((a: ReadonlySignal<unknown>, regexp: RegExp): boolean =>
  regexp.test(String(a.value)),
);
export const test: (a: ReadonlySignal<unknown>, regexp: RegExp) => ReadonlySignal<boolean> =
  test_[0];
export const useTest: (a: ReadonlySignal<unknown>, regexp: RegExp) => ReadonlySignal<boolean> =
  test_[1];
if (typeof import.meta.env !== "undefined" && import.meta.env.SSR) {
  (test as unknown as { __FRESH_SERIALIZABLE_FUNCTION: unknown }).__FRESH_SERIALIZABLE_FUNCTION = {
    specifier: BUILTIN_SIGNALS_SPECIFIER,
    export: "test",
  };
  (useTest as unknown as { __FRESH_SERIALIZABLE_FUNCTION: unknown }).__FRESH_SERIALIZABLE_FUNCTION =
    {
      specifier: BUILTIN_SIGNALS_SPECIFIER,
      export: "useTest",
    };
}

/**
 * Read-only signal that's `true` while every input is truthy, `false`
 * once any input goes falsy. Variadic — `and()` with no arguments is
 * `true` (matches `Array.prototype.every`'s empty case).
 *
 * Each input may be a signal (read reactively) or a plain literal. Pair
 * with `not(...)` to express negated terms — `!signal` snapshots the
 * value once at JSX-eval time, while `not(signal)` stays reactive.
 *
 *   ```ts
 *   const canSubmit = and(formValid, not(submitting), agreedToTerms);
 *   ```
 */
const and_ = makeComputed((...inputs: Array<ReadonlySignal<unknown> | unknown>): boolean => {
  for (const x of inputs) {
    const v = isSignal(x) ? (x as ReadonlySignal<unknown>).value : x;
    if (!v) return false;
  }
  return true;
});
export const and: (...inputs: Array<ReadonlySignal<unknown> | unknown>) => ReadonlySignal<boolean> =
  and_[0];
export const useAnd: (
  ...inputs: Array<ReadonlySignal<unknown> | unknown>
) => ReadonlySignal<boolean> = and_[1];
if (typeof import.meta.env !== "undefined" && import.meta.env.SSR) {
  (and as unknown as { __FRESH_SERIALIZABLE_FUNCTION: unknown }).__FRESH_SERIALIZABLE_FUNCTION = {
    specifier: BUILTIN_SIGNALS_SPECIFIER,
    export: "and",
  };
  (useAnd as unknown as { __FRESH_SERIALIZABLE_FUNCTION: unknown }).__FRESH_SERIALIZABLE_FUNCTION =
    {
      specifier: BUILTIN_SIGNALS_SPECIFIER,
      export: "useAnd",
    };
}

/**
 * Read-only signal that's `true` while at least one input is truthy,
 * `false` only when every input is falsy. Variadic — `or()` with no
 * arguments is `false` (matches `Array.prototype.some`'s empty case).
 *
 * Each input may be a signal (read reactively) or a plain literal.
 *
 *   ```ts
 *   const hasError = or(networkError, validationError, serverError);
 *   ```
 */
const or_ = makeComputed((...inputs: Array<ReadonlySignal<unknown> | unknown>): boolean => {
  for (const x of inputs) {
    const v = isSignal(x) ? (x as ReadonlySignal<unknown>).value : x;
    if (v) return true;
  }
  return false;
});
export const or: (...inputs: Array<ReadonlySignal<unknown> | unknown>) => ReadonlySignal<boolean> =
  or_[0];
export const useOr: (
  ...inputs: Array<ReadonlySignal<unknown> | unknown>
) => ReadonlySignal<boolean> = or_[1];
if (typeof import.meta.env !== "undefined" && import.meta.env.SSR) {
  (or as unknown as { __FRESH_SERIALIZABLE_FUNCTION: unknown }).__FRESH_SERIALIZABLE_FUNCTION = {
    specifier: BUILTIN_SIGNALS_SPECIFIER,
    export: "or",
  };
  (useOr as unknown as { __FRESH_SERIALIZABLE_FUNCTION: unknown }).__FRESH_SERIALIZABLE_FUNCTION = {
    specifier: BUILTIN_SIGNALS_SPECIFIER,
    export: "useOr",
  };
}

/**
 * Read-only signal that's the boolean negation of its input. Updates
 * whenever the input changes.
 *
 * The input may be a signal (read reactively) or a plain literal. Use
 * `not(signal)` instead of `!signal` whenever you want the negation to
 * stay reactive — `!signal` snapshots the value once at JSX-eval time,
 * while `not(signal)` tracks updates.
 *
 *   ```ts
 *   const isIdle = not(isSubmitting);
 *   const canSubmit = and(formValid, not(submitting));
 *   ```
 */
const not_ = makeComputed((input: ReadonlySignal<unknown> | unknown): boolean => {
  const v = isSignal(input) ? (input as ReadonlySignal<unknown>).value : input;
  return !v;
});
export const not: (input: ReadonlySignal<unknown> | unknown) => ReadonlySignal<boolean> = not_[0];
export const useNot: (input: ReadonlySignal<unknown> | unknown) => ReadonlySignal<boolean> =
  not_[1];
if (typeof import.meta.env !== "undefined" && import.meta.env.SSR) {
  (not as unknown as { __FRESH_SERIALIZABLE_FUNCTION: unknown }).__FRESH_SERIALIZABLE_FUNCTION = {
    specifier: BUILTIN_SIGNALS_SPECIFIER,
    export: "not",
  };
  (useNot as unknown as { __FRESH_SERIALIZABLE_FUNCTION: unknown }).__FRESH_SERIALIZABLE_FUNCTION =
    {
      specifier: BUILTIN_SIGNALS_SPECIFIER,
      export: "useNot",
    };
}
