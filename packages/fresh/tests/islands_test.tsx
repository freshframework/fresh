import { App, staticFiles } from "fresh";
import { BlockIsland } from "./fixtures_islands/BlockIsland.tsx";
import { Counter } from "./fixtures_islands/Counter.tsx";
import { IslandInIsland } from "./fixtures_islands/IslandInIsland.tsx";
import { JsonIsland } from "./fixtures_islands/JsonIsland.tsx";
import { SelfCounter } from "./fixtures_islands/SelfCounter.tsx";
import { CounterWithSlots } from "./fixtures_islands/CounterWithSlots.tsx";
import { PassThrough } from "./fixtures_islands/PassThrough.tsx";
import { NullIsland } from "./fixtures_islands/NullIsland.tsx";
import { Multiple1, Multiple2 } from "./fixtures_islands/Multiple.tsx";
import { JsxIsland } from "./fixtures_islands/JsxIsland.tsx";
import { JsxChildrenIsland } from "./fixtures_islands/JsxChildrenIsland.tsx";
import { NodeProcess } from "./fixtures_islands/NodeProcess.tsx";
import { signal } from "@preact/signals";
import {
  ALL_ISLAND_DIR,
  buildProd,
  Doc,
  ISLAND_GROUP_DIR,
  withBrowserApp,
} from "./test_utils.tsx";
import { parseHtml, waitFor, waitForText } from "./test_utils.tsx";
import { expect } from "@std/expect";
import { JsxConditional } from "./fixtures_islands/JsxConditional.tsx";
import { FnIsland } from "./fixtures_islands/FnIsland.tsx";
import { EscapeIsland } from "./fixtures_islands/EscapeIsland.tsx";
import type { FreshConfig } from "../src/config.ts";
import { FreshAttrs } from "./fixtures_islands/FreshAttrs.tsx";
import { FakeServer } from "../src/test_utils.ts";
import { PARTIAL_SEARCH_PARAM } from "../src/constants.ts";
import { ComputedSignal } from "./fixtures_islands/Computed.tsx";
import { EnvIsland } from "./fixtures_islands/EnvIsland.tsx";
import ClientOnlyIsland from "./fixtures_islands/ClientOnlyIsland.tsx";

Deno.env.set("FRESH_PUBLIC_TEST_FOO", "test-env-value");
Deno.env.set("FRESH_PRIVATE_TEST_FOO", "i-should-not-be-visible");
const allIslandCache = await buildProd({ islandDir: ALL_ISLAND_DIR });
const islandGroupCache = await buildProd({ root: ISLAND_GROUP_DIR });

function testApp(config?: FreshConfig): App<unknown> {
  const app = new App(config)
    .use(staticFiles())
    .fsRoutes();

  allIslandCache(app);

  return app;
}

function testGroupApp(config?: FreshConfig): App<unknown> {
  const app = new App(config)
    .use(staticFiles())
    .fsRoutes();

  islandGroupCache(app);

  return app;
}

Deno.test({
  name: "islands - should make signals interactive",
  fn: async () => {
    const app = testApp()
      .get("/", (ctx) => {
        const sig = signal(3);
        return ctx.render(
          <Doc>
            <Counter count={sig} />
          </Doc>,
        );
      });

    await withBrowserApp(app, async (page, address) => {
      await page.goto(address, { waitUntil: "load" });
      await page.locator(".ready").wait();
      await page.locator(".increment").click();
      await waitForText(page, ".output", "4");
    });
  },
});

Deno.test({
  name: "islands - revive multiple islands from one island file",
  fn: async () => {
    const app = testApp()
      .get("/", (ctx) => {
        return ctx.render(
          <Doc>
            <Multiple1 id="multiple-1" />
            <Multiple2 id="multiple-2" />
          </Doc>,
        );
      });

    await withBrowserApp(app, async (page, address) => {
      await page.goto(address, { waitUntil: "load" });
      await page.locator("#multiple-1.ready").wait();
      await page.locator("#multiple-2.ready").wait();
      await page.locator("#multiple-1 .increment").click();
      await page.locator("#multiple-2 .increment").click();
      await waitForText(page, "#multiple-1 .output", "1");
      await waitForText(page, "#multiple-2 .output", "1");
    });
  },
});

Deno.test({
  name: "islands - revive multiple islands with shared signal",
  fn: async () => {
    const app = testApp()
      .get("/", (ctx) => {
        const sig = signal(0);
        return ctx.render(
          <Doc>
            <Counter id="counter-1" count={sig} />
            <Counter id="counter-2" count={sig} />
          </Doc>,
        );
      });

    await withBrowserApp(app, async (page, address) => {
      await page.goto(address, { waitUntil: "load" });
      await page.locator("#counter-1.ready").wait();
      await page.locator("#counter-2.ready").wait();
      await page.locator("#counter-1 .increment").click();
      await waitForText(page, "#counter-1 .output", "1");
      await waitForText(page, "#counter-2 .output", "1");
    });
  },
});

Deno.test({
  // Note that computed signals are detached because we cannot
  // serialize the whole signal tree at the moment.
  name: "islands - should serialize computed",
  fn: async () => {
    const app = testApp()
      .get("/", (ctx) => {
        return ctx.render(
          <Doc>
            <ComputedSignal id="comp" />
          </Doc>,
        );
      });

    await withBrowserApp(app, async (page, address) => {
      await page.goto(address, { waitUntil: "load" });
      await page.locator("#comp.ready").wait();
      await page.locator("#comp .trigger").click();
      await waitForText(page, "#comp .output", "it works");
    });
  },
});

Deno.test({
  name: "islands - import json",
  fn: async () => {
    const app = testApp()
      .get("/", (ctx) => {
        return ctx.render(
          <Doc>
            <JsonIsland />
          </Doc>,
        );
      });

    await withBrowserApp(app, async (page, address) => {
      await page.goto(address, { waitUntil: "load" });
      await page.locator("pre").wait();
      const text = await page
        .locator<HTMLPreElement>("pre")
        .evaluate((el) => el.textContent!);
      const json = JSON.parse(text);
      expect(json).toEqual({ foo: 123 });
    });
  },
});

Deno.test({
  name: "islands - returns null",
  fn: async () => {
    const app = testApp()
      .get("/", (ctx) => {
        return ctx.render(
          <Doc>
            <NullIsland />
          </Doc>,
        );
      });

    await withBrowserApp(app, async (page, address) => {
      await page.goto(address, { waitUntil: "load" });
      await page.locator(".ready").wait();
    });
  },
});

Deno.test({
  name: "islands - only instantiate top level island",
  fn: async () => {
    const app = testApp()
      .get("/", (ctx) => {
        return ctx.render(
          <Doc>
            <IslandInIsland />
          </Doc>,
        );
      });

    await withBrowserApp(app, async (page, address) => {
      await page.goto(address, { waitUntil: "load" });
      await page.locator(".ready").wait();
      await page.locator(".trigger").click();
      await waitForText(page, ".output", "1");

      const html = await page.content();
      expect(html).not.toContain("import { Counter }");
    });
  },
});

Deno.test({
  name: "islands - pass null JSX props to islands",
  fn: async () => {
    const app = testApp()
      .get("/", (ctx) => {
        return ctx.render(
          <Doc>
            <JsxIsland jsx={null}>{null}</JsxIsland>
          </Doc>,
        );
      });

    await withBrowserApp(app, async (page, address) => {
      await page.goto(address, { waitUntil: "load" });
      await page.locator(".ready").wait();

      const html = await page.content();
      const doc = parseHtml(html);
      expect(doc.querySelector(".jsx")!.childNodes.length).toEqual(0);
      expect(doc.querySelector(".children")!.childNodes.length).toEqual(0);
    });
  },
});

Deno.test({
  name: "islands - pass JSX props to islands",
  fn: async () => {
    const app = testApp()
      .get("/", (ctx) => {
        return ctx.render(
          <Doc>
            <JsxIsland jsx={<p>foo</p>}>
              <p>bar</p>
            </JsxIsland>
          </Doc>,
        );
      });

    await withBrowserApp(app, async (page, address) => {
      await page.goto(address, { waitUntil: "load" });
      await page.locator(".ready").wait();

      const text = await page
        .locator<HTMLPreElement>("pre")
        .evaluate((el) => el.textContent!);
      expect(JSON.parse(text)).toEqual({ jsx: true, children: true });
    });
  },
});

Deno.test({
  name: "islands - never serialize children prop",
  fn: async () => {
    const app = testApp()
      .get("/", (ctx) => {
        return ctx.render(
          <Doc>
            <JsxChildrenIsland>
              foobar
            </JsxChildrenIsland>
          </Doc>,
        );
      });

    await withBrowserApp(app, async (page, address) => {
      await page.goto(address, { waitUntil: "load" });
      await page.locator(".ready").wait();

      const text = await page
        .locator<HTMLScriptElement>("script")
        .evaluate((el) => el.textContent!);
      expect(text).not.toContain("foobar");

      const childText = await page
        .locator<HTMLDivElement>(".after")
        .evaluate((el) => el.textContent!);
      expect(childText).toEqual("foobar");
    });
  },
});

Deno.test({
  name: "islands - instantiate islands in jsx children",
  fn: async () => {
    const app = testApp()
      .get("/", (ctx) => {
        return ctx.render(
          <Doc>
            <PassThrough>
              <div>
                <SelfCounter />
              </div>
            </PassThrough>
          </Doc>,
        );
      });

    await withBrowserApp(app, async (page, address) => {
      await page.goto(address, { waitUntil: "load" });
      await page.locator(".ready").wait();

      await page.locator(".increment").click();
      await waitForText(page, ".output", "1");
    });
  },
});

Deno.test({
  name: "islands - instantiate islands in jsx children with slots",
  fn: async () => {
    const app = testApp()
      .get("/", (ctx) => {
        return ctx.render(
          <Doc>
            <CounterWithSlots
              jsx={
                <div>
                  <SelfCounter />
                </div>
              }
            >
              <div>
                <SelfCounter />
              </div>
            </CounterWithSlots>
          </Doc>,
        );
      });

    await withBrowserApp(app, async (page, address) => {
      await page.goto(address, { waitUntil: "load" });
      await page.locator(".ready").wait();

      await page.locator(".jsx .increment").click();
      await page.locator(".children .increment").click();
      await page.locator(".counter-with-children button").click();

      await waitForText(page, ".counter-with-children .output", "1");
      await waitForText(page, ".jsx .output", "1");
      await waitForText(page, ".children .output", "1");
    });
  },
});

Deno.test({
  name: "islands - nested children slots",
  fn: async () => {
    const app = testApp()
      .get("/", (ctx) => {
        return ctx.render(
          <Doc>
            <PassThrough>
              <PassThrough>
                <div>
                  <SelfCounter id="a" />
                </div>
              </PassThrough>
              <PassThrough>
                <div>
                  <SelfCounter id="b" />
                </div>
              </PassThrough>
            </PassThrough>
          </Doc>,
        );
      });

    await withBrowserApp(app, async (page, address) => {
      await page.goto(address, { waitUntil: "load" });
      await page.locator(".ready").wait();

      await page.locator("#a .increment").click();
      await page.locator("#b .increment").click();

      await waitForText(page, "#a .output", "1");
      await waitForText(page, "#b .output", "1");
    });
  },
});

Deno.test({
  name: "islands - conditional jsx children",
  fn: async () => {
    const app = testApp()
      .get("/", (ctx) => {
        return ctx.render(
          <Doc>
            <JsxConditional
              jsx={
                <div>
                  <SelfCounter />
                </div>
              }
            >
              <div>
                <SelfCounter />
              </div>
            </JsxConditional>
          </Doc>,
        );
      });

    await withBrowserApp(app, async (page, address) => {
      await page.goto(address, { waitUntil: "load" });
      await page.locator(".ready").wait();

      await page.locator(".jsx .increment").click();
      await page.locator(".children .increment").click();
      await page.locator(".cond-update").click();

      await waitForText(page, ".cond-output", "1");
      await waitForText(page, ".jsx .output", "1");
      await waitForText(page, ".children .output", "1");
    });
  },
});

Deno.test({
  name: "islands - revive DOM attributes",
  fn: async () => {
    const app = testApp()
      .get("/", (ctx) => {
        return ctx.render(
          <Doc>
            <JsxConditional>
              <div class="foo">
                <form>
                  <label for="check">
                    checked
                  </label>
                  <input name="check" type="checkbox" checked />
                  <label for="text">
                    is required
                  </label>
                  <input name="text" type="text" required />
                  <label for="foo-1">
                    not selected
                  </label>
                  <input id="foo-1" type="radio" name="foo" value="1" />
                  <label for="foo-2">
                    selected
                  </label>
                  <input id="foo-2" type="radio" name="foo" value="2" checked />
                  <label for="select">
                    select value should be "bar"
                  </label>
                  <select name="select">
                    <option value="foo">foo</option>
                    <option value="bar" selected>bar</option>
                  </select>
                </form>
                <SelfCounter />
              </div>
            </JsxConditional>
          </Doc>,
        );
      });

    await withBrowserApp(app, async (page, address) => {
      await page.goto(address, { waitUntil: "load" });
      await page.locator(".ready").wait();

      await page.locator(".children > .foo").wait();

      const checkboxChecked = await page
        .locator<HTMLInputElement>("input[name='check']")
        .evaluate((el) => el.checked);
      expect(checkboxChecked).toEqual(true);

      const required = await page
        .locator<HTMLInputElement>("input[name='text']")
        .evaluate((el) => el.required);
      expect(required).toEqual(true);

      const radio1 = await page
        .locator<HTMLInputElement>("input[type='radio'][value='1']")
        .evaluate((el) => el.checked);
      expect(radio1).toEqual(false);

      const radio2 = await page
        .locator<HTMLInputElement>("input[type='radio'][value='2']")
        .evaluate((el) => el.checked);
      expect(radio2).toEqual(true);
    });
  },
});

Deno.test({
  name: "islands - revive island with fn inside",
  fn: async () => {
    const app = testApp()
      .get("/", (ctx) => {
        return ctx.render(
          <Doc>
            <FnIsland />
          </Doc>,
        );
      });

    await withBrowserApp(app, async (page, address) => {
      await page.goto(address, { waitUntil: "load" });
      await page.locator(".ready").wait();

      const text = await page
        .locator<HTMLDivElement>(".ready")
        .evaluate((el) => el.textContent!);
      expect(text).toEqual("it works");
    });
  },
});

Deno.test({
  name: "islands - escape props",
  fn: async () => {
    const app = testApp()
      .get("/", (ctx) => {
        return ctx.render(
          <Doc>
            <EscapeIsland str={`"foo"asdf`} />
          </Doc>,
        );
      })
      .get("/foo", (ctx) => {
        return ctx.render(
          <Doc>
            <EscapeIsland str={`<script>alert('hey')</script>`} />
          </Doc>,
        );
      })
      .get("/bar", (ctx) => {
        return ctx.render(
          <Doc>
            <EscapeIsland str={`<!--<script>alert('hey')</script>`} />
          </Doc>,
        );
      });

    await withBrowserApp(app, async (page, address) => {
      await page.goto(address, { waitUntil: "load" });
      await page.locator(".ready").wait();

      // Page would error here
      const text = await page
        .locator<HTMLDivElement>(".ready p")
        .evaluate((el) => el.textContent!);
      expect(text).toEqual("it works");

      // Page would error here
      const text2 = await page
        .locator<HTMLDivElement>(".ready div")
        .evaluate((el) => el.textContent!);
      expect(text2).toEqual(`"foo"asdf`);
    });

    // Check escaping of `</`
    await withBrowserApp(app, async (page, address) => {
      await page.goto(`${address}/foo`, { waitUntil: "load" });

      await page.locator(".ready").wait();

      const text = await page
        .locator<HTMLDivElement>(".ready p")
        .evaluate((el) => el.textContent!);
      expect(text).toEqual("it works");

      const text2 = await page
        .locator<HTMLDivElement>(".ready div")
        .evaluate((el) => el.textContent!);
      expect(text2).toEqual(`<script>alert('hey')</script>`);
    });

    // Check escaping of `<!--`
    await withBrowserApp(app, async (page, address) => {
      await page.goto(`${address}/bar`, { waitUntil: "load" });

      await page.locator(".ready").wait();

      const text = await page
        .locator<HTMLDivElement>(".ready p")
        .evaluate((el) => el.textContent!);
      expect(text).toEqual("it works");

      const text2 = await page
        .locator<HTMLDivElement>(".ready div")
        .evaluate((el) => el.textContent!);
      expect(text2).toEqual(`<!--<script>alert('hey')</script>`);
    });

    // Partials (they use a different code path)
    await withBrowserApp(app, async (page, address) => {
      await page.goto(`${address}/foo?${PARTIAL_SEARCH_PARAM}`, {
        waitUntil: "load",
      });

      const text = await page
        .locator<HTMLScriptElement>("script[type='application/json']")
        .evaluate((el) => el.textContent!);

      const json = JSON.parse(text);
      expect(json.props).toContain("<script>alert('hey')</script>");
    });
  },
});

Deno.test({
  name: "islands - stub Node 'process.env'",
  fn: async () => {
    const app = testApp()
      .get("/", (ctx) =>
        ctx.render(
          <Doc>
            <NodeProcess />
          </Doc>,
        ));

    await withBrowserApp(app, async (page, address) => {
      await page.goto(`${address}/`, { waitUntil: "load" });
      await page.locator(".ready").wait();

      // Page would error here
      const text = await page
        .locator<HTMLDivElement>(".ready")
        .evaluate((el) => el.textContent!);
      expect(text).toEqual("value: production");
    });
  },
});

Deno.test({
  name: "islands - in base path",
  fn: async () => {
    const app = testApp({ basePath: "/foo" })
      .get("/", (ctx) =>
        ctx.render(
          <Doc>
            <SelfCounter />
          </Doc>,
        ));

    await withBrowserApp(app, async (page, address) => {
      await page.goto(`${address}/foo`, { waitUntil: "load" });
      await page.locator(".ready").wait();

      await page.locator(".increment").click();
      await waitForText(page, ".output", "1");
    });
  },
});

Deno.test({
  name: "islands - preserve f-* attributes",
  fn: async () => {
    const app = testApp()
      .get("/", (ctx) =>
        ctx.render(
          <Doc>
            <FreshAttrs />
          </Doc>,
        ));

    await withBrowserApp(app, async (page, address) => {
      await page.goto(address, { waitUntil: "load" });
      await page.locator(".ready").wait();

      const truthy = await page.locator<HTMLDivElement>(".f-client-nav-true")
        .evaluate((el) => el.getAttribute("f-client-nav"));
      const falsy = await page.locator<HTMLDivElement>(".f-client-nav-false")
        .evaluate((el) => el.getAttribute("f-client-nav"));

      expect(truthy).toEqual("true");
      expect(falsy).toEqual("false");
    });
  },
});

Deno.test({
  name: "islands - inlines FRESH_PUBLIC_* env vars",
  fn: async () => {
    const app = testApp()
      .get("/", (ctx) =>
        ctx.render(
          <Doc>
            <EnvIsland id="test" />
          </Doc>,
        ));

    await withBrowserApp(app, async (page, address) => {
      await page.goto(address, { waitUntil: "load" });
      await page.locator(".ready").wait();

      const denoEnv = await page.locator<HTMLDivElement>(".deno-env")
        .evaluate((el) => el.textContent);
      const denoEnv2 = await page.locator<HTMLDivElement>(".deno-env-2")
        .evaluate((el) => el.textContent);
      const processEnv = await page.locator<HTMLDivElement>(".process-env")
        .evaluate((el) => el.textContent);

      const denoEnvPrivate = await page.locator<HTMLDivElement>(
        ".deno-env-private",
      )
        .evaluate((el) => el.textContent);
      const denoEnvPrivate2 = await page.locator<HTMLDivElement>(
        ".deno-env-private-2",
      )
        .evaluate((el) => el.textContent);
      const processEnvPrivate = await page.locator<HTMLDivElement>(
        ".process-env-private",
      )
        .evaluate((el) => el.textContent);

      expect(denoEnv).toEqual("test-env-value");
      expect(denoEnv2).toEqual("test-env-value");
      expect(processEnv).toEqual("test-env-value");

      expect(denoEnvPrivate).toEqual("ok");
      expect(denoEnvPrivate2).toEqual("ok");
      expect(processEnvPrivate).toEqual("ok");
    });
  },
});

Deno.test({
  name: "fsRoutes - load islands from group folder",
  fn: async () => {
    const app = testGroupApp();

    await withBrowserApp(app, async (page, address) => {
      await page.goto(`${address}/foo`, { waitUntil: "load" });
      await page.locator(".ready").wait();

      // Page would error here
      const text = await page
        .locator<HTMLDivElement>(".ready")
        .evaluate((el) => el.textContent!);
      expect(text).toEqual("it works");
    });
  },
});

Deno.test({
  name: "fsRoutes - load islands from group folder with same name",
  fn: async () => {
    const app = testGroupApp();

    await withBrowserApp(app, async (page, address) => {
      await page.goto(`${address}/both`, { waitUntil: "load" });

      await page.locator(".ready").wait();

      // Page would error here
      let text = await page
        .locator<HTMLDivElement>("#foo.ready")
        .evaluate((el) => el.textContent!);
      expect(text).toEqual("it works");

      text = await page
        .locator<HTMLDivElement>("#foo-both.ready")
        .evaluate((el) => el.textContent!);
      expect(text).toEqual("it works");
    });
  },
});

Deno.test({
  name: "islands - adds preload HTTP headers",
  fn: async () => {
    const app = testApp()
      .get("/", (ctx) =>
        ctx.render(
          <Doc>
            <SelfCounter />
          </Doc>,
        ));

    const server = new FakeServer(app.handler());
    const res = await server.get("/");
    await res.body?.cancel();

    const link = res.headers.get("Link");

    expect(link).toMatch(
      /<\/_fresh\/js\/[a-zA-Z0-9]+\/fresh-runtime\.js>; rel="modulepreload"; as="script", <\/_fresh\/js\/[a-zA-Z0-9]+\/SelfCounter\.js>; rel="modulepreload"; as="script"/,
    );
  },
});

Deno.test({
  name: "islands - warns on invalid DOM nesting instead of crashing",
  fn: async () => {
    const app = testApp()
      .get("/", (ctx) => {
        return ctx.render(
          <Doc>
            <p>
              <BlockIsland />
            </p>
            <div class="after-island">still here</div>
          </Doc>,
        );
      });

    await withBrowserApp(app, async (page, address) => {
      const errors: string[] = [];
      page.addEventListener(
        "console",
        (msg) => errors.push(msg.detail.text),
      );

      await page.goto(address, { waitUntil: "load" });

      // Wait for the hydration error to be logged
      await waitFor(() =>
        errors.find((e) => e.includes("invalid HTML nesting"))
      );

      // Page should not crash — content after the island should remain
      const afterIsland = await page.evaluate(() => {
        return document.querySelector(".after-island")?.textContent;
      });
      expect(afterIsland).toEqual("still here");

      // Verify the error message mentions the island name
      const nestingError = errors.find((e) =>
        e.includes("invalid HTML nesting")
      );
      expect(nestingError).toContain("BlockIsland");
    });
  },
});

Deno.test({
  name: "islands - client-only island renders placeholder in SSR",
  fn: async () => {
    const app = testApp()
      .get("/", (ctx) => {
        return ctx.render(
          <Doc>
            <ClientOnlyIsland id="co" label="hello" />
          </Doc>,
        );
      });

    const server = new FakeServer(app.handler());
    const res = await server.get("/");
    const html = await res.text();

    // SSR should contain a placeholder div, not the island's actual content
    const doc = parseHtml(html);
    expect(doc.querySelector(".client-only")).toBeNull();
    expect(doc.querySelector(".label")).toBeNull();

    // The marker comment should have the :c flag for client-only
    expect(html).toContain("::c-->");
  },
});

Deno.test({
  name: "islands - client-only island renders on client",
  fn: async () => {
    const app = testApp()
      .get("/", (ctx) => {
        return ctx.render(
          <Doc>
            <ClientOnlyIsland id="co" label="hello" />
          </Doc>,
        );
      });

    await withBrowserApp(app, async (page, address) => {
      await page.goto(address, { waitUntil: "load" });
      await page.locator("#co.ready").wait();

      const label = await page.evaluate(() => {
        return document.querySelector("#co .label")?.textContent;
      });
      expect(label).toEqual("hello");

      const check = await page.evaluate(() => {
        return document.querySelector("#co .check")?.textContent;
      });
      expect(check).toEqual("has-document");
    });
  },
});
