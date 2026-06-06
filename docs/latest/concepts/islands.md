---
description: |
  Islands enable client side interactivity in Fresh. They are hydrated on the client in addition to being rendered on the server.
---

Islands enable client side interactivity in Fresh and they are rendered both on
the server and in the client.

Islands are defined by creating a file in the `islands/` folder or a
`(_islands)` folder somewhere in the `routes/` directory. The name of this file
must be a PascalCase or kebab-case name of the island.

```tsx islands/my-island.tsx
import { useSignal } from "@preact/signals";

export default function MyIsland() {
  const count = useSignal(0);

  return (
    <div>
      <p>Count: {count}</p>
      <button onClick={() => (count.value += 1)}>+</button>
    </div>
  );
}
```

An island can be used anywhere like a regular Preact component. Fresh will take
care of making it interactive on the client.

```tsx main.tsx
import { App, staticFiles } from "fresh";
import MyIsland from "./islands/my-island.tsx";

const app = new App()
  .use(staticFiles())
  .get("/", (ctx) => ctx.render(<MyIsland />));
```

## Passing props to islands

Passing props to islands is supported, but only if the props are
[serializable](/docs/advanced/serialization). Fresh can serialize the following
types of values:

- Primitive types `string`, `number`, `boolean`, `bigint`, `undefined`, and
  `null`
- `Infinity`, `-Infinity`, `-0`, and `NaN`
- `Uint8Array`
- `URL`
- `Date`
- `RegExp`
- `JSX` Elements
- Collections `Map` and `Set`
- `Temporal` objects (`Instant`, `ZonedDateTime`, `PlainDate`, `PlainTime`,
  `PlainDateTime`, `PlainYearMonth`, `PlainMonthDay`, `Duration`)
- Plain objects with string keys and serializable values
- Arrays containing serializable values
- Preact [Signals](/docs/concepts/signals) (if the inner value is serializable)

Circular references are supported. If an object or signal is referenced multiple
times, it is only serialized once and the references are restored upon
deserialization.

> [warn]: Passing functions to an island is not supported.
>
> ```tsx routes/example.tsx
> export default function () {
>   // WRONG
>   return <MyIsland onClick={() => console.log("hey")} />;
> }
> ```

### Passing JSX

A powerful feature of Fresh is that you can pass server-rendered JSX to an
island via props.

```tsx routes/index.tsx
import { staticFiles } from "fresh";
import MyIsland from "../islands/my-island.tsx";

const app = new App()
  .use(staticFiles())
  .get("/", (ctx) => {
    return ctx.render(
      <MyIsland jsx={<h1>hello</h1>}>
        <p>This text is rendered on the server</p>
      </MyIsland>,
    );
  });
```

### Nesting islands

Islands can be nested within other islands as well. In that scenario they act
like a normal Preact component, but still receive the serialized props if any
were present.

In essence, Fresh allows you to mix static and interactive parts in your app in
a way that's most optimal for your app. We'll keep sending only the JavaScript
that is needed for the islands to the browser.

```tsx islands/other-island.tsx
export default (props: { foo: string }) => <>{props.foo}</>;
```

```tsx routes/index.tsx
import MyIsland from "../islands/my-island.tsx";
import OtherIsland from "../islands/other-island.tsx";

// Later...
<div>
  <MyIsland>
    <OtherIsland foo="this prop will be serialized" />
  </MyIsland>
  <p>Some more server rendered text</p>
</div>;
```

## Client-only islands

Some libraries (e.g. Monaco Editor, certain charting libraries) reference
browser globals like `document` at the module top level, which crashes during
server-side rendering. You can mark an island as **client-only** by adding
`export const clientOnly = true`. Fresh will skip executing the component on the
server and render an empty placeholder instead. On the client, the component
renders normally.

```tsx islands/my-editor.tsx
export const clientOnly = true;

export default function MyEditor() {
  // Safe to use document, window, etc. — this code never runs on the server.
  return <div>{/* ... */}</div>;
}
```

> [warn]: Client-only islands produce no meaningful HTML on the server. This
> means search engines will not see their content, and users will see an empty
> placeholder until JavaScript loads. Use this only when the component truly
> cannot run on the server.

### Using `IS_BROWSER` for a custom fallback

If the module itself can be loaded on the server but you only need to guard
certain API calls, use the `IS_BROWSER` constant from `fresh/runtime` instead.
This lets you return a meaningful SSR fallback:

```tsx islands/my-island.tsx
import { IS_BROWSER } from "fresh/runtime";

export function MyIsland() {
  // Return any prerenderable JSX here which makes sense for your island
  if (!IS_BROWSER) return <div></div>;

  // All the code which must run in the browser comes here!
  // Like: EventSource, navigator.getUserMedia, etc.
  return <div></div>;
}
```

## Using Custom Elements (Web Components)

[Custom elements](https://developer.mozilla.org/en-US/docs/Web/API/Web_components/Using_custom_elements)
can be used in Fresh, but they must be registered client-side since
`customElements.define()` is a browser API.

### Registering a custom element

Use an island to register and render custom elements:

```tsx islands/MyElement.tsx
import { useEffect } from "preact/hooks";
import { IS_BROWSER } from "fresh/runtime";

export function MyElement() {
  useEffect(() => {
    if (customElements.get("my-greeting")) return;

    customElements.define(
      "my-greeting",
      class extends HTMLElement {
        connectedCallback() {
          const name = this.getAttribute("name") ?? "World";
          this.innerHTML = `<p>Hello, ${name}!</p>`;
        }
      },
    );
  }, []);

  if (!IS_BROWSER) {
    return <div></div>;
  }

  return <my-greeting name="Fresh" />;
}
```

### Using third-party web components

Third-party web component libraries work the same way - import and register them
inside an island:

```tsx islands/ThirdPartyElement.tsx
import { useEffect } from "preact/hooks";
import { IS_BROWSER } from "fresh/runtime";

export function ShoelaceButton() {
  useEffect(() => {
    // Import the library's registration script
    import("@shoelace-style/shoelace/dist/components/button/button.js");
  }, []);

  if (!IS_BROWSER) {
    return <button>Click me</button>;
  }

  return <sl-button variant="primary">Click me</sl-button>;
}
```

> [tip]: Return a plain HTML fallback from the server-side branch
> (`!IS_BROWSER`) so the page is usable before JavaScript loads.
