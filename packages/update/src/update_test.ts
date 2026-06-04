import * as path from "@std/path";
import {
  FRESH_VERSION,
  PREACT_SIGNALS_VERSION,
  PREACT_VERSION,
  updateProject,
} from "./update.ts";
import { expect } from "@std/expect";
import { spy, type SpyCall } from "@std/testing/mock";
import { walk } from "@std/fs/walk";
import { withTmpDir, writeFiles } from "../../fresh/src/test_utils.ts";

async function readFiles(dir: string): Promise<Record<string, string>> {
  const files: Record<string, string> = {};

  for await (
    const entry of walk(dir, { includeDirs: false, includeFiles: true })
  ) {
    const pathname = path.relative(dir, entry.path);
    const content = await Deno.readTextFile(entry.path);
    files[`/${pathname.replaceAll(/[\\]+/g, "/")}`] = content.trim();
  }

  return files;
}

Deno.test("update - remove JSX pragma import", async () => {
  await using _tmp = await withTmpDir();
  const dir = _tmp.dir;
  await writeFiles(dir, {
    "/deno.json": `{}`,
    "/routes/index.tsx": `import { h, Fragment } from "preact";
/** @jsx h */
/** @jsxFrag Fragment */
export default function Foo() {
  return null;
}`,
  });

  await updateProject(dir);
  const files = await readFiles(dir);

  expect(files["/routes/index.tsx"])
    .toEqual(`export default function Foo() {
  return null;
}`);
});

Deno.test("update - 1.x project deno.json", async () => {
  await using _tmp = await withTmpDir();
  const dir = _tmp.dir;
  await writeFiles(dir, {
    "/deno.json": `{}`,
  });

  await updateProject(dir);
  const files = await readFiles(dir);

  expect(JSON.parse(files["/deno.json"]))
    .toEqual({
      imports: {
        "fresh": `jsr:@fresh/core@^${FRESH_VERSION}`,
        "@preact/signals": `npm:@preact/signals@^${PREACT_SIGNALS_VERSION}`,
        "preact": `npm:preact@^${PREACT_VERSION}`,
      },
    });
});

Deno.test("update - 1.x project deno.json with imports", async () => {
  await using _tmp = await withTmpDir();
  const dir = _tmp.dir;
  await writeFiles(dir, {
    "/deno.json": `{
        "imports": {
          "$fresh/": "foo"
        }
      }`,
  });

  await updateProject(dir);
  const files = await readFiles(dir);

  expect(JSON.parse(files["/deno.json"]))
    .toEqual({
      imports: {
        "fresh": `jsr:@fresh/core@^${FRESH_VERSION}`,
        "@preact/signals": `npm:@preact/signals@^${PREACT_SIGNALS_VERSION}`,
        "preact": `npm:preact@^${PREACT_VERSION}`,
      },
    });
});

Deno.test("update - 1.x project deno.json tasks + lock", async () => {
  await using tmp = await withTmpDir();
  await writeFiles(tmp.dir, {
    "/deno.json": `{
      "lock": false,
      "tasks": {
        "check": "deno fmt --check && deno lint && deno check **/*.ts && deno check **/*.tsx",
        "cli": "echo \\"import '$fresh/src/dev/cli.ts'\\" | deno run --unstable -A -",
        "manifest": "deno task cli manifest $(pwd)",
        "start": "deno run -A --watch=static/,routes/ dev.ts",
        "build": "deno run -A dev.ts build",
        "preview": "deno run -A main.ts",
        "update": "deno run -A -r https://usefresh.dev/update ."
      }
    }`,
  });

  await updateProject(tmp.dir);
  const files = await readFiles(tmp.dir);

  const updated = JSON.parse(files["/deno.json"]);
  expect(updated.lock).toEqual(undefined);
  expect(updated.tasks)
    .toEqual({
      build: "deno run -A dev.ts build",
      check: "deno fmt --check && deno lint && deno check",
      preview: "deno serve -A _fresh/server.js",
      start: "deno run -A --watch=static/,routes/ dev.ts",
      update: "deno run -A -r jsr:@fresh/update .",
    });
});

Deno.test("update - 1.x project middlewares", async () => {
  await using _tmp = await withTmpDir();
  const dir = _tmp.dir;
  await writeFiles(dir, {
    "/deno.json": "{}",
    "/routes/_middleware.ts": `import { FreshContext } from "$fresh/server.ts";

interface State {
  data: string;
}

export async function handler(
  req: Request,
  ctx: FreshContext<State>,
) {
  ctx.state.data = "myData";
  ctx.state.url = req.url;
  const resp = await ctx.next();
  resp.headers.set("server", "fresh server");
  return resp;
}`,
  });

  await updateProject(dir);
  const files = await readFiles(dir);

  expect(files["/routes/_middleware.ts"])
    .toEqual(`import { FreshContext } from "fresh";

interface State {
  data: string;
}

export async function handler(
  ctx: FreshContext<State>,
) {
  const req = ctx.req;

  ctx.state.data = "myData";
  ctx.state.url = req.url;
  const resp = await ctx.next();
  resp.headers.set("server", "fresh server");
  return resp;
}`);
});

Deno.test("update - 1.x project middlewares one arg", async () => {
  await using _tmp = await withTmpDir();
  const dir = _tmp.dir;
  await writeFiles(dir, {
    "/deno.json": "{}",
    "/routes/_middleware.ts": `export async function handler(req: Request) {
  return new Response("hello world from: " + req.url);
}`,
  });

  await updateProject(dir);
  const files = await readFiles(dir);

  expect(files["/routes/_middleware.ts"])
    .toEqual(`import { FreshContext } from "fresh";

export async function handler(ctx: FreshContext) {
  const req = ctx.req;

  return new Response("hello world from: " + req.url);
}`);
});

Deno.test("update - 1.x update '$fresh/*' imports", async () => {
  await using _tmp = await withTmpDir();
  const dir = _tmp.dir;
  await writeFiles(dir, {
    "/deno.json": `{}`,
    "/routes/index.tsx": `import { PageProps } from "$fresh/server.ts";
export default function Foo(props: PageProps) {
  return null;
}`,
    "/routes/foo.tsx": `import { asset, Head } from "$fresh/runtime.ts";`,
  });

  await updateProject(dir);
  const files = await readFiles(dir);

  expect(files["/routes/index.tsx"])
    .toEqual(`import { PageProps } from "fresh";
export default function Foo(props: PageProps) {
  return null;
}`);
  expect(files["/routes/foo.tsx"])
    .toEqual(`import { asset, Head } from "fresh/runtime";`);
});

Deno.test("update - 1.x update handler signature", async () => {
  await using _tmp = await withTmpDir();
  const dir = _tmp.dir;
  await writeFiles(dir, {
    "/deno.json": `{}`,
    "/routes/index.tsx": `import { Handlers } from "$fresh/server.ts";

export const handler: Handlers = {
  async GET(req, ctx) {},
  async POST(req, ctx) {},
  async PATCH(req, ctx) {},
  async PUT(req, ctx) {},
  async DELETE(req, ctx) {},
};`,
    "/routes/foo.tsx": `import { Handlers } from "$fresh/server.ts";

export const handler: Handlers = {
  async GET(_req, ctx) {},
  async POST(_req, ctx) {},
  async PATCH(_req, ctx) {},
  async PUT(_req, ctx) {},
  async DELETE(_req, ctx) {},
};`,
    "/routes/name.tsx": `import { Handlers } from "$fresh/server.ts";

export const handler: Handlers = {
  async GET(request, ctx) {},
  async POST(request, ctx) {},
  async PATCH(request, ctx) {},
  async PUT(request, ctx) {},
  async DELETE(request, ctx) {},
};`,
    "/routes/name-unused.tsx": `import { Handlers } from "$fresh/server.ts";

export const handler: Handlers = {
  async GET(_request, ctx) {},
  async POST(_request, ctx) {},
  async PATCH(_request, ctx) {},
  async PUT(_request, ctx) {},
  async DELETE(_request, ctx) {},
};`,
  });

  await updateProject(dir);
  const files = await readFiles(dir);

  expect(files["/routes/index.tsx"])
    .toEqual(`import { Handlers } from "fresh/compat";

export const handler: Handlers = {
  async GET(ctx) {
    const req = ctx.req;
  },
  async POST(ctx) {
    const req = ctx.req;
  },
  async PATCH(ctx) {
    const req = ctx.req;
  },
  async PUT(ctx) {
    const req = ctx.req;
  },
  async DELETE(ctx) {
    const req = ctx.req;
  },
};`);
  expect(files["/routes/foo.tsx"])
    .toEqual(`import { Handlers } from "fresh/compat";

export const handler: Handlers = {
  async GET(ctx) {},
  async POST(ctx) {},
  async PATCH(ctx) {},
  async PUT(ctx) {},
  async DELETE(ctx) {},
};`);

  expect(files["/routes/name.tsx"])
    .toEqual(`import { Handlers } from "fresh/compat";

export const handler: Handlers = {
  async GET(ctx) {
    const request = ctx.req;
  },
  async POST(ctx) {
    const request = ctx.req;
  },
  async PATCH(ctx) {
    const request = ctx.req;
  },
  async PUT(ctx) {
    const request = ctx.req;
  },
  async DELETE(ctx) {
    const request = ctx.req;
  },
};`);
  expect(files["/routes/name-unused.tsx"])
    .toEqual(`import { Handlers } from "fresh/compat";

export const handler: Handlers = {
  async GET(ctx) {},
  async POST(ctx) {},
  async PATCH(ctx) {},
  async PUT(ctx) {},
  async DELETE(ctx) {},
};`);
});

Deno.test(
  "update - 1.x update handler signature method one arg",
  async () => {
    await using _tmp = await withTmpDir();
    const dir = _tmp.dir;
    await writeFiles(dir, {
      "/deno.json": `{}`,
      "/routes/index.tsx": `export const handler: Handlers = {
  GET(req) {
    return Response.redirect(req.url);
  },
};`,
    });
    await updateProject(dir);
    const files = await readFiles(dir);
    expect(files["/routes/index.tsx"])
      .toEqual(`export const handler: Handlers = {
  GET(ctx) {
    const req = ctx.req;

    return Response.redirect(req.url);
  },
};`);
  },
);

Deno.test.ignore(
  "update - 1.x update handler signature variable",
  async () => {
    await using _tmp = await withTmpDir();
    const dir = _tmp.dir;
    await writeFiles(dir, {
      "/deno.json": `{}`,
      "/routes/index.tsx": `export const handler: Handlers = {
  GET: (req) => Response.redirect(req.url)
};`,
      "/routes/foo.tsx": `export const handler: Handlers = {
  GET: (req, ctx) => Response.redirect(req.url),
};`,
    });
    await updateProject(dir);
    const files = await readFiles(dir);
    expect(files["/routes/index.tsx"])
      .toEqual(`export const handler: Handlers = {
  GET: (ctx) => {
    const req = ctx.req;

    return Response.redirect(req.url);
  },
};`);
    expect(files["/routes/foo.tsx"])
      .toEqual(`export const handler: Handlers = {
  GET: (ctx) => {
    const req = ctx.req;

    return Response.redirect(req.url);
  },
};`);
  },
);

Deno.test(
  "update - 1.x update handler signature non-inferred",
  async () => {
    await using _tmp = await withTmpDir();
    const dir = _tmp.dir;
    await writeFiles(dir, {
      "/deno.json": `{}`,
      "/routes/index.tsx": `export const handler = {
  GET(req: Request){
    return Response.redirect(req.url);
  }
};`,
    });
    await updateProject(dir);
    const files = await readFiles(dir);
    expect(files["/routes/index.tsx"])
      .toEqual(`import { FreshContext } from "fresh";

export const handler = {
  GET(ctx: FreshContext) {
    const req = ctx.req;

    return Response.redirect(req.url);
  },
};`);
  },
);

Deno.test(
  "update - 1.x update handler signature with destructure",
  async () => {
    await using _tmp = await withTmpDir();
    const dir = _tmp.dir;
    await writeFiles(dir, {
      "/deno.json": `{}`,
      "/routes/index.tsx": `import { Handlers } from "$fresh/server.ts";

export const handler: Handlers = {
  async GET(req, { params, render, remoteAddr }) {},
  async POST(req, { params, render, remoteAddr }) {},
  async PATCH(req, { params, render, remoteAddr }) {},
  async PUT(req, { params, render, remoteAddr }) {},
  async DELETE(req, { params, render, remoteAddr }) {},
};`,
    });
    await updateProject(dir);
    const files = await readFiles(dir);
    expect(files["/routes/index.tsx"])
      .toEqual(`import { Handlers } from "fresh/compat";

export const handler: Handlers = {
  async GET({ params, render, info, req }) {
    const remoteAddr = info.remoteAddr;
  },
  async POST({ params, render, info, req }) {
    const remoteAddr = info.remoteAddr;
  },
  async PATCH({ params, render, info, req }) {
    const remoteAddr = info.remoteAddr;
  },
  async PUT({ params, render, info, req }) {
    const remoteAddr = info.remoteAddr;
  },
  async DELETE({ params, render, info, req }) {
    const remoteAddr = info.remoteAddr;
  },
};`);
  },
);

Deno.test("update - 1.x update define* handler signatures", async () => {
  await using _tmp = await withTmpDir();
  const dir = _tmp.dir;
  await writeFiles(dir, {
    "/deno.json": `{}`,
    "/routes/_app.tsx": `import { defineApp } from "$fresh/server.ts";
export default defineApp(async (req, ctx) => {
  return null;
});`,
    "/routes/_layout.tsx": `import { defineLayout } from "$fresh/server.ts";
export default defineLayout(async (req, ctx) => {
  return null;
});`,
    "/routes/foo.tsx": `import { defineRoute } from "$fresh/server.ts";
export default defineRoute(async (req, ctx) => {
  return null;
});`,
  });

  await updateProject(dir);
  const files = await readFiles(dir);

  expect(files["/routes/_app.tsx"])
    .toEqual(`import { defineApp } from "fresh/compat";

export default defineApp(async (ctx) => {
  const req = ctx.req;

  return null;
});`);
  expect(files["/routes/_layout.tsx"])
    .toEqual(`import { defineLayout } from "fresh/compat";

export default defineLayout(async (ctx) => {
  const req = ctx.req;

  return null;
});`);
  expect(files["/routes/foo.tsx"])
    .toEqual(`import { defineRoute } from "fresh/compat";

export default defineRoute(async (ctx) => {
  const req = ctx.req;

  return null;
});`);
});

Deno.test(
  "update - 1.x update component signature async",
  async () => {
    await using _tmp = await withTmpDir();
    const dir = _tmp.dir;
    await writeFiles(dir, {
      "/deno.json": `{}`,
      "/routes/index.tsx":
        `export default async function Index(req: Request, ctx: RouteContext) {
  if (true) {
    return ctx.renderNotFound();
  }
  if ("foo" === "foo" as any) {
    ctx.renderNotFound();
    return ctx.renderNotFound();
  }
  return new Response(req.url);
}`,
    });
    await updateProject(dir);
    const files = await readFiles(dir);
    expect(files["/routes/index.tsx"])
      .toEqual(`import { FreshContext } from "fresh";
import { HttpError } from "fresh";

export default async function Index(ctx: FreshContext) {
  const req = ctx.req;

  if (true) {
    throw new HttpError(404);
  }
  if ("foo" === "foo" as any) {
    throw new HttpError(404);
    throw new HttpError(404);
  }
  return new Response(req.url);
}`);
  },
);

Deno.test.ignore(
  "update - 1.x ctx.renderNotFound() -> throw new HttpError(404)",
  async () => {
    await using _tmp = await withTmpDir();
    const dir = _tmp.dir;
    await writeFiles(dir, {
      "/deno.json": `{}`,
      "/routes/index.tsx": `import { Handlers } from "$fresh/server.ts";

export const handler: Handlers = {
  async GET(_req, ctx) {
    return ctx.renderNotFound();
  },
};`,
      "/routes/foo.tsx": `export const handler = (ctx) => {
  return ctx.renderNotFound();
}`,
    });

    await updateProject(dir);
    const files = await readFiles(dir);

    expect(files["/routes/index.tsx"])
      .toEqual(`import { Handlers } from "fresh";

export const handler: Handlers = {
  async GET(ctx) {
    throw HttpError(404);
  },
};`);

    expect(files["/routes/foo.tsx"])
      .toEqual(`export const handler = (ctx) => {
  throw HttpError(404);
};`);
  },
);

Deno.test.ignore(
  "update - 1.x ctx.remoteAddr -> ctx.info.remoteAddr",
  async () => {
    await using _tmp = await withTmpDir();
    const dir = _tmp.dir;
    await writeFiles(dir, {
      "/deno.json": `{}`,
      "/routes/index.tsx": `import { Handlers } from "$fresh/server.ts";

export const handler: Handlers = {
  async GET(_req, ctx) {
    let msg = ctx.remoteAddr.transport === "tcp" ? "ok" : "not ok";
    msg += typeof ctx.renderNotFound === "function";
    return new Response(msg);
  },
};`,
    });

    await updateProject(dir);
    const files = await readFiles(dir);

    expect(files["/routes/index.tsx"])
      .toEqual(`import { Handlers } from "fresh";

export const handler: Handlers = {
  async GET(ctx) {
    let msg = ctx.info.remoteAddr.transport === "tcp" ? "ok" : "not ok";
    msg += typeof ctx.throw === "function";
    return new Response(msg);
  },
};`);
  },
);

Deno.test.ignore("update - 1.x destructured ctx members", async () => {
  await using _tmp = await withTmpDir();
  const dir = _tmp.dir;
  await writeFiles(dir, {
    "/deno.json": `{}`,
    "/routes/index.tsx": `import { Handlers } from "$fresh/server.ts";

export const handler: Handlers = {
  async GET(_req, { url, renderNotFound, remoteAddr }) {
    if (true) {
      return new Response(!!remoteAddr ? "ok" : "not ok");
    } else {
      console.log(url.href);
      return renderNotFound();
    }
  },
};`,
  });

  await updateProject(dir);
  const files = await readFiles(dir);

  expect(files["/routes/index.tsx"])
    .toEqual(`import { Handlers } from "fresh";

export const handler: Handlers = {
  async GET({ url, throw, info }) {
    const renderNotFound = () => throw(404);
    const remoteAddr = info.remoteAddr;

    if (true) {
      return new Response(!!remoteAddr ? "ok" : "not ok");
    } else {
      console.log(url.href);
      return renderNotFound();
    }
  },
};`);
});

Deno.test("update - 1.x remove reference comments", async () => {
  await using _tmp = await withTmpDir();
  const dir = _tmp.dir;
  await writeFiles(dir, {
    "/deno.json": `{}`,
    "/routes/main.ts": `/// <reference no-default-lib="true" />
/// <reference lib="dom" />
/// <reference lib="dom.iterable" />
/// <reference lib="dom.asynciterable" />
/// <reference lib="deno.ns" />
`,
  });

  await updateProject(dir);
  const files = await readFiles(dir);

  expect(files["/routes/main.ts"]).toEqual("");
});

Deno.test("update - island files", async () => {
  await using _tmp = await withTmpDir();
  const dir = _tmp.dir;
  await writeFiles(dir, {
    "/deno.json": `{}`,
    "/islands/foo.tsx": `import { IS_BROWSER } from "$fresh/runtime.ts";`,
  });

  await updateProject(dir);
  const files = await readFiles(dir);

  expect(files["/islands/foo.tsx"]).toEqual(
    `import { IS_BROWSER } from "fresh/runtime";`,
  );
});

Deno.test("update - ignores node_modules and vendor in logs", async () => {
  await using _tmp = await withTmpDir();
  const dir = _tmp.dir;
  await writeFiles(dir, {
    "/deno.json": `{}`,
    "/routes/index.tsx": `import { PageProps } from "$fresh/server.ts";
export default function Foo(props: PageProps) {
  return null;
}`,
    "/node_modules/foo/bar.ts":
      `import { IS_BROWSER } from "$fresh/runtime.ts";`,
    "/vendor/foo/bar.ts": `import { IS_BROWSER } from "$fresh/runtime.ts";`,
  });

  const consoleLogSpy = spy(console, "log");

  try {
    await updateProject(dir);
  } finally {
    consoleLogSpy.restore();
  }

  const files = await readFiles(dir);

  // Should leave dependency trees untouched
  expect(files["/node_modules/foo/bar.ts"]).toEqual(
    `import { IS_BROWSER } from "$fresh/runtime.ts";`,
  );
  expect(files["/vendor/foo/bar.ts"]).toEqual(
    `import { IS_BROWSER } from "$fresh/runtime.ts";`,
  );
  expect(files["/routes/index.tsx"]).toEqual(
    `import { PageProps } from "fresh";
export default function Foo(props: PageProps) {
  return null;
}`,
  );

  const fullLog = consoleLogSpy.calls.map((call: SpyCall) =>
    call.args.join(" ")
  ).join(
    "\n",
  );

  expect(fullLog).toMatch(/Total files processed: 1/);
  expect(fullLog).toMatch(/Successfully modified: 1/);
  expect(fullLog).toMatch(/Unmodified \(no changes needed\): 0/);
  expect(fullLog).not.toMatch(/node_modules/);
  expect(fullLog).not.toMatch(/vendor/);
  expect(fullLog).toMatch(/✓ routes\/index.tsx/);
});
