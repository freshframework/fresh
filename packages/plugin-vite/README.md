# Fresh vite plugin

Vite plugin for [Fresh](https://usefresh.dev).

## Usage

1. Run `deno install jsr:@fresh/plugin-vite npm:vite`
2. Ensure that your `deno.json` has the `fresh` import mapping:

```json
{
  "imports": {
    "fresh": "jsr:@fresh/core"
  }
}
```

3. Update your `vite.config.ts` file:

```diff
  import { defineConfig } from "vite";
+ import { fresh } from "@fresh/plugin-vite";
  
  export default defineConfig({
    plugins: [
+     fresh(),
    ],
  });
```

4. Update your deno tasks respectively:

- Dev: `vite`
- Build: `vite build`

More information
[on the Fresh documentation](https://usefresh.dev/docs/advanced/vite) .
