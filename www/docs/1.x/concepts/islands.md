---
description: |
  Islands enable client side interactivity in Fresh. They are hydrated on the client in addition to being rendered on the server.
---

Islands enable client side interactivity in Fresh. Islands are isolated Preact
components that are rendered on the server and then hydrated on the client. This
is different from all other components in Fresh, as they are usually rendered on
the server only.

Islands are defined by creating a file in the `islands/` folder in a Fresh
project. The name of this file must be a PascalCase or kebab-case name of the
island.

```tsx islands/my-island.tsx
import { useSignal } from "@preact/signals";

export default function MyIsland() {
  const count = useSignal(0);

  return (
    <div>
      Counter is at {count}.{" "}
      <button onClick={() => (count.value += 1)}>+</button>
    </div>
  );
}
```

An island can be used in a page like a regular Preact component. Fresh will take
care of automatically re-hydrating the island on the client.

```tsx route/index.tsx
import MyIsland from "../islands/my-island.tsx";

export default function Home() {
  return <MyIsland />;
}
```

## Passing JSX to islands

Islands support passing JSX elements via the `children` property.

```tsx islands/my-island.tsx
import { useSignal } from "@preact/signals";
import { ComponentChildren } from "preact";

interface Props {
  children: ComponentChildren;
}

export default function MyIsland({ children }: Props) {
  const count = useSignal(0);

  return (
    <div>
      Counter is at {count}.{" "}
      <button onClick={() => (count.value += 1)}>+</button>
      {children}
    </div>
  );
}
```

This allows you to pass static content rendered by the server to an island in
the browser.

```tsx routes/index.tsx
import MyIsland from "../islands/my-island.tsx";

export default function Home() {
  return (
    <MyIsland>
      <p>This text is rendered on the server</p>
    </MyIsland>
  );
}
```

You can also create shared components in your `components/` directory, which can
be used in both static content and interactive islands. When these components
are used within islands, interactivity can be added, such as `onClick` handlers
(using an `onClick` handler on a button outside of an island will not fire).

```tsx islands/my-island.tsx
import { useSignal } from "@preact/signals";
import { ComponentChildren } from "preact";
import Card from "../components/Card.tsx";
import Button from "../components/Button.tsx";

interface Props {
  children: ComponentChildren;
}

export default function MyIsland({ children }: Props) {
  const count = useSignal(0);

  return (
    <Card>
      Counter is at {count}.{" "}
      <Button onClick={() => (count.value += 1)}>+</Button>
      {children}
    </Card>
  );
}
```

## Passing other props to islands

Passing props to islands is supported, but only if the props are serializable.
Fresh can serialize the following types of values:

- Primitive types `string`, `boolean`, `bigint`, and `null`
- Most `number`s (`Infinity`, `-Infinity`, and `NaN` are silently converted to
  `null`)
- Plain objects with string keys and serializable values
- Arrays containing serializable values
- Uint8Array
- JSX Elements (restricted to `props.children`)
- Preact Signals (if the inner value is serializable)

Circular references are supported. If an object or signal is referenced multiple
times, it is only serialized once and the references are restored upon
deserialization. Passing complex objects like `Date`, custom classes, or
functions is not supported.

During server side rendering, Fresh annotates the HTML with special comments
that indicate where each island will go. This gives the code sent to the client
enough information to put the islands where they are supposed to go without
requiring hydration for the static children of interactive islands. No
Javascript is sent to the client when no interactivity is needed.

```html Response body
<!--frsh-myisland_default:default:0-->
<div>
  Counter is at 0.
  <button>+</button>
  <!--frsh-slot-myisland_default:children-->
  <p>This text is rendered on the server</p>
  <!--/frsh-slot-myisland_default:children-->
</div>
<!--/frsh-myisland_default:default:0-->
```

### Nesting islands

Islands can be nested within other islands as well. In that scenario they act
like a normal Preact component, but still receive the serialized props if any
were present.

```tsx islands/other-island.tsx
import { useSignal } from "@preact/signals";
import { ComponentChildren } from "preact";

interface Props {
  children: ComponentChildren;
  foo: string;
}

function randomNumber() {
  return Math.floor(Math.random() * 100);
}

export default function OtherIsland({ children, foo }: Props) {
  const number = useSignal(randomNumber());

  return (
    <div>
      <p>String from props: {foo}</p>
      <p>
        <button onClick={() => (number.value = randomNumber())}>Random</button>
        {" "}
        number is: {number}.
      </p>
    </div>
  );
}
```

In essence, Fresh allows you to mix static and interactive parts in your app in
a way that's most optimal for your app. We'll keep sending only the JavaScript
that is needed for the islands to the browser.

```tsx route/index.tsx
import MyIsland from "../islands/my-island.tsx";
import OtherIsland from "../islands/other-island.tsx";

export default function Home() {
  return (
    <div>
      <MyIsland>
        <OtherIsland foo="this prop will be serialized" />
      </MyIsland>
      <p>Some more server rendered text</p>
    </div>
  );
}
```

## Rendering islands on client only

When using client-only APIs, like `EventSource` or `navigator.getUserMedia`,
this component will not run on the server as it will produce an error like:

```
An error occurred during route handling or page rendering. ReferenceError: EventSource is not defined
    at Object.MyIsland (file:///Users/someuser/fresh-project/islandsmy-island.tsx:6:18)
    at m (https://esm.sh/v129/preact-render-to-string@6.2.0/X-ZS8q/denonext/preact-render-to-string.mjs:2:2602)
    at m (https://esm.sh/v129/preact-render-to-string@6.2.0/X-ZS8q/denonext/preact-render-to-string.mjs:2:2113)
    ....
```

Use the [`IS_BROWSER`](https://deno.land/x/fresh/runtime.ts?doc=&s=IS_BROWSER)
flag as a guard to fix the issue:

```tsx islands/my-island.tsx
import { IS_BROWSER } from "$fresh/runtime.ts";

export function MyIsland() {
  // Return any prerenderable JSX here which makes sense for your island
  if (!IS_BROWSER) return <div></div>;

  // All the code which must run in the browser comes here!
  // Like: EventSource, navigator.getUserMedia, etc.
  return <div></div>;
}
```
