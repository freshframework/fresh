---
description: |
  Fresh uses Preact Signals for reactive state. Inside islands, and on the
  static page itself without shipping a full island.
---

Fresh uses [Preact Signals](https://preactjs.com/guide/v10/signals/) for reactive state. A signal is a value container. Reading `signal.value` subscribes to it. Writing to `signal.value` updates everything that depends on it.

```tsx
import { computed, signal } from "@preact/signals";

const count = signal(0);
const doubled = computed(() => count.value * 2);

count.value++; // both count and doubled update
```

Inside an [island](/docs/concepts/islands), signals work exactly as in any Preact app. They drive re-renders.

```tsx islands/Counter.tsx
import { useSignal } from "@preact/signals";

export function Counter() {
  const count = useSignal(0);
  return (
    <button type="button" onClick={() => count.value++}>
      Count: {count}
    </button>
  );
}
```

## Page-level reactivity

Fresh can also make signals reactive outside islands. The static page itself can hold a signal and update parts of the DOM without shipping a full island. Fresh recognizes two shapes and wires up just the minimal client code to keep them live.

A signal used as a text child updates that text node when the signal changes.

```tsx routes/index.tsx
import { page } from "./$index.ts";
import { useSignal } from "@preact/signals";

export default page(() => {
  const name = useSignal("world");
  return <p>Hello, {name}!</p>;
});
```

A signal used as an attribute or property updates that attribute when the signal changes.

```tsx
const open = useSignal(false);
return <dialog open={open}>…</dialog>;
```

This pairs naturally with [serialized event handlers](/docs/concepts/events), which can write to those signals from outside an island.

## Derived values

A plain `computed()` cannot be [serialized](/docs/advanced/serializable-types) to the client. For a derived value that needs to live on the static page (or be passed between islands), use `makeComputed` from `fresh/signals`. It returns a destructurable pair. The bare `call(...)` form is for use outside components, and the `useCall(...)` hook form is for inside components.

```tsx
import { makeComputed } from "fresh/signals";

const [double, useDouble] = makeComputed((n) => n.value * 2);

// outside a component:
const doubled = double(count);

// inside a component (memoizes across re-renders):
const doubled = useDouble(count);
```

> [info]: `makeComputed` is sugar over [`factory`](/docs/advanced/serializable-types#factory). It wraps a derivation function as a serializable factory whose result is a `computed` signal, and gives you a hook variant for free. Reach for `factory` directly when you need to ship something other than a computed signal across the boundary.

## Built-in computeds

`fresh/signals` ships a small set of ready-made serializable computeds for common boolean logic. Each comes with a hook variant.

| Factory                | Result                                   |
| ---------------------- | ---------------------------------------- |
| `equals(a, b)`         | `true` while `a === b`                   |
| `test(signal, regexp)` | `true` while the regex matches the value |
| `and(...inputs)`       | `true` while every input is truthy       |
| `or(...inputs)`        | `true` while any input is truthy         |
| `not(input)`           | the boolean negation                     |

```tsx
import { and, not } from "fresh/signals";

const canSubmit = and(formValid, not(submitting));
return <button disabled={not(canSubmit)}>Submit</button>;
```

Each input may be a signal (read reactively) or a plain value. Use `not(signal)` rather than `!signal.value` when you want the negation to stay reactive. The `!` operator reads the value once and the result stops updating.
