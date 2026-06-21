---
description: |
  With a few tweaks one can use twind v1
---

When you initialize a project with `deno run -A -r https://usefresh.dev`, you'll
end up with a `main.ts` like the following:

```ts main.ts
/// <reference no-default-lib="true" />
/// <reference lib="dom" />
/// <reference lib="dom.iterable" />
/// <reference lib="dom.asynciterable" />
/// <reference lib="deno.ns" />

import "$std/dotenv/load.ts";

import { start } from "$fresh/server.ts";
import manifest from "./fresh.gen.ts";
import config from "./fresh.config.ts";

await start(manifest, config);
```

And the Fresh config is like this:

```ts fresh.config.ts
import { defineConfig } from "$fresh/server.ts";
import twindPlugin from "$fresh/plugins/twind.ts";
import twindConfig from "./twind.config.ts";

export default defineConfig({
  plugins: [twindPlugin(twindConfig)],
});
```

Let's bump that up to v1:

```diff fresh.config.ts
 import { defineConfig } from "$fresh/server.ts";
-import twindPlugin from "$fresh/plugins/twind.ts";
+import twindPlugin from "$fresh/plugins/twindv1.ts";
 import twindConfig from "./twind.config.ts";

 export default defineConfig({
```

The twind config object has changed significantly in v1, so we must also change
`twind.config.ts`. A good base looks like this (just replace whatever is there
with this):

```ts twind.config.ts
import { defineConfig, Preset } from "https://esm.sh/@twind/core@1.1.3";
import presetTailwind from "https://esm.sh/@twind/preset-tailwind@1.1.4";
import presetAutoprefix from "https://esm.sh/@twind/preset-autoprefix@1.0.7";

export default {
  ...defineConfig({
    presets: [presetTailwind() as Preset, presetAutoprefix()],
  }),
  selfURL: import.meta.url,
};
```

(Note: the `as Preset` cast is required to fix a typing issue with twind.)

To see what other presets exist, you can go to the
[twind docs](https://twind.style/presets).
