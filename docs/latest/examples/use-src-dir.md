---
description: |
  Change the source directory to effectively manage your project.
---

To reduce the number of files in the root project directory, it's possible to
configure a `"src"` directory when initalizing Fresh.

```sh Terminal
# Move code into "src" folder
deno run -Ar jsr:@fresh/init --src-dir
```

It's also possible to use a different folder name:

```sh Terminal
deno run -Ar jsr:@fresh/init --src-dir=app
```

## Files structure

When initializing the project with `--src-dir`, the structure will look roughly
like below:

```txt-files Project structure
<project root>
├── src/
│   ├── components/
│   │   └── Button.tsx
│   ├── islands/
│   │   └── Counter.tsx
│   ├── routes/
│   │   └── index.tsx
│   ├── static/
│   ├── client.ts
│   └── main.ts
├── deno.json
└── vite.config.ts
```

## Updating an existing project

To migrate an existing Fresh project using Vite, to use a `src` directory follow
the steps below.

1. Move all code related to Fresh into the `src` folder
   - Move `components/`, `routes/`, `islands/`, `main.ts`, `client.ts` and any
     other related code into the `src` folder
   - Leave `deno.json` & `vite.config.ts` in the project root
2. Update `vite.config.ts` and add `root: "src",`
   ```diff
    export default defineConfig({
   +  root: "src",
      plugins: [fresh()],
    });
   ```
3. Update the `"start"` task in `deno.json` to the new `_fresh` location
   ```diff
   - "start": "deno serve -A _fresh/server.js",
   + "start": "deno serve -A src/_fresh/server.js",
   ```

Success! The project should now run with `deno task`.
