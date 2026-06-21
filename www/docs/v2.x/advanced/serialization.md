---
description: |
  What types can be passed as island props, how Fresh serializes data between server and client, and common pitfalls.
---

When Fresh renders a page on the server, [island](/docs/concepts/islands) props
must be serialized to JSON and sent to the browser for hydration. Fresh uses a
custom serialization system that supports more types than standard
`JSON.stringify`.

## Supported types

The following types can be passed as island props:

| Type                                 | Notes                                                                                                                |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------------------- |
| `string`, `number`, `boolean`        | Primitive types                                                                                                      |
| `null`, `undefined`                  |                                                                                                                      |
| `bigint`                             |                                                                                                                      |
| `NaN`, `Infinity`, `-Infinity`, `-0` | Special numeric values                                                                                               |
| `Array`                              | Including sparse arrays                                                                                              |
| Plain objects                        | Objects with string keys and serializable values                                                                     |
| `Date`                               |                                                                                                                      |
| `URL`                                |                                                                                                                      |
| `RegExp`                             | Including flags                                                                                                      |
| `Set`                                | Values must be serializable                                                                                          |
| `Map`                                | Keys and values must be serializable                                                                                 |
| `Uint8Array`                         | Binary data                                                                                                          |
| `Signal`                             | From `@preact/signals` - see [Signals](/docs/concepts/signals)                                                       |
| `Computed Signal`                    | Read-only signals                                                                                                    |
| `Temporal.*`                         | `Instant`, `ZonedDateTime`, `PlainDate`, `PlainTime`, `PlainDateTime`, `PlainYearMonth`, `PlainMonthDay`, `Duration` |
| JSX Elements                         | Server-rendered JSX passed to islands                                                                                |

## Not serializable

The following **cannot** be passed as island props:

- **Functions and closures** - there is no way to transfer executable code
- **Class instances** - only plain objects are supported (no custom prototypes)
- **Symbols** - not representable in JSON
- **WeakMap / WeakSet** - cannot be enumerated
- **Streams, Promises** - async values cannot be frozen for transfer

```tsx
// WRONG - functions cannot be serialized
<MyIsland onClick={() => console.log("clicked")} />

// WRONG - class instance loses its prototype
<MyIsland data={new MyCustomClass()} />
```

## Circular references

Fresh handles circular references automatically. If the same object or signal
appears multiple times in the props tree, it is serialized once and all
references are restored on the client:

```tsx
const shared = { value: 42 };
const data = { a: shared, b: shared };

// `data.a` and `data.b` will reference the same object on the client
<MyIsland data={data} />;
```

## How signals are serialized

When a `Signal` is detected in island props:

1. **Server**: the signal's current value is read via `.peek()` and serialized
2. **Client**: the value is wrapped in a new `signal()` call, creating a live
   reactive signal

If the same signal object is passed to multiple islands, it is serialized once
and all islands receive the same signal instance on the client - keeping them
synchronized.

Computed signals are serialized by reading their current value and wrapping it
in `computed(() => value)` on the client. Since the original computation
function cannot be transferred, the client-side computed signal holds a static
value.

## Common pitfalls

### Accidentally passing non-serializable props

If you pass a function or class instance as a prop to an island, you'll get a
runtime error during serialization. Keep island props to plain data:

```tsx
// Instead of passing a callback...
<MyIsland onSave={handleSave} />

// ...pass data and handle events inside the island
<MyIsland itemId={item.id} />
```

### Large props

Every byte of serialized props is embedded in the HTML and parsed on the client.
Keep island props small - pass IDs or minimal data, and fetch the rest
client-side if needed.
