---
description: |
  To start a Fresh project, just run `deno task start`. This will start the
  project with default permission flags, in watch mode.
---

The next step after scaffolding out a new project, is to actually start it. To
do this you can just `deno task start`. Environment variables will be
automatically read from `.env`.

```sh Terminal
$ deno task start
Watcher Process started.
 🍋 Fresh ready
     Local: http://localhost:8000
```

If you want to start manually without Deno task, `deno run` the `main.ts` with
the appropriate flags. You will need to provide permission flags for:

- **`--allow-net`**: This is required to start the HTTP server.
- **`--allow-read`**: This is required to read (static) files from disk.
- **`--allow-env`**: This is required to read environment variables that can be
  used to configure your project.
- **`--allow-run`**: This is required to shell out to `deno` and `esbuild` under
  the hood during development to do type stripping. In production this is done
  using a WebAssembly binary.

For development, you also want to run with the [`--watch` flag][--watch], so the
Fresh server will automatically reload whenever you make a change to your code.
By default `--watch` only watches over files in your module graph. Some project
files like static files are not part of the module graph, but you probably want
to restart/reload whenever you make a change to them too. This can be done by
passing the extra folder as an argument: `--watch=static/`. You should also add
`routes/` to the watch list, so that the server restarts automatically whenever
you add a new route.

If you want to change the port or host, modify the config bag of the `start()`
call in `main.ts` to include an explicit port number:

```ts main.ts
await start(manifest, { server: { port: 3000 } });
```

You can also change the port by setting the `PORT` environment variable:

```sh Terminal
$ PORT=3000 deno task start
```

Combining all of this we get the following `deno run` command:

```sh Terminal
$ deno run --allow-net --allow-read --allow-env --allow-run --watch=static/,routes/ main.ts
Watcher Process started.
 🍋 Fresh ready
     Local: http://localhost:3000
```

If you now visit http://localhost:3000, you can see the running project. Try
change some of the text in `routes/index.tsx` and see how the page updates
automatically when you save the file.

[--watch]: https://docs.deno.com/runtime/getting_started/command_line_interface/#watch-mode
