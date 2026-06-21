---
description: |
  Attach client-side event handlers to server-rendered content. No island
  required, as long as the handler is a serializable function.
---

Fresh supports attaching client-side event handlers to server-rendered content. You can write `onClick`, `onInput`, `onSubmit`, and other `on*` props directly on the JSX returned from a route, layout, or component. When the page loads in the browser, Fresh binds the handler to the element and the event fires on the client. The surrounding markup stays static HTML and no [island](/docs/concepts/islands) is created for it.

This works on any server-rendered element, on any `on*` prop. The one rule is that the handler must be a [serializable function](/docs/advanced/serializable-types#functions). Plain inline closures defined in a route file are not serializable, and Fresh throws at render time if you pass one to an `on*` prop on a server-rendered element.

```tsx
// ❌ a plain closure can't be sent to the client
<button onClick={() => count.value++}>+</button>
```

The two ways to get a serializable handler are the built-in handlers from `fresh/events`, and custom handlers defined in an island file.

> [info]: This page is about wiring events into server-rendered content. If a section of the page is already an [island](/docs/concepts/islands), none of this applies. Inside an island, ordinary Preact event handlers work and inline closures are fine. See [Inside an island](#inside-an-island) at the bottom.

## Built-in handlers

`fresh/events` ships a small set of ready-made serializable handlers that operate on [signals](/docs/concepts/signals). Each one is bound to a signal and returns a handler that can cross to the client.

| Factory | Effect on the bound signal |
| --- | --- |
| `setValue(signal, value)` | Write a fixed value. |
| `setFromProp(signal, key)` | Write `event.currentTarget[key]` (e.g. an input's `value`), coerced to the signal's type. |
| `add(signal, delta, { min?, max? })` | Add `delta` to the signal. Clamped to the optional range. |
| `toggle(signal)` | Flip a boolean. |

```tsx routes/counter.tsx
import { page } from "./$counter.ts";
import { useSignal } from "@preact/signals";
import { add, setFromProp, setValue, toggle } from "fresh/events";

export default page(() => {
  const count = useSignal(0);
  const name = useSignal("");
  const on = useSignal(false);

  return (
    <div>
      <button onClick={add(count, -1, { min: 0 })}>-</button>
      <span>{count}</span>
      <button onClick={add(count, 1)}>+</button>
      <button onClick={setValue(count, 0)}>reset</button>

      <input value={name} onInput={setFromProp(name, "value")} />
      <p>Hello, {name}!</p>

      <button onClick={toggle(on)}>{on.value ? "On" : "Off"}</button>
    </div>
  );
});
```

None of this ships an island. Fresh serializes each handler and the signals it touches, and binds them on the client. The text and attribute bindings (`{count}`, `value={name}`) update reactively. See [Signals & reactivity](/docs/concepts/signals).

## Custom handlers

For handlers that are not covered by the built-ins, write your own as a serializable function. There are two patterns, both of which require the export to live in an island file (under `islands/` or a co-located `(_islands)/` folder).

A **plain function** exported from an island is itself serializable. Pass it directly as an `on*` prop. The function runs on the client when the event fires.

```ts islands/actions.tsx
export function greet() {
  alert("Hello!");
}
```

```tsx routes/index.tsx
import { page } from "./$index.ts";
import { greet } from "../islands/actions.tsx";

export default page(() => <button onClick={greet}>Greet</button>);
```

A **factory** is for handlers that need to close over state created in the route, like a signal made with `useSignal`. Wrap the function with `factory(...)` from `fresh/serializable` and export it from an island file. The route calls the factory with the captured values, and the result is a serializable handler.

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
  return <button onClick={incrementBy(count, 1)}>+1</button>;
});
```

See [Serializable types](/docs/advanced/serializable-types#functions) for the full reference on both patterns.

## The hydration window

There is a brief period after the page loads but before Fresh's client code has attached the handlers. During that window, an `on*` prop is just an attribute on a DOM element. Clicking it does nothing. The window is usually short (the handler payload is tiny and ships inline) but it is not zero.

There is currently no built-in hook for styling elements differently during this window. A handler-bound element looks the same in the DOM before and after Fresh attaches its listeners. If you need to indicate that the page is not yet interactive, do it from a wrapping island instead.

## Inside an island

None of this applies inside an [island](/docs/concepts/islands). An island is JavaScript that ships to the client and hydrates as a normal Preact component, so ordinary Preact event handlers work without any of the serializable-function rules.

```tsx islands/Counter.tsx
import { useSignal } from "@preact/signals";

export function Counter() {
  const count = useSignal(0);
  return <button onClick={() => count.value++}>{count}</button>;
}
```

The plain inline closure on `onClick` is fine here. It runs on the client like any other Preact handler. Reach for an island when you need hooks, conditional rendering driven by client-side state, or any logic that is too involved for a factory.
