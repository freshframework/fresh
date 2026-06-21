---
description: "Restrict access by IP address with the ipFilter middleware"
---

The `ipFilter()` middleware restricts access based on the client's IP address. It supports deny lists, allow lists, and CIDR subnet matching. Deny rules always take precedence over allow rules.

```ts main.ts
import { App, ipFilter } from "fresh";

const app = new App()
  .use(
    ipFilter({
      denyList: ["192.168.1.10", "10.0.0.0/8"],
      allowList: ["192.168.1.0/24"],
    }),
  )
  .get("/", () => new Response("hello"));
```

## Deny list

Block specific IPs or subnets. Any request from a matching address receives a 403 Forbidden response:

```ts main.ts
import { App, ipFilter } from "fresh";

const app = new App().use(
  ipFilter({
    denyList: ["192.168.1.10", "2001:db8::1", "10.0.0.0/8"],
  }),
);
```

## Allow list

When an allow list is provided, only matching IPs are permitted. All other addresses are blocked:

```ts main.ts
import { App, ipFilter } from "fresh";

const app = new App().use(
  ipFilter({
    allowList: ["203.0.113.0/24", "2001:db8::/32"],
  }),
);
```

## Combined rules

When both lists are provided, deny rules are checked first. An IP that appears in both lists is blocked:

```ts main.ts
import { App, ipFilter } from "fresh";

const app = new App().use(
  ipFilter({
    denyList: ["192.168.1.10"],
    allowList: ["192.168.1.0/24"],
  }),
);
```

In this example, all of `192.168.1.0/24` is allowed except `192.168.1.10`.

## Custom blocked response

By default, blocked requests receive a `403 Forbidden` response. Use the `onBlocked` callback to customize this:

```ts main.ts
import { App, ipFilter } from "fresh";

const app = new App().use(
  ipFilter(
    {
      denyList: ["10.0.0.0/8"],
    },
    {
      onBlocked: (remote, ctx) => {
        console.log(`Blocked ${remote.addr} from ${ctx.url.pathname}`);
        return new Response("Access denied", { status: 401 });
      },
    },
  ),
);
```

The `onBlocked` callback receives:

- `remote.addr` -- the client's IP address
- `remote.type` -- `"IPv4"` or `"IPv6"`
- `ctx` -- the request [context](/docs/concepts/context)
