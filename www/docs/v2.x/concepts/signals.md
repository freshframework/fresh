---
description: |
  Signals provide reactive state management in Fresh islands using @preact/signals.
---

[Signals](https://preactjs.com/guide/v10/signals/) are Preact's reactive primitive for managing state in [islands](/docs/concepts/islands). When a signal's value changes, any component that reads it re-renders automatically - no need for `setState` or manual subscriptions.

## Creating signals

Use `useSignal` inside a component for local state, or `signal` at module level for shared state:

```tsx islands/Counter.tsx
import { useSignal } from "@preact/signals";

export default function Counter() {
  const count = useSignal(0);

  return (
    <div>
      <p>Count: {count}</p>
      <button onClick={() => count.value++}>Increment</button>
    </div>
  );
}
```

> [info]: Signals can be rendered directly in JSX (`{count}`) without accessing `.value`. Preact detects the signal and subscribes to updates automatically.

## Computed signals

Use `computed` to derive values from other signals. Computed signals update automatically when their dependencies change:

```tsx islands/TemperatureConverter.tsx
import { useComputed, useSignal } from "@preact/signals";

export default function TemperatureConverter() {
  const celsius = useSignal(20);
  const fahrenheit = useComputed(() => (celsius.value * 9) / 5 + 32);

  return (
    <div>
      <input
        type="range"
        min={-40}
        max={100}
        value={celsius}
        onInput={(e) => (celsius.value = Number(e.currentTarget.value))}
      />
      <p>
        {celsius}°C = {fahrenheit}°F
      </p>
    </div>
  );
}
```

## Passing signals as props

Signals can be passed as props to islands. Fresh automatically serializes them on the server and reconstructs them as live signals on the client:

```tsx routes/index.tsx
import { useSignal } from "@preact/signals";
import Slider from "@/islands/Slider.tsx";

export default function Home() {
  const value = useSignal(50);
  return (
    <div>
      <Slider value={value} />
      <Slider value={value} />
    </div>
  );
}
```

Both sliders share the same signal - moving one updates the other. When the same signal object is passed to multiple islands, Fresh preserves the reference so they stay synchronized.

> [info]: Using `useSignal` in a route component (not an island) is intentional here. The signal is created during server rendering, serialized into the HTML, and reconstructed as a live signal on the client. This is how Fresh shares reactive state between multiple islands on the same page.

## Shared state across islands

For state that needs to be shared between unrelated islands, create a signal in a separate module:

```ts utils/cart.ts
import { signal } from "@preact/signals";

export const cart = signal<string[]>([]);
```

```tsx islands/AddToCart.tsx
import { cart } from "@/utils/cart.ts";

export default function AddToCart(props: { product: string }) {
  return (
    <button onClick={() => (cart.value = [...cart.value, props.product])}>
      Add {props.product}
    </button>
  );
}
```

```tsx islands/CartCount.tsx
import { cart } from "@/utils/cart.ts";

export default function CartCount() {
  return <span>Items in cart: {cart.value.length}</span>;
}
```

Since both islands import the same module-level signal, they share the same state automatically. See [Sharing state between islands](/docs/examples/sharing-state-between-islands) for more patterns.

## Serialization

When signals are passed as island props, Fresh handles [serialization](/docs/advanced/serialization) automatically:

- The signal's current value is extracted on the server via `.peek()`
- On the client, the value is wrapped back into a live `signal()` or `computed()`
- Circular references and duplicate signal references are preserved

The signal's inner value must itself be serializable (see [Islands - Passing props](/docs/concepts/islands#passing-props-to-islands) for the full list of supported types).
