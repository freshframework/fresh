---
description: "Ensure URLs always end or never end with trailing slashes"
---

The `trailingSlashes()` middleware can be used to ensure URL pathnames always end with a slash character or will never end with one. It redirects the user's request respectively.

```ts main.ts
import { trailingSlashes } from "fresh";

const app = new App().use(trailingSlashes("never")).get("/", () => new Response("hello"));
```

Always append a trailing slash:

```ts main.ts
import { trailingSlashes } from "fresh";

const app = new App().use(trailingSlashes("always")).get("/", () => new Response("hello"));
```
