import { computed, type ReadonlySignal } from "@preact/signals";
import { useMemo } from "preact/hooks";
import { factory } from "./serializable.ts";

/**
 * A read-only signal produced by `makeComputed(...)`. Behaves like any
 * other `ReadonlySignal` — you read its current value via `.value` and
 * subscribe to changes via `.subscribe` / by reading it inside a
 * `computed` or `effect`.
 */
export type SerializableComputedSignal<T> = ReadonlySignal<T>;

type MakeComputedFnIterable<Args extends any[], T> = [
  (...args: Args) => SerializableComputedSignal<T>,
  (...args: Args) => SerializableComputedSignal<T>,
];

interface MakeComputedFn<Args extends any[], T> extends MakeComputedFnIterable<Args, T> {
  /**
   * Build a computed signal by calling the derivation with the given
   * arguments. Prefer `.use(...)` when calling from inside a component
   * so the returned signal is stable across re-renders.
   */
  (...args: Args): SerializableComputedSignal<T>;
  /**
   * Build (or re-use) a computed signal scoped to the surrounding
   * component. The signal instance is memoised for the component's
   * lifetime, mirroring how `useComputed` from `@preact/signals` keeps
   * the underlying computed stable.
   *
   *   ```tsx
   *   function Profile({ user }: { user: Signal<User> }) {
   *     const display = greeting.use(user);
   *     return <p>{display}</p>;
   *   }
   *   ```
   */
  use(...args: Args): SerializableComputedSignal<T>;
}

/**
 * Define a computed signal whose derivation can be re-run on the client.
 *
 * Pass a function that, given a set of arguments, returns the value the
 * signal should hold. Export the result from a module under `islands/`.
 * Call the wrapper (or `.use(...)` inside a component) wherever you'd use
 * `computed()` — passing in whatever signals or values the derivation
 * depends on.
 *
 *   ```ts
 *   // islands/double.tsx
 *   import { makeComputed } from "fresh/signals";
 *   import type { Signal } from "@preact/signals";
 *
 *   export const [double, useDouble] = makeComputed(
 *     (n: Signal<number>) => n.value * 2,
 *   );
 *   ```
 *
 *   ```tsx
 *   // routes/index.tsx
 *   import { useSignal } from "@preact/signals";
 *   import { useDouble } from "../islands/double.tsx";
 *
 *   const count = useSignal(3);
 *   const doubled = useDouble(count);  // 6, and tracks `count`
 *   ```
 *
 * The arguments you pass at the call site can be anything Fresh's
 * serializer supports — signals, strings, numbers, `Date`, `Map`, `Set`,
 * `BigInt`, plain objects / arrays.
 */
export function makeComputed<Args extends any[], T>(
  fn: (...args: Args) => T,
): MakeComputedFn<Args, T> {
  const wrapper = factory(
    (...args: Args) => computed(() => fn(...args)) as unknown as SerializableComputedSignal<T>,
  ) as MakeComputedFn<Args, T>;
  wrapper.use = use;
  wrapper[0] = wrapper;
  wrapper[1] = use.bind(wrapper) as (...args: Args) => SerializableComputedSignal<T>;
  Object.defineProperty(wrapper, "length", { value: 2 });
  wrapper[Symbol.iterator] = Array.prototype[Symbol.iterator];
  return wrapper;
}

function use<Args extends any[], T>(
  this: MakeComputedFn<Args, T>,
  ...args: Args
): SerializableComputedSignal<T> {
  return useMemo(() => this(...args), []);
}
