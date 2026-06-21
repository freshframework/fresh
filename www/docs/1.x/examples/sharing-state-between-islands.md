---
description: |
  When you need to have state shared between islands, this page provides a few recipes.
---

All of this content is lifted from this great
[example](https://fresh-with-signals.deno.dev/) by Luca. The source can be found
[here](https://github.com/lucacasonato/fresh-with-signals).

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

Note how `useSignal` is within the `Counter` component. Then if we instantiate
some counters like this...

```tsx routes/index.tsx
<Counter start={3} />
<Counter start={4} />
```

they'll keep track of their own independent state. Not much sharing going on
here, yet.

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

## Independent Islands

We can also create a `signal` in a utility file and export it for consumption
across multiple places.

```ts utils/cart.ts
import { signal } from "@preact/signals";

export const cart = signal<string[]>([]);
```

```tsx islands/AddToCart.tsx
import { Button } from "../components/Button.tsx";
import { cart } from "../utils/cart.ts";

interface AddToCartProps {
  product: string;
}

// This island is used to add a product to the cart state.
export default function AddToCart(props: AddToCartProps) {
  return (
    <Button
      onClick={() => (cart.value = [...cart.value, props.product])}
      class="w-full"
    >
      Add{cart.value.includes(props.product) ? " another" : ""}{" "}
      "{props.product}" to cart
    </Button>
  );
}
```

```tsx islands/Cart.tsx
import { Button } from "../components/Button.tsx";
import { cart } from "../utils/cart.ts";
import * as icons from "../components/Icons.tsx";

// This island is used to display the cart contents and remove items from it.
export default function Cart() {
  return (
    <h1 class="text-xl flex items-center justify-center">
      Cart
    </h1>

    <ul class="w-full bg-gray-50 mt-2 p-2 rounded-sm min-h-[6.5rem]">
      {cart.value.length === 0 && (
        <li class="text-center my-4">
          <div class="text-gray-400">
            <icons.Cart class="w-8 h-8 inline-block" />
            <div>
              Your cart is empty.
            </div>
          </div>
        </li>
      )}
      {cart.value.map((product, index) => (
        <CartItem product={product} index={index} />
      ))}
    </ul>
  );
}

interface CartItemProps {
  product: string;
  index: number;
}

function CartItem(props: CartItemProps) {
  const remove = () => {
    const newCart = [...cart.value];
    newCart.splice(props.index, 1);
    cart.value = newCart;
  };

  return (
    <li class="flex items-center justify-between gap-1">
      <icons.Lemon class="text-gray-500" />
      <div class="flex-1">
        {props.product}
      </div>
      <Button onClick={remove} aria-label="Remove" class="border-none">
        <icons.X class="inline-block w-4 h-4" />
      </Button>
    </li>
  );
}
```

Now we can add the islands to our site by doing the following:

```tsx routes/cart.tsx
<AddToCart product="Lemon" />
<AddToCart product="Lime" />
<Cart />
```

What happens as a result? The `cart` signal is shared across the two `AddToCart`
islands _and_ the `Cart` island.
