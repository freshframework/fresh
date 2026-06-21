---
description: |
  Fresh's architecture is designed to leverage server components by default.
---

If you've read about Fresh's [architecture](/docs/1.x/concepts/architecture)
then you know that it's based on the islands architecture pattern. The flip side
of this is that everything else is, by default, a server component. When you
[create a route](/docs/1.x/getting-started/create-a-route), all of the
components used are rendered on the server. No JavaScript is sent to the client,
unless you specifically include something from the `/islands/` folder.

Internally, Fresh's rendering heavily leverages
[preact-render-to-string](https://github.com/preactjs/preact-render-to-string).
This is the exact library mentioned on Preact's
[Server-Side Rendering](https://preactjs.com/guide/v10/server-side-rendering/)
article.
