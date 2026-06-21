---
description: |
  Islands enable client side interactivity in Fresh. They are rendered on the
  server and additionally hydrated on the client.
---

Islands enable client side interactivity in Fresh. An island is an isolated Preact component that is rendered on the server like any component, and then hydrated on the client so it can respond to user input. Everything outside an island stays static HTML. No JavaScript is shipped for it.

Islands are defined by creating a file in the `islands/` folder in a Fresh project. The exported component is a normal Preact component.

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

An island can be used in a page like a regular Preact component. Fresh detects that it is an island and takes care of hydrating it automatically.

```tsx routes/index.tsx
import { page } from "./$index.ts";
import { Counter } from "../islands/Counter.tsx";

export default page(() => (
  <main>
    <h1>Welcome</h1>
    <Counter />
  </main>
));
```

Islands can also live next to the routes that use them. Place them in a co-located `(_islands)/` folder inside `routes/`. See [Routing](/docs/concepts/routing) for the conventions.

## Passing props to islands

Passing props to islands is supported, but only if the props are serializable. Props cross from the server to the client, so Fresh has to encode them into the page payload. See [Serializable types](/docs/advanced/serializable-types) for the full reference. The short version is that Fresh can serialize the following kinds of values:

- Primitives: `string`, `number`, `boolean`, `bigint`, `null`, and `undefined`
- The special numeric values `NaN`, `Infinity`, and `-Infinity`
- `Date`, `RegExp`, `Map`, and `Set`
- Plain objects and arrays of serializable values
- Circular and shared references (serialized once, restored as one instance on the client)
- Preact [Signals](/docs/concepts/signals), if their inner value is serializable
- [Serializable functions](/docs/advanced/serializable-types#functions) — plain functions exported from an island file, or `factory(...)` wrappers exported from one
- JSX elements, passed as a slot (see below)

```tsx routes/index.tsx
import { greet } from "../islands/actions.tsx";

<Counter start={3} label="Clicks" tags={new Set(["a", "b"])} onGreet={greet} />;
```

Plain inline closures defined in a route are **not** serializable, and neither are class instances of unrecognized classes or other arbitrary objects. Passing one throws at render time. See [Serializable types](/docs/advanced/serializable-types) for the full set of rules and for how to define your own serializable functions.

### Signals stay reactive across islands

A signal passed as a prop is the same reactive signal on the client. This means a parent can own a piece of state and share it across multiple islands. Both islands receive the same `count` and stay in sync.

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

See [Signals & reactivity](/docs/concepts/signals).

## Passing JSX to islands

Islands support passing JSX as a "slot". The static content is rendered on the server and the client splices it back into the island after hydration. This lets you mix server rendered markup into the interactive part of the page without shipping JavaScript for it.

```tsx islands/Card.tsx
import { ComponentChildren } from "preact";
import { useSignal } from "@preact/signals";

interface Props {
  children: ComponentChildren;
}

export function Card({ children }: Props) {
  const open = useSignal(true);

  return (
    <div>
      <button onClick={() => (open.value = !open.value)}>{open.value ? "Hide" : "Show"}</button>
      {open.value && <div class="card">{children}</div>}
    </div>
  );
}
```

```tsx routes/index.tsx
import { page } from "./$index.ts";
import { Card } from "../islands/Card.tsx";

export default page(() => (
  <Card>
    <p>This text is rendered on the server.</p>
  </Card>
));
```

## Nesting islands

There are two ways one island can end up "inside" another, and they behave differently.

**Rendered in the outer island's component body.** The outer island imports the inner island and uses it as part of its own JSX. The two run together as a single Preact tree on the client. Only the outer island is a hydration root. The inner island acts as a regular Preact component, and its props are just JavaScript values in the outer island's runtime, not serialized separately.

```tsx islands/Card.tsx
import { ComponentChildren } from "preact";
import { useSignal } from "@preact/signals";
import { Counter } from "./Counter.tsx";

export function Card({ children }: { children: ComponentChildren }) {
  const open = useSignal(true);
  return (
    <div>
      <button onClick={() => (open.value = !open.value)}>Toggle</button>
      {open.value && (
        <div class="card">
          <Counter />
          {children}
        </div>
      )}
    </div>
  );
}
```

**Passed to the outer island as a slot.** The inner island appears in a route file as a child (or other JSX prop) of the outer island. The slot is rendered on the server and spliced into the outer island's DOM after it hydrates. Preact for the outer island does not control that subtree, so the inner island is a separate hydration root with its own serialized props.

```tsx routes/index.tsx
import { page } from "./$index.ts";
import { Card } from "../islands/Card.tsx";
import { Counter } from "../islands/Counter.tsx";

export default page(() => (
  <Card>
    <Counter start={5} />
    <p>Some more server rendered text.</p>
  </Card>
));
```

In the first case the outer island bundle carries the inner island's code, and you can pass anything through props since nothing crosses the boundary again. In the second case the inner island ships its own bundle and its props go through the [serializer](/docs/advanced/serializable-types).

## Rendering on the client only

When using client-only APIs like `EventSource` or `navigator.getUserMedia`, an island that calls them at render time will fail on the server with something like `ReferenceError: EventSource is not defined`. Guard the browser-only branch with the `IS_BROWSER` flag from `fresh/runtime`.

```tsx islands/Live.tsx
import { IS_BROWSER } from "fresh/runtime";

export function Live() {
  if (!IS_BROWSER) return <div>Loading…</div>;

  // Everything here runs only in the browser.
  const source = new EventSource("/events");
  // ...
  return <div>Live!</div>;
}
```
