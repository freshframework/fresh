---
description: |
  When you need to have state shared between islands, this page provides a few recipes.
---

## Multiple Sibling Islands with Independent State

Imagine we have `Counter.tsx` like this:

```tsx islands/Counter.tsx
import { useSignal } from "@preact/signals";
import { Button } from "../components/Button.tsx";

interface CounterProps {
  start: number;
}

// This island is used to display a counter and increment/decrement it. The
// state for the counter is stored locally in this island.
export default function Counter(props: CounterProps) {
  const count = useSignal(props.start);
  return (
    <div class="flex gap-2 items-center w-full">
      <p class="flex-grow-1 font-bold text-xl">{count}</p>
      <Button onClick={() => count.value--}>-1</Button>
      <Button onClick={() => count.value++}>+1</Button>
    </div>
  );
}
```

Note how `useSignal` is within the `Counter` component. Then if we instantiate some counters like this...

```tsx routes/index.tsx
<Counter start={3} />
<Counter start={4} />
```

they'll keep track of their own independent state. Not much sharing going on here, yet.

## Multiple Sibling Islands with Shared State

But we can switch things up by looking at a `SynchronizedSlider.tsx` like this:

```tsx islands/SynchronizedSlider.tsx
import { Signal } from "@preact/signals";

interface SliderProps {
  slider: Signal<number>;
}

// This island displays a slider with a value equal to the `slider` signal's
// value. When the slider is moved, the `slider` signal is updated.
export default function SynchronizedSlider(props: SliderProps) {
  return (
    <input
      class="w-full"
      type="range"
      min={1}
      max={100}
      value={props.slider.value}
      onInput={(e) => (props.slider.value = Number(e.currentTarget.value))}
    />
  );
}
```

Now if we were to do the following...

```tsx routes/index.tsx
export default function Home() {
  const sliderSignal = useSignal(50);
  return (
    <div>
      <SynchronizedSlider slider={sliderSignal} />
      <SynchronizedSlider slider={sliderSignal} />
      <SynchronizedSlider slider={sliderSignal} />
    </div>
  );
}
```

they would all use the same value.

## Sharing State Across Independent Islands

When islands are not rendered as siblings (e.g. one in a sidebar and one in the main content), you can share state by creating a signal in a parent component and passing it as a prop to each island.

```tsx islands/AddToCart.tsx
import { type Signal } from "@preact/signals";
import { Button } from "../components/Button.tsx";

interface AddToCartProps {
  cart: Signal<string[]>;
  product: string;
}

export default function AddToCart(props: AddToCartProps) {
  const { cart, product } = props;
  return (
    <Button onClick={() => (cart.value = [...cart.value, product])} class="w-full">
      Add{cart.value.includes(product) ? " another" : ""} "{product}" to cart
    </Button>
  );
}
```

```tsx islands/Cart.tsx
import { type Signal } from "@preact/signals";
import { Button } from "../components/Button.tsx";
import * as icons from "../components/Icons.tsx";

interface CartProps {
  cart: Signal<string[]>;
}

export default function Cart(props: CartProps) {
  const { cart } = props;
  return (
    <div>
      <h1 class="text-xl flex items-center justify-center">Cart</h1>
      <ul class="w-full bg-gray-50 mt-2 p-2 rounded-sm min-h-[6.5rem]">
        {cart.value.length === 0 && (
          <li class="text-center my-4">
            <div class="text-gray-400">
              <icons.Cart class="w-8 h-8 inline-block" />
              <div>Your cart is empty.</div>
            </div>
          </li>
        )}
        {cart.value.map((product, index) => (
          <CartItem cart={cart} product={product} index={index} />
        ))}
      </ul>
    </div>
  );
}

interface CartItemProps {
  cart: Signal<string[]>;
  product: string;
  index: number;
}

function CartItem(props: CartItemProps) {
  const remove = () => {
    const newCart = [...props.cart.value];
    newCart.splice(props.index, 1);
    props.cart.value = newCart;
  };

  return (
    <li class="flex items-center justify-between gap-1">
      <icons.Lemon class="text-gray-500" />
      <div class="flex-1">{props.product}</div>
      <Button onClick={remove} aria-label="Remove" class="border-none">
        <icons.X class="inline-block w-4 h-4" />
      </Button>
    </li>
  );
}
```

Then wire them together from a route, passing the same signal to both:

```tsx routes/cart.tsx
import { useSignal } from "@preact/signals";
import AddToCart from "../islands/AddToCart.tsx";
import Cart from "../islands/Cart.tsx";
import { define } from "../utils.ts";

export default define.page(function CartPage() {
  const cart = useSignal<string[]>([]);
  return (
    <div>
      <AddToCart cart={cart} product="Lemon" />
      <AddToCart cart={cart} product="Lime" />
      <Cart cart={cart} />
    </div>
  );
});
```

The `cart` signal is created per-render (not at module level), so each request gets its own independent cart. Fresh [serializes](/docs/advanced/serialization) the signal and passes it to both islands, keeping them in sync on the client.

> [!CAUTION] Avoid creating signals at the module level (e.g. `export const cart = signal([])` in a utility file). Module-level state is shared across all requests on the server, which means different users would see the same cart. Always create signals inside components or handlers.
