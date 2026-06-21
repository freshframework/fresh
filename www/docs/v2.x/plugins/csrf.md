---
description: "Prevent Cross-Site Request Forgery with this middleware"
---

The `csrf()` middleware can be used to safeguard against
[Cross-Site Request Forgery vulnerabilities](https://developer.mozilla.org/en-US/docs/Web/Security/Attacks/CSRF).
It verifies that state-changing requests (POST, PUT, DELETE, etc.) originate
from your own site by checking the
[`Sec-Fetch-Site`](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Sec-Fetch-Site)
and
[`Origin`](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Origin)
headers. Requests from untrusted origins are rejected.

```ts main.ts
import { App, csrf } from "fresh";

const app = new App();

app.use(csrf());

// Specify a single origin
app.use(csrf({ origin: "https://example.com" }));

// Specify multiple origins
app.use(
  csrf({ origin: ["https://example.com", "https://trusted.example.com"] }),
);

// Use a function
app.use(
  csrf({
    origin: (origin) => /^https:\/\/(foo|bar)\.example\.com$/.test(origin),
  }),
);
```
