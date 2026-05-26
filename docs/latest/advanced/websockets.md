---
description: |
  Add real-time WebSocket endpoints to your Fresh app with ctx.upgrade() or app.ws().
---

Fresh provides built-in helpers for upgrading HTTP connections to WebSockets.
There are two main approaches depending on your use case.

> [warn]: WebSocket upgrades do not work under the Vite dev server (`deno task
> dev`). Both `app.ws()` and `ctx.upgrade()` rely on `Deno.upgradeWebSocket()`,
> which requires Deno's native HTTP server to be handling the request. Vite
> serves requests through a Node HTTP server and forwards them to Fresh as
> synthesized `Request` objects, so the 101 upgrade response cannot be
> completed and the `open` handler is never invoked.
>
> To test WebSocket endpoints locally, run a production-style build:
>
> ```sh
> deno task build && deno task start
> ```
>
> This runs `deno serve` directly, so `Deno.upgradeWebSocket()` works as
> expected. If you need WebSockets during iterative development, run a
> separate Deno entry point (e.g. `deno serve -A main.ts`) alongside Vite, or
> host the WebSocket server as a sidecar on its own port.

## Quick start with `app.ws()`

The simplest way to add a WebSocket endpoint:

```ts main.ts
import { App } from "fresh";

const app = new App()
  .ws("/ws", {
    open(socket) {
      console.log("Client connected");
    },
    message(socket, event) {
      socket.send(`Echo: ${event.data}`);
    },
    close(socket, code, reason) {
      console.log("Client disconnected", code, reason);
    },
  });
```

`app.ws(path, handlers)` registers a GET route that automatically upgrades the
request to a WebSocket connection and wires up your event handlers.

## Using `ctx.upgrade()` in route handlers

For file-based routes or when you need more control, use `ctx.upgrade()` inside
a GET handler.

### Managed mode

Pass an event handlers object and receive the upgrade `Response` directly:

```ts routes/api/ws.ts
import { define } from "@/utils.ts";

export const handlers = define.handlers({
  GET(ctx) {
    return ctx.upgrade({
      open(socket) {
        console.log("Client connected");
      },
      message(socket, event) {
        socket.send(`Echo: ${event.data}`);
      },
      close(socket, code, reason) {
        console.log("Disconnected", code, reason);
      },
      error(socket, event) {
        console.error("WebSocket error", event);
      },
    });
  },
});
```

### Bare mode

Call `ctx.upgrade()` without arguments to get the raw `WebSocket` object. This
is useful when you need to store the socket in a shared structure like a chat
room or pub/sub registry:

```ts routes/api/chat.ts
import { define } from "@/utils.ts";

const clients = new Set<WebSocket>();

export const handlers = define.handlers({
  GET(ctx) {
    const { socket, response } = ctx.upgrade();

    socket.onopen = () => {
      clients.add(socket);
    };
    socket.onmessage = (event) => {
      // Broadcast to all connected clients
      for (const client of clients) {
        if (client.readyState === WebSocket.OPEN) {
          client.send(event.data);
        }
      }
    };
    socket.onclose = () => {
      clients.delete(socket);
    };

    return response;
  },
});
```

## Upgrade options

Both modes accept an options object to configure the underlying WebSocket:

```ts
// Managed mode — pass handlers first, then options
ctx.upgrade(handlers, {
  idleTimeout: 60, // close if no ping received within 60s (default: 120)
  protocol: "graphql-ws", // sub-protocol to negotiate
});

// Bare mode — pass options without handlers to get the raw socket back
const { socket, response } = ctx.upgrade({ idleTimeout: 60 });
```

> **How does Fresh tell the two calls apart?** The first argument is treated as
> managed-mode handlers when it contains at least one function-valued handler
> key (`open`, `message`, `close`, or `error`). A plain options object only has
> non-function fields (`idleTimeout`, `protocol`), so it always enters bare
> mode.

The same options can be passed to `app.ws()`:

```ts
app.ws("/ws", handlers, { idleTimeout: 60 });
```

> `app.ws()` always uses managed mode. For bare-mode access to the raw socket,
> use `app.get()` with `ctx.upgrade()` instead.

## Error handling

If a non-WebSocket request hits a WebSocket route, `ctx.upgrade()` throws an
`HttpError(400)` with the message "Expected a WebSocket upgrade request". This
is handled automatically by Fresh's error pipeline and returns a 400 response.

## Handler reference

All handler callbacks are optional:

| Callback  | Arguments                | Description                                          |
| --------- | ------------------------ | ---------------------------------------------------- |
| `open`    | `(socket)`               | Connection established                               |
| `message` | `(socket, event)`        | Message received (`event.data` contains the payload) |
| `close`   | `(socket, code, reason)` | Connection closed                                    |
| `error`   | `(socket, event)`        | Error occurred on the connection                     |

## Client-side example

Connect from the browser:

```ts
const protocol = location.protocol === "https:" ? "wss:" : "ws:";
const ws = new WebSocket(`${protocol}//${location.host}/ws`);

ws.onopen = () => {
  ws.send("Hello from the client!");
};

ws.onmessage = (event) => {
  console.log("Received:", event.data);
};
```
