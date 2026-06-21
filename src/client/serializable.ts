// Public API surface: `factory(...)`. Internal marker types and
// implementation details intentionally aren't re-exported from
// `fresh/serializable` — `factory` is the only thing users need.

interface FactoryMarker<Args extends readonly unknown[] = readonly unknown[]> {
  factory: (...args: Args) => any;
  args: Args;
}

/**
 * Define a serializable callable, parameterised by its call-site arguments.
 *
 * `factory(fn)` returns a wrapper. When the wrapper is called with some
 * `args`, the wrapper invokes `fn(...args)` and returns the result. The
 * returned value remembers the `(wrapper, args)` pair, so when Fresh
 * sends it from the server to the browser the browser can rebuild an
 * equivalent value by calling `wrapper(...args)` again on the client.
 *
 *   ```ts
 *   // islands/handlers.tsx
 *   import { factory } from "fresh/serializable";
 *   import type { Signal } from "@preact/signals";
 *
 *   export const incrementBy = factory(
 *     (count: Signal<number>, step: number) => () => {
 *       count.value += step;
 *     },
 *   );
 *   ```
 *
 *   ```tsx
 *   // routes/index.tsx
 *   import { useSignal } from "@preact/signals";
 *   import { incrementBy } from "../islands/handlers.tsx";
 *
 *   const count = useSignal(0);
 *   <button onClick={incrementBy(count, +1)}>+1</button>;
 *   <button onClick={incrementBy(count, +10)}>+10</button>;
 *   ```
 *
 * Constraints:
 *
 *   * The wrapper must be **exported from a module under `islands/`** so
 *     the build system knows how to ship it to the client.
 *   * The wrapper's return value must be an **object or function** —
 *     primitives can't carry the bookkeeping that lets Fresh rebuild
 *     them on the client. To return a primitive, wrap it in an object
 *     (e.g. `{ value: 42 }`).
 *   * Each call-site argument must be a **serializable type** — a
 *     primitive (`string`, `number`, `boolean`, `bigint`, `null`,
 *     `undefined`), a built-in object (`Date`, `RegExp`, `Map`, `Set`,
 *     plain object, array, including cyclic / shared references), a
 *     signal, or another factory-built / island-exported function.
 *     Plain functions and closures, class instances other than the
 *     built-ins listed, DOM nodes, `Symbol`, `Promise`, `WeakMap`, and
 *     `WeakSet` aren't supported.
 */
export function factory<Args extends any[], R>(fn: (...args: Args) => R): (...args: Args) => R {
  const wrapper = ((...args: Args): R => {
    const result = fn(...args);
    if (result !== null && (typeof result === "object" || typeof result === "function")) {
      (result as unknown as { __FRESH_FROM_FACTORY?: FactoryMarker<Args> }).__FRESH_FROM_FACTORY = {
        factory: wrapper,
        args,
      };
    }
    return result;
  }) as (...args: Args) => R;
  Object.defineProperty(wrapper, "name", {
    value: fn.name,
    configurable: true,
  });
  return wrapper;
}
