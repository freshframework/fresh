---
description: |
  What values Fresh can send from the server to the client. Basic types,
  circular references, signals, and how to define your own serializable
  functions with factory().
---

Fresh renders pages on the server and hydrates them in the browser. Whenever a value crosses that boundary it goes through Fresh's serializer. This includes [island](/docs/concepts/islands) props, the arguments to a `makeComputed`, `factory`, or `fresh/events` handler, and anything else that travels from a route to the client.

This page is the reference for what the serializer accepts. Values listed below survive the round-trip and arrive on the client as either an equivalent value (for primitives and plain data) or a live equivalent (for signals and functions). Everything else has to be reshaped into one of these types before it crosses the boundary.

## Basic types

| Category | Types |
| --- | --- |
| Primitives | `string`, `number` (including `NaN`, `±Infinity`, `-0`), `boolean`, `null`, `undefined`, `bigint` |
| Built-in objects | `Date`, `RegExp`, `Map`, `Set`, plain objects, arrays |
| Typed arrays | `Uint8Array`, `Int8Array`, `Uint16Array`, `Int16Array`, `Uint32Array`, `Int32Array`, `Float32Array`, `Float64Array` |

Container values are checked recursively. A plain object whose properties are all serializable is itself serializable. An array that contains a `Promise` is not.

```tsx
<Counter start={3} label="Clicks" startedAt={new Date()} tags={new Set(["a", "b"])} />
```

## Circular and shared references

The serializer tracks every object it visits. If it sees the same object twice it records a reference instead of writing the value again. This means the revived graph on the client has the same shape as the original.

```tsx
const node = { name: "root", children: [] as unknown[] };
node.children.push(node); // a cycle

<Tree node={node} />; // serializes fine; revives with the same cycle
```

The same applies to plain shared references. Two props that point at the same object end up pointing at one shared object on the client too. Mutating it through one prop is visible through the other.

## Signals

Signals are serializable as long as their inner value is serializable. A signal passed across the boundary revives as the same live signal on the client. This means a parent route can own a piece of state and share it across islands. Each island reads and writes the same signal.

```tsx routes/index.tsx
import { page } from "./$index.ts";
import { useSignal } from "@preact/signals";
import { Display } from "../islands/Display.tsx";
import { Controls } from "../islands/Controls.tsx";

export default page(() => {
  const count = useSignal(0);
  return (
    <>
      <Display count={count} />
      <Controls count={count} />
    </>
  );
});
```

A plain `computed(...)` is not serializable. The derivation function can't be reproduced on the client. For derived values that need to cross the boundary, use [`makeComputed`](/docs/concepts/signals#derived-values) from `fresh/signals` instead.

## Functions

Most JavaScript functions are not serializable. The function body is JavaScript source, and there is no general way to ship arbitrary source to the browser and rebuild a working closure.

The way around this is the `islands/` folder. Files under `islands/` (or a co-located `(_islands)/` folder) are compiled separately and shipped to the client. So a function exported from one of those files has a known client-side counterpart, and Fresh can reference it from the serialized payload.

There are two patterns for serializable functions, and both require the export to live under `islands/`.

### Plain

A plain serializable function is just a regular function exported from an island file. Import it from a route and pass it as a prop or event handler. The same function runs on the client when the event fires.

This works for any behavior that does not depend on values created in the route.

```tsx islands/actions.tsx
export function greet() {
  alert("Hello!");
}
```

```tsx routes/index.tsx
import { page } from "./$index.ts";
import { greet } from "../islands/actions.tsx";

export default page(() => <button onClick={greet}>Greet</button>);
```

### Factory

A factory is a wrapper exported from an island file. It takes call-site arguments and returns a value (usually a closure). The wrapper ships a small recipe to the client: the wrapper itself, plus the arguments it was called with. The client re-runs the recipe to rebuild the value. This is how you can create new closures at the call site of a route and still have them survive to the browser.

Define a factory with `factory(fn)` from `fresh/serializable`.

```tsx islands/handlers.tsx
import { factory } from "fresh/serializable";
import type { Signal } from "@preact/signals";

export const incrementBy = factory((count: Signal<number>, step: number) => () => {
  count.value += step;
});
```

```tsx routes/counter.tsx
import { page } from "./$counter.ts";
import { useSignal } from "@preact/signals";
import { incrementBy } from "../islands/handlers.tsx";

export default page(() => {
  const count = useSignal(0);
  return (
    <div>
      <button onClick={incrementBy(count, 1)}>+1</button>
      <button onClick={incrementBy(count, 10)}>+10</button>
      <span>{count}</span>
    </div>
  );
});
```

There are two extra constraints on factories beyond living under `islands/`. The wrapper's return value must be an object or a function (primitives can't carry the bookkeeping that lets Fresh rebuild them; to return a primitive, wrap it in `{ value: 42 }`). And each call-site argument must itself be serializable.

The built-in [event factories](/docs/concepts/events) (`setValue`, `add`, `toggle`, `setFromProp`) are all defined this way.

### Plain or factory?

The rule of thumb is whether the function needs to **close over** state created in the route.

Use a plain function when the behavior is the same every time it runs. `greet` above always pops the same alert. It needs nothing from the call site. Importing it from the route and passing it as a handler is enough.

Use a factory when the function needs to capture per-render state. The most common case is a route that creates a signal with `useSignal` and wants to write to it from an event handler. The route can't ship the inline `() => count.value++` closure to the client, but it can call a factory with `count` as an argument. The factory returns a closure that closes over that specific signal, and the client rebuilds an equivalent closure bound to the same revived signal.

Inside an [island](/docs/concepts/islands) you don't need any of this. The closure runs on the client to begin with, so an inline `onClick={() => count.value++}` is fine. Factories are for handlers and callbacks created in a route that need to cross to the client.

## What is not serializable

Passing one of these to a server-rendered island prop, factory argument, or event handler raises an error at SSR time.

- Plain JavaScript functions and closures that are not an island export or a `factory(...)` result.
- Plain `computed(...)` signals. Use `makeComputed` instead.
- Class instances other than the built-ins listed above. Custom classes lose their prototype on the round-trip.
- DOM nodes, `Element`, `Event`, and other browser-only references.
- `Symbol` values.
- `Promise` values, async iterators, and generators.
- `WeakMap` and `WeakSet`.

If you need to send something in one of these categories, reshape it first. Pre-fetch a `Promise` and pass its resolved value. Project a class instance to a plain object. Move the closure into an island and import it from there.
