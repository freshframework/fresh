// Framework-shipped event-handler factories from `fresh/events` —
// `setFromProp` / `setValue` / `add` / `toggle`. Each one is a plain
// factory whose returned handler can be attached at the page level
// (outside an island) and still work after hydration.

import type { Signal } from "@preact/signals";
import type { TargetedEvent } from "preact";
import { factory } from "./serializable.ts";

const BUILTIN_EVENTS_SPECIFIER = "fresh/events";

function stamp(fn: unknown, exportName: string): void {
  if (typeof import.meta.env !== "undefined" && import.meta.env.SSR) {
    (fn as { __FRESH_SERIALIZABLE_FUNCTION: unknown }).__FRESH_SERIALIZABLE_FUNCTION = {
      specifier: BUILTIN_EVENTS_SPECIFIER,
      export: exportName,
    };
  }
}

/**
 * Build a two-way-binding event handler that writes the event target's
 * DOM property `key` back into `signal`, coerced to match the signal's
 * current type (`Number` / `String` / `Boolean` / `BigInt` / `Date`, or
 * passed through unchanged for anything else).
 *
 *   ```tsx
 *   const name = useSignal("");
 *   <input value={name} onInput={setFromProp(name, "value")} />;
 *
 *   const count = useSignal(0);  // Number signal — string `e.target.value` is coerced.
 *   <input type="number" value={count} onInput={setFromProp(count, "value")} />;
 *
 *   const accepted = useSignal(false);
 *   <input
 *     type="checkbox"
 *     checked={accepted}
 *     onChange={setFromProp(accepted, "checked")}
 *   />;
 *   ```
 *
 * The coercion is re-derived from the signal's current value on every
 * fire, so a signal whose type changes over time keeps coercing
 * correctly.
 */
export const setFromProp: <T, K extends string>(
  signal: Signal<T>,
  key: K,
) => (
  e: TargetedEvent<
    { [P in K]: string | number | boolean | bigint | Date | unknown } & EventTarget,
    Event
  >,
) => void = factory(<T, K extends string>(signal: Signal<T>, key: K) => {
  return (e: TargetedEvent<{ [P in K]: unknown } & EventTarget, Event>): void => {
    const raw = (e.currentTarget as unknown as Record<string, unknown>)[key];
    signal.value = coerceToSignalType(raw, signal.peek()) as T;
  };
});
stamp(setFromProp, "setFromProp");

/**
 * Build an event handler that writes a fixed `value` into `signal` on
 * every fire. The `value` is captured at JSX-evaluation time and may be
 * any value Fresh's serializer supports — strings, numbers, booleans,
 * `Date`, `Map`, `Set`, `BigInt`, plain objects / arrays.
 *
 *   ```tsx
 *   const mode = useSignal<"read" | "edit">("read");
 *   <button onClick={setValue(mode, "edit")}>Edit</button>;
 *   <button onClick={setValue(mode, "read")}>Cancel</button>;
 *   ```
 */
export const setValue: <T>(signal: Signal<T>, value: T) => (e: Event) => void = factory(
  <T>(signal: Signal<T>, value: T) => {
    return (_e: Event): void => {
      signal.value = value;
    };
  },
);
stamp(setValue, "setValue");

/** Optional clamps for `add()`. Either or both may be omitted. */
export interface AddOptions {
  /** Inclusive lower bound. Values lower than `min` are clamped up. */
  min?: number;
  /** Inclusive upper bound. Values higher than `max` are clamped down. */
  max?: number;
}

/**
 * Build an event handler that increments a numeric signal by `delta` on
 * every fire (pass a negative `delta` to decrement). When `min` and / or
 * `max` are supplied, the result is clamped to the inclusive range — the
 * same semantics as the HTML `<input type="number" min max>` attributes.
 *
 *   ```tsx
 *   const quantity = useSignal(1);
 *   <button onClick={add(quantity, +1, { max: 10 })}>+</button>;
 *   <button onClick={add(quantity, -1, { min: 0 })}>-</button>;
 *   ```
 */
export const add: (
  signal: Signal<number>,
  delta: number,
  options?: AddOptions,
) => (e: Event) => void = factory(
  (signal: Signal<number>, delta: number, options: AddOptions = {}) => {
    return (_e: Event): void => {
      let next = signal.peek() + delta;
      if (options.min !== undefined) next = Math.max(options.min, next);
      if (options.max !== undefined) next = Math.min(options.max, next);
      signal.value = next;
    };
  },
);
stamp(add, "add");

/**
 * Build an event handler that flips a boolean signal on every fire.
 *
 *   ```tsx
 *   const drawerOpen = useSignal(false);
 *   <button onClick={toggle(drawerOpen)}>Toggle drawer</button>;
 *   ```
 *
 * For a checkbox specifically, `onChange={setFromProp(signal, "checked")}`
 * has the same effect; reach for `toggle` when the trigger isn't a
 * `type="checkbox"` element (a button, a div with a click listener, …).
 */
export const toggle: (signal: Signal<boolean>) => (e: Event) => void = factory(
  (signal: Signal<boolean>) => {
    return (_e: Event): void => {
      signal.value = !signal.peek();
    };
  },
);
stamp(toggle, "toggle");

/**
 * Coerce a raw event-target value to the type the signal currently holds.
 * Used by `setFromProp` to keep `signal.value` typed correctly.
 *
 * @internal
 */
export function coerceToSignalType(raw: unknown, sample: unknown): unknown {
  if (typeof sample === "number") return Number(raw);
  if (typeof sample === "string") return String(raw);
  if (typeof sample === "boolean") return Boolean(raw);
  if (typeof sample === "bigint") {
    return BigInt(raw as string | number | bigint | boolean);
  }
  if (sample instanceof Date) return new Date(raw as string | number | Date);
  return raw;
}
