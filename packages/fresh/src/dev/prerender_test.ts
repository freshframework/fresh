import { expect } from "@std/expect";
import * as path from "@std/path";
import { Builder } from "./builder.ts";
import { App } from "../app.ts";
import { staticFiles } from "../middlewares/static_files.ts";
import {
  FakeServer,
  integrationTest,
  withTmpDir,
  writeFiles,
} from "../test_utils.ts";

integrationTest("Prerender - static route", async () => {
  const root = path.join(import.meta.dirname!, "..", "..");
  await using _tmp = await withTmpDir({ dir: root, prefix: "tmp_builder_" });
  const tmp = _tmp.dir;

  await writeFiles(tmp, {
    "routes/index.tsx": `
      export const config = { prerender: true };
      export default () => <h1>Home</h1>;
    `,
    "routes/about.tsx": `
      export const config = { prerender: true };
      export default () => <h1>About</h1>;
    `,
    "routes/dynamic.tsx": `
      export default () => <h1>Dynamic</h1>;
    `,
  });

  const builder = new Builder({
    root: tmp,
    outDir: path.join(tmp, "_fresh"),
  });

  const applyBuildCache = await builder.build({
    mode: "production",
    snapshot: "memory",
  });

  const app = new App().use(staticFiles()).fsRoutes();
  applyBuildCache(app);
  const server = new FakeServer(app.handler());

  // Prerendered routes should be served as static files
  const homeRes = await server.get("/");
  const homeText = await homeRes.text();
  expect(homeRes.status).toEqual(200);
  expect(homeText).toContain("<h1>Home</h1>");

  const aboutRes = await server.get("/about");
  const aboutText = await aboutRes.text();
  expect(aboutRes.status).toEqual(200);
  expect(aboutText).toContain("<h1>About</h1>");

  // Non-prerendered route should NOT be a static file
  // (it falls through to the route handler)
  const dynamicRes = await server.get("/dynamic");
  const dynamicText = await dynamicRes.text();
  expect(dynamicRes.status).toEqual(200);
  expect(dynamicText).toContain("<h1>Dynamic</h1>");
});

integrationTest("Prerender - dynamic route with path function", async () => {
  const root = path.join(import.meta.dirname!, "..", "..");
  await using _tmp = await withTmpDir({ dir: root, prefix: "tmp_builder_" });
  const tmp = _tmp.dir;

  await writeFiles(tmp, {
    "routes/blog/[slug].tsx": `
      export const config = {
        prerender: () => [{ slug: "hello" }, { slug: "world" }],
      };
      export default (ctx) => <h1>{ctx.params.slug}</h1>;
    `,
  });

  const builder = new Builder({
    root: tmp,
    outDir: path.join(tmp, "_fresh"),
  });

  const applyBuildCache = await builder.build({
    mode: "production",
    snapshot: "memory",
  });

  const app = new App().use(staticFiles()).fsRoutes();
  applyBuildCache(app);
  const server = new FakeServer(app.handler());

  const helloRes = await server.get("/blog/hello");
  expect(helloRes.status).toEqual(200);
  expect(await helloRes.text()).toContain("<h1>hello</h1>");

  const worldRes = await server.get("/blog/world");
  expect(worldRes.status).toEqual(200);
  expect(await worldRes.text()).toContain("<h1>world</h1>");
});

integrationTest(
  "Prerender - skips dynamic route with prerender: true",
  async () => {
    const root = path.join(import.meta.dirname!, "..", "..");
    await using _tmp = await withTmpDir({
      dir: root,
      prefix: "tmp_builder_",
    });
    const tmp = _tmp.dir;

    await writeFiles(tmp, {
      "routes/[id].tsx": `
        export const config = { prerender: true };
        export default (ctx) => <h1>{ctx.params.id}</h1>;
      `,
    });

    const builder = new Builder({
      root: tmp,
      outDir: path.join(tmp, "_fresh"),
    });

    // Should not throw, just warn and skip
    const applyBuildCache = await builder.build({
      mode: "production",
      snapshot: "memory",
    });

    const app = new App().use(staticFiles()).fsRoutes();
    applyBuildCache(app);
    const server = new FakeServer(app.handler());

    // Dynamic route falls through to handler since it wasn't prerendered
    const res = await server.get("/test");
    expect(res.status).toEqual(200);
    expect(await res.text()).toContain("<h1>test</h1>");
  },
);
