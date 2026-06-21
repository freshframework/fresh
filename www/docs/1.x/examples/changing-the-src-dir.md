---
description: |
  Change the source directory to effectively manage your project.
---

When you initialize a project with `deno run -A -r https://usefresh.dev`, you'll
end up with a project like the following:

```txt-files Project Structure
<project root>
├── README.md
├── components
│   └── Button.tsx
├── deno.json
├── dev.ts
├── fresh.gen.ts
├── islands
│   └── Counter.tsx
├── main.ts
├── routes
│   ├── greet
│   │   ├── [name].tsx
│   ├── api
│   │   └── joke.ts
│   ├── _404.tsx
│   └── index.tsx
└── static
    ├── favicon.ico
    └── logo.svg
```

## Using a `src` directory

If you'd like your code to live in an `src` directory (or any other directory of
your choosing), then you'll need to do the following things:

1. Move all your files, except `deno.json` and `README.md`, to the `src`
   directory.
2. Modify the `start` task in `deno.json` to point to the new directory.

Here's what the diff of `deno.json` looks like:

```diff deno.json
 {
   "lock": false,
   "tasks": {
-    "start": "deno run -A --watch=static/,routes/ dev.ts"
+    "start": "deno run -A --watch=src/static/,src/routes/ src/dev.ts"
   },
   "imports": {
     "$fresh/": "file:///Users/reed/code/fresh/",
```

The resulting file structure looks like this:

```txt-files Project Structure
<project root>
├── README.md
├── deno.json
└── src
    ├── components
    │   └── Button.tsx
    ├── dev.ts
    ├── fresh.gen.ts
    ├── islands
    │   └── Counter.tsx
    ├── main.ts
    ├── routes
    │   ├── greet
    │   │   ├── [name].tsx
    │   ├── api
    │   │   └── joke.ts
    │   ├── _404.tsx
    │   └── index.tsx
    └── static
        ├── favicon.ico
        └── logo.svg
```

Success! Your code now lives elsewhere.
