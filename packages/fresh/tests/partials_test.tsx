import { App, staticFiles } from "fresh";
import { Partial } from "fresh/runtime";
import {
  ALL_ISLAND_DIR,
  assertMetaContent,
  assertNotSelector,
  buildProd,
  charset,
  Doc,
  favicon,
  parseHtml,
  waitFor,
  waitForText,
  withBrowserApp,
} from "./test_utils.tsx";
import { SelfCounter } from "./fixtures_islands/SelfCounter.tsx";
import { expect } from "@std/expect";
import { assertSpyCalls, spy } from "@std/testing/mock";
import { PartialInIsland } from "./fixtures_islands/PartialInIsland.tsx";
import { FakeServer } from "../src/test_utils.ts";
import { JsonIsland } from "./fixtures_islands/JsonIsland.tsx";
import { OptOutPartialLink } from "./fixtures_islands/OptOutPartialLink.tsx";
import * as path from "@std/path";
import { retry } from "@std/async/retry";

const loremIpsum = await Deno.readTextFile(
  path.join(import.meta.dirname!, "lorem_ipsum.txt"),
);

const applyBuildCache = await buildProd({ islandDir: ALL_ISLAND_DIR });

function testApp<T>(): App<T> {
  const app = new App<T>()
    .use(staticFiles());

  applyBuildCache<T>(app);

  return app;
}

Deno.test({
  name: "partials - updates content",
  fn: async () => {
    const app = testApp()
      .get("/partial", (ctx) => {
        return ctx.render(
          <Partial name="foo">
            <p class="output">partial update</p>
          </Partial>,
        );
      })
      .get("/", (ctx) => {
        return ctx.render(
          <Doc>
            <div f-client-nav>
              <button type="button" f-partial="/partial" class="update">
                update
              </button>
              <Partial name="foo">
                <p class="output">hello world</p>
              </Partial>
            </div>
          </Doc>,
        );
      });

    await withBrowserApp(app, async (page, address) => {
      await page.goto(address, { waitUntil: "load" });
      await page.locator(".update").click();
      await waitForText(page, ".output", "partial update");
    });
  },
});

Deno.test({
  name: "partials - revive island not seen before",
  fn: async () => {
    const app = testApp()
      .get("/partial", (ctx) => {
        return ctx.render(
          <Doc>
            <Partial name="foo">
              <SelfCounter />
            </Partial>
          </Doc>,
        );
      })
      .get("/", (ctx) => {
        return ctx.render(
          <Doc>
            <div f-client-nav>
              <button type="button" f-partial="/partial" class="update">
                update
              </button>
              <Partial name="foo">
                <p class="init">hello world</p>
              </Partial>
            </div>
          </Doc>,
        );
      });

    await withBrowserApp(app, async (page, address) => {
      await page.goto(address, { waitUntil: "load" });
      await page.locator(".update").click();
      await page.locator(".ready").wait();

      await page.locator(".increment").click();
      await waitForText(page, ".output", "1");

      const doc = parseHtml(await page.content());
      assertNotSelector(doc, ".init");
    });
  },
});

Deno.test({
  name: "partials - warn on missing partial",
  fn: async () => {
    const app = testApp()
      .get("/partial", (ctx) => {
        return ctx.render(
          <Doc>
            <Partial name="bar">
              <p class="ready">bar</p>
            </Partial>
          </Doc>,
        );
      })
      .get("/", (ctx) => {
        return ctx.render(
          <Doc>
            <div f-client-nav>
              <button type="button" f-partial="/partial" class="update">
                update
              </button>
              <Partial name="foo">
                <p class="init">hello world</p>
              </Partial>
            </div>
          </Doc>,
        );
      });

    await withBrowserApp(app, async (page, address) => {
      const logs: string[] = [];
      page.addEventListener("console", (msg) => logs.push(msg.detail.text));

      await page.goto(address, { waitUntil: "load" });
      await page.locator(".update").click();

      await waitFor(() =>
        logs.find((line) => /^Partial.*not found/.test(line))
      );
    });
  },
});

Deno.test({
  name: "partials - errors on duplicate partial name",
  fn: async () => {
    const app = testApp()
      .get("/", (ctx) => {
        return ctx.render(
          <Doc>
            <div f-client-nav>
              <button type="button" f-partial="/partial" class="update">
                update
              </button>
              <Partial name="foo">
                <p class="ready">foo</p>
              </Partial>
              <Partial name="foo">
                <p class="ready">foo</p>
              </Partial>
            </div>
          </Doc>,
        );
      });

    const server = new FakeServer(app.handler());
    let checked = false;
    try {
      const res = await server.get("/");
      await res.body?.cancel();

      expect(res.status).toEqual(500);
      checked = true;
    } catch {
      // Ignore
    }

    expect(checked).toEqual(true);

    // TODO: Check error overlay
  },
});

// See https://github.com/denoland/fresh/issues/2254
Deno.test({
  name: "partials - should not be able to override __FRSH_STATE",
  fn: async () => {
    const app = testApp()
      .get("/partial", (ctx) => {
        return ctx.render(
          <Doc>
            <Partial name="foo">
              <SelfCounter />
              <script id="__FRSH_STATE">{"{}"}</script>
            </Partial>
          </Doc>,
        );
      })
      .get("/", (ctx) => {
        return ctx.render(
          <Doc>
            <div f-client-nav>
              <button type="button" f-partial="/partial" class="update">
                update
              </button>
              <Partial name="foo">
                <p class="init">hello world</p>
              </Partial>
            </div>
          </Doc>,
        );
      });

    await withBrowserApp(app, async (page, address) => {
      let didError = false;
      page.addEventListener("pageerror", () => {
        didError = true;
      });

      await page.goto(address, { waitUntil: "load" });
      await page.locator(".update").click();
      await page.locator(".ready").wait();

      expect(didError).toEqual(false);
    });
  },
});

Deno.test({
  name: "partials - finds partial nested in response",
  fn: async () => {
    const app = testApp()
      .get("/partial", (ctx) => {
        return ctx.render(
          <Doc>
            <div>
              <div>
                <Partial name="foo">
                  <SelfCounter />
                </Partial>
              </div>
            </div>
          </Doc>,
        );
      })
      .get("/", (ctx) => {
        return ctx.render(
          <Doc>
            <div f-client-nav>
              <button type="button" f-partial="/partial" class="update">
                update
              </button>
              <Partial name="foo">
                <p>hello world</p>
              </Partial>
            </div>
          </Doc>,
        );
      });

    await withBrowserApp(app, async (page, address) => {
      await page.goto(address, { waitUntil: "load" });
      await page.locator(".update").click();
      await page.locator(".ready").wait();
    });
  },
});

Deno.test({
  name: "partials - throws when instantiated inside island",
  fn: async () => {
    const app = testApp()
      .get("/", (ctx) => {
        return ctx.render(
          <Doc>
            <div f-client-nav>
              <PartialInIsland />
            </div>
          </Doc>,
        );
      });

    applyBuildCache(app);
    const server = new FakeServer(app.handler());
    let checked = false;
    try {
      const res = await server.get("/");
      await res.body?.cancel();

      expect(res.status).toEqual(500);
      checked = true;
    } catch {
      // Ignore
    }

    expect(checked).toEqual(true);

    // TODO: Test error overlay
  },
});

Deno.test({
  name: "partials - unmounts island",
  fn: async () => {
    const app = testApp()
      .get("/partial", (ctx) => {
        return ctx.render(
          <Doc>
            <Partial name="foo">
              <p>done</p>
            </Partial>
          </Doc>,
        );
      })
      .get("/", (ctx) => {
        return ctx.render(
          <Doc>
            <div f-client-nav>
              <button type="button" f-partial="/partial" class="update">
                update
              </button>
              <Partial name="foo">
                <SelfCounter />
              </Partial>
            </div>
          </Doc>,
        );
      });

    await withBrowserApp(app, async (page, address) => {
      await page.goto(address, { waitUntil: "load" });
      await page.locator(".ready").wait();
      await page.locator(".update").click();

      await waitFor(async () => {
        const doc = parseHtml(await page.content());
        assertNotSelector(doc, ".increment");
        return true;
      });
    });
  },
});

Deno.test({
  name: "partials - keeps island state",
  fn: async () => {
    const app = testApp()
      .get("/partial", (ctx) => {
        return ctx.render(
          <Doc>
            <Partial name="foo">
              <p class="partial-update">partial update</p>
              <SelfCounter />
            </Partial>
          </Doc>,
        );
      })
      .get("/", (ctx) => {
        return ctx.render(
          <Doc>
            <div f-client-nav>
              <button type="button" f-partial="/partial" class="update">
                update
              </button>
              <Partial name="foo">
                <p class="init">init</p>
                <SelfCounter />
              </Partial>
            </div>
          </Doc>,
        );
      });

    await withBrowserApp(app, async (page, address) => {
      await page.goto(address, { waitUntil: "load" });
      await page.locator(".ready").wait();
      await page.locator(".increment").click();
      await waitForText(page, ".output", "1");

      await page.locator(".update").click();
      await page.locator(".partial-update").wait();

      const doc = parseHtml(await page.content());
      const counter = doc.querySelector(".output")?.textContent;
      expect(counter).toEqual("1");
    });
  },
});

Deno.test({
  name: "partials - replaces island",
  fn: async () => {
    const app = testApp()
      .get("/partial", (ctx) => {
        return ctx.render(
          <Doc>
            <Partial name="foo">
              <p class="partial-update">partial update</p>
              <JsonIsland />
            </Partial>
          </Doc>,
        );
      })
      .get("/", (ctx) => {
        return ctx.render(
          <Doc>
            <div f-client-nav>
              <button type="button" f-partial="/partial" class="update">
                update
              </button>
              <Partial name="foo">
                <p class="init">init</p>
                <SelfCounter />
              </Partial>
            </div>
          </Doc>,
        );
      });

    await withBrowserApp(app, async (page, address) => {
      await page.goto(address, { waitUntil: "load" });
      await page.locator(".ready").wait();
      await page.locator(".increment").click();
      await waitForText(page, ".output", "1");

      await page.locator(".update").click();
      await page.locator(".partial-update").wait();

      const doc = parseHtml(await page.content());
      const raw = JSON.parse(doc.querySelector("pre")!.textContent!);
      expect(raw).toEqual({ foo: 123 });

      assertNotSelector(doc, ".output");
    });
  },
});

Deno.test({
  name: "partials - only updates inner partial",
  fn: async () => {
    const app = testApp()
      .get("/partial", (ctx) => {
        return ctx.render(
          <Doc>
            <Partial name="inner">
              <p class="inner-update">inner update</p>
            </Partial>
          </Doc>,
        );
      })
      .get("/", (ctx) => {
        return ctx.render(
          <Doc>
            <div f-client-nav>
              <button type="button" f-partial="/partial" class="update">
                update
              </button>
              <Partial name="outer">
                <p class="outer">outer</p>
                <Partial name="inner">
                  <p class="inner">inner</p>
                </Partial>
              </Partial>
            </div>
          </Doc>,
        );
      });

    await withBrowserApp(app, async (page, address) => {
      await page.goto(address, { waitUntil: "load" });
      await page.locator(".inner").wait();

      await page.locator(".update").click();
      await page.locator(".inner-update").wait();
    });
  },
});

Deno.test({
  name: "partials - updates sibling partials",
  fn: async () => {
    const app = testApp()
      .get("/partial", (ctx) => {
        return ctx.render(
          <Doc>
            <Partial name="sib-1">
              <p class="sib-1-update">sib-1 update</p>
            </Partial>
            <Partial name="sib-2">
              <p class="sib-2-update">sib-2 update</p>
            </Partial>
            <Partial name="sib-3">
              <p class="sib-3-update">sib-3 update</p>
            </Partial>
          </Doc>,
        );
      })
      .get("/", (ctx) => {
        return ctx.render(
          <Doc>
            <div f-client-nav>
              <button type="button" f-partial="/partial" class="update">
                update
              </button>
              <Partial name="sib-1">
                <p class="sib-1">sib-1</p>
              </Partial>
              <Partial name="sib-2">
                <p class="sib-2">sib-2</p>
              </Partial>
              <p>foo</p>
              <Partial name="sib-3">
                <p class="sib-3">sib-3</p>
              </Partial>
            </div>
          </Doc>,
        );
      });

    await withBrowserApp(app, async (page, address) => {
      await page.goto(address, { waitUntil: "load" });
      await page.locator(".sib-3").wait();
      await page.locator(".update").click();

      await page.locator(".sib-1-update").wait();
      await page.locator(".sib-2-update").wait();
      await page.locator(".sib-3-update").wait();
    });
  },
});

Deno.test({
  name: "partials - reconcile keyed islands in update",
  fn: async () => {
    const app = testApp()
      .get("/partial", (ctx) => {
        return ctx.render(
          <Doc>
            <Partial name="foo">
              <p key="p" class="done">done</p>
              <SelfCounter key="b" id="b" />
              <SelfCounter key="c" id="c" />
              <SelfCounter key="a" id="a" />
            </Partial>
          </Doc>,
        );
      })
      .get("/", (ctx) => {
        return ctx.render(
          <Doc>
            <div f-client-nav>
              <button type="button" f-partial="/partial" class="update">
                update
              </button>
              <Partial name="foo">
                <p key="p" class="init">init</p>
                <SelfCounter key="a" id="a" />
                <SelfCounter key="b" id="b" />
                <SelfCounter key="c" id="c" />
              </Partial>
            </div>
          </Doc>,
        );
      });

    await withBrowserApp(app, async (page, address) => {
      await page.goto(address, { waitUntil: "load" });
      await page.locator(".ready").wait();

      await page.locator("#a .increment").click();

      await page.locator("#b .increment").click();
      await page.locator("#b .increment").click();

      await page.locator("#c .increment").click();
      await page.locator("#c .increment").click();
      await page.locator("#c .increment").click();

      await waitForText(page, "#a .output", "1");
      await waitForText(page, "#b .output", "2");
      await waitForText(page, "#c .output", "3");

      await page.locator(".update").click();
      await page.locator(".done").wait();

      await waitForText(page, "#a .output", "1");
      await waitForText(page, "#b .output", "2");
      await waitForText(page, "#c .output", "3");
    });
  },
});

Deno.test({
  name: "partials - reconcile keyed partials",
  fn: async () => {
    const app = testApp()
      .get("/partial", (ctx) => {
        return ctx.render(
          <Doc>
            <Partial name="outer">
              <p key="p" class="done">done</p>
              <Partial key="b" name="b">
                <SelfCounter id="b" />
              </Partial>
              <Partial key="c" name="c">
                <SelfCounter id="c" />
              </Partial>
              <Partial key="a" name="a">
                <SelfCounter id="a" />
              </Partial>
            </Partial>
          </Doc>,
        );
      })
      .get("/", (ctx) => {
        return ctx.render(
          <Doc>
            <div f-client-nav>
              <button type="button" f-partial="/partial" class="update">
                update
              </button>
              <Partial name="outer">
                <p key="p" class="init">init</p>

                <Partial key="a" name="a">
                  <SelfCounter id="a" />
                </Partial>
                <Partial key="b" name="b">
                  <SelfCounter id="b" />
                </Partial>
                <Partial key="c" name="c">
                  <SelfCounter id="c" />
                </Partial>
              </Partial>
            </div>
          </Doc>,
        );
      });

    await withBrowserApp(app, async (page, address) => {
      await page.goto(address, { waitUntil: "load" });
      await page.locator(".ready").wait();

      await page.locator("#a .increment").click();

      await page.locator("#b .increment").click();
      await page.locator("#b .increment").click();

      await page.locator("#c .increment").click();
      await page.locator("#c .increment").click();
      await page.locator("#c .increment").click();

      await waitForText(page, "#a .output", "1");
      await waitForText(page, "#b .output", "2");
      await waitForText(page, "#c .output", "3");

      await page.locator(".update").click();
      await page.locator(".done").wait();

      await waitForText(page, "#a .output", "1");
      await waitForText(page, "#b .output", "2");
      await waitForText(page, "#c .output", "3");
    });
  },
});

Deno.test({
  name: "partials - reconcile keyed div inside partials",
  fn: async () => {
    const app = testApp()
      .get("/partial", (ctx) => {
        return ctx.render(
          <Doc>
            <Partial name="outer">
              <p key="p" class="done">done</p>
              <div key="b">
                <SelfCounter id="b" />
              </div>
              <div key="c">
                <SelfCounter id="c" />
              </div>
              <div key="a">
                <SelfCounter id="a" />
              </div>
            </Partial>
          </Doc>,
        );
      })
      .get("/", (ctx) => {
        return ctx.render(
          <Doc>
            <div f-client-nav>
              <button type="button" f-partial="/partial" class="update">
                update
              </button>
              <Partial name="outer">
                <p key="p" class="init">init</p>

                <div key="a">
                  <SelfCounter id="a" />
                </div>
                <div key="b">
                  <SelfCounter id="b" />
                </div>
                <div key="c">
                  <SelfCounter id="c" />
                </div>
              </Partial>
            </div>
          </Doc>,
        );
      });

    await withBrowserApp(app, async (page, address) => {
      await page.goto(address, { waitUntil: "load" });
      await page.locator(".ready").wait();

      await page.locator("#a .increment").click();

      await page.locator("#b .increment").click();
      await page.locator("#b .increment").click();

      await page.locator("#c .increment").click();
      await page.locator("#c .increment").click();
      await page.locator("#c .increment").click();

      await waitForText(page, "#a .output", "1");
      await waitForText(page, "#b .output", "2");
      await waitForText(page, "#c .output", "3");

      await page.locator(".update").click();
      await page.locator(".done").wait();

      await waitForText(page, "#a .output", "1");
      await waitForText(page, "#b .output", "2");
      await waitForText(page, "#c .output", "3");
    });
  },
});

Deno.test({
  name: "partials - reconcile keyed component inside partials",
  fn: async () => {
    function Foo(props: { id: string }) {
      return <SelfCounter id={props.id} />;
    }

    const app = testApp()
      .get("/partial", (ctx) => {
        return ctx.render(
          <Doc>
            <Partial name="outer">
              <p key="p" class="done">done</p>
              <Foo key="b" id="b" />
              <Foo key="c" id="c" />
              <Foo key="a" id="a" />
            </Partial>
          </Doc>,
        );
      })
      .get("/", (ctx) => {
        return ctx.render(
          <Doc>
            <div f-client-nav>
              <button type="button" f-partial="/partial" class="update">
                update
              </button>
              <Partial name="outer">
                <p key="p" class="init">init</p>

                <Foo key="a" id="a" />
                <Foo key="b" id="b" />
                <Foo key="c" id="c" />
              </Partial>
            </div>
          </Doc>,
        );
      });

    await withBrowserApp(app, async (page, address) => {
      await page.goto(address, { waitUntil: "load" });
      await page.locator(".ready").wait();

      await page.locator("#a .increment").click();

      await page.locator("#b .increment").click();
      await page.locator("#b .increment").click();

      await page.locator("#c .increment").click();
      await page.locator("#c .increment").click();
      await page.locator("#c .increment").click();

      await waitForText(page, "#a .output", "1");
      await waitForText(page, "#b .output", "2");
      await waitForText(page, "#c .output", "3");

      await page.locator(".update").wait();
      await page.locator(".update").click();
      await page.locator(".done").wait();

      await waitForText(page, "#a .output", "1");
      await waitForText(page, "#b .output", "2");
      await waitForText(page, "#c .output", "3");
    });
  },
});

Deno.test({
  name: "partials - skip key serialization if outside root",
  fn: async () => {
    const app = testApp()
      .get("/", (ctx) => {
        return ctx.render(
          <Doc>
            <p key="outside" class="init">outside</p>
            <Partial name="outer">
              <p key="inside" class="init">inside</p>
            </Partial>
          </Doc>,
        );
      });

    const server = new FakeServer(app.handler());
    const res = await server.get("/");
    const html = await res.text();

    expect(html).not.toMatch(/frsh:key:outside/);
  },
});

Deno.test({
  name: "partials - mode replace",
  fn: async () => {
    let i = 0;
    const app = testApp()
      .get("/partial", (ctx) => {
        const id = i++;
        return ctx.render(
          <Doc>
            <Partial name="outer" mode="replace">
              <p class={`done-${id}`}>{id}</p>
            </Partial>
          </Doc>,
        );
      })
      .get("/", (ctx) => {
        return ctx.render(
          <Doc>
            <div f-client-nav>
              <button type="button" f-partial="/partial" class="update">
                update
              </button>
              <Partial name="outer">
                <p class="init">init</p>
              </Partial>
            </div>
          </Doc>,
        );
      });

    await withBrowserApp(app, async (page, address) => {
      await page.goto(address, { waitUntil: "load" });
      await page.locator(".init").wait();
      await page.locator(".update").click();

      await page.locator(".done-0").wait();
      await page.locator(".update").click();
      await page.locator(".done-1").wait();

      const doc = parseHtml(await page.content());
      assertNotSelector(doc, ".init");
      assertNotSelector(doc, ".done-0");
    });
  },
});

Deno.test({
  name: "partials - mode replace inner",
  fn: async () => {
    let i = 0;
    const app = testApp()
      .get("/partial", (ctx) => {
        const id = i++;
        return ctx.render(
          <Doc>
            <Partial name="outer">
              <Partial name="inner" mode="replace">
                <p class={`done-${id}`}>{id}</p>
              </Partial>
            </Partial>
          </Doc>,
        );
      })
      .get("/", (ctx) => {
        return ctx.render(
          <Doc>
            <div f-client-nav>
              <button type="button" f-partial="/partial" class="update">
                update
              </button>
              <Partial name="outer">
                <Partial name="inner">
                  <p class="init">init</p>
                </Partial>
              </Partial>
            </div>
          </Doc>,
        );
      });

    await withBrowserApp(app, async (page, address) => {
      await page.goto(address, { waitUntil: "load" });
      await page.locator(".init").wait();
      await page.locator(".update").click();

      await page.locator(".done-0").wait();
      await page.locator(".update").click();
      await page.locator(".done-1").wait();

      const doc = parseHtml(await page.content());
      assertNotSelector(doc, ".init");
      assertNotSelector(doc, ".done-0");
    });
  },
});

Deno.test({
  name: "partials - mode append",
  fn: async () => {
    let i = 0;
    const app = testApp()
      .get("/partial", (ctx) => {
        const id = i++;
        return ctx.render(
          <Doc>
            <Partial name="outer" mode="append">
              <p class={`done-${id}`}>{id}</p>
            </Partial>
          </Doc>,
        );
      })
      .get("/", (ctx) => {
        return ctx.render(
          <Doc>
            <div f-client-nav>
              <button type="button" f-partial="/partial" class="update">
                update
              </button>
              <div class="content">
                <Partial name="outer">
                  <p class="init">init</p>
                </Partial>
              </div>
            </div>
          </Doc>,
        );
      });

    await withBrowserApp(app, async (page, address) => {
      await page.goto(address, { waitUntil: "load" });
      await page.locator(".init").wait();
      await page.locator(".update").click();

      await page.locator(".done-0").wait();
      await page.locator(".update").click();
      await page.locator(".done-1").wait();

      const doc = parseHtml(await page.content());

      expect(doc.querySelector(".content")!.textContent).toEqual("init01");
    });
  },
});

Deno.test({
  name: "partials - mode append inner",
  fn: async () => {
    let i = 0;
    const app = testApp()
      .get("/partial", (ctx) => {
        const id = i++;
        return ctx.render(
          <Doc>
            <Partial name="outer">
              <Partial name="inner" mode="append">
                <p class={`done-${id}`}>{id}</p>
              </Partial>
            </Partial>
          </Doc>,
        );
      })
      .get("/", (ctx) => {
        return ctx.render(
          <Doc>
            <div f-client-nav>
              <button type="button" f-partial="/partial" class="update">
                update
              </button>
              <div class="content">
                <Partial name="outer">
                  <Partial name="inner">
                    <p class="init">init</p>
                  </Partial>
                </Partial>
              </div>
            </div>
          </Doc>,
        );
      });

    await withBrowserApp(app, async (page, address) => {
      await page.goto(address, { waitUntil: "load" });
      await page.locator(".init").wait();
      await page.locator(".update").click();

      await page.locator(".done-0").wait();
      await page.locator(".update").click();
      await page.locator(".done-1").wait();

      const doc = parseHtml(await page.content());
      expect(doc.querySelector(".content")!.textContent).toEqual("init01");
    });
  },
});

Deno.test({
  name: "partials - mode prepend",
  fn: async () => {
    let i = 0;
    const app = testApp()
      .get("/partial", (ctx) => {
        const id = i++;
        return ctx.render(
          <Doc>
            <Partial name="outer" mode="prepend">
              <p class={`done-${id}`}>{id}</p>
            </Partial>
          </Doc>,
        );
      })
      .get("/", (ctx) => {
        return ctx.render(
          <Doc>
            <div f-client-nav>
              <button type="button" f-partial="/partial" class="update">
                update
              </button>
              <div class="content">
                <Partial name="outer">
                  <p class="init">init</p>
                </Partial>
              </div>
            </div>
          </Doc>,
        );
      });

    await withBrowserApp(app, async (page, address) => {
      await page.goto(address, { waitUntil: "load" });
      await page.locator(".init").wait();
      await page.locator(".update").click();

      await page.locator(".done-0").wait();
      await page.locator(".update").click();
      await page.locator(".done-1").wait();

      const doc = parseHtml(await page.content());
      expect(doc.querySelector(".content")!.textContent).toEqual("10init");
    });
  },
});

Deno.test({
  name: "partials - mode prepend inner",
  fn: async () => {
    let i = 0;
    const app = testApp()
      .get("/partial", (ctx) => {
        const id = i++;
        return ctx.render(
          <Doc>
            <Partial name="outer">
              <Partial name="inner" mode="prepend">
                <p class={`done-${id}`}>{id}</p>
              </Partial>
            </Partial>
          </Doc>,
        );
      })
      .get("/", (ctx) => {
        return ctx.render(
          <Doc>
            <div f-client-nav>
              <button type="button" f-partial="/partial" class="update">
                update
              </button>
              <div class="content">
                <Partial name="outer">
                  <Partial name="inner">
                    <p class="init">init</p>
                  </Partial>
                </Partial>
              </div>
            </div>
          </Doc>,
        );
      });

    await withBrowserApp(app, async (page, address) => {
      await page.goto(address, { waitUntil: "load" });
      await page.locator(".init").wait();
      await page.locator(".update").click();

      await page.locator(".done-0").wait();
      await page.locator(".update").click();
      await page.locator(".done-1").wait();

      const doc = parseHtml(await page.content());
      expect(doc.querySelector(".content")!.textContent).toEqual("10init");
    });
  },
});

Deno.test({
  name: "partials - navigate",
  fn: async () => {
    const app = testApp()
      .get("/partial", (ctx) => {
        return ctx.render(
          <Doc>
            <Partial name="foo">
              <p class="done">done</p>
              <SelfCounter />
            </Partial>
          </Doc>,
        );
      })
      .get("/", (ctx) => {
        return ctx.render(
          <Doc>
            <div f-client-nav>
              <a href="/partial" class="update">update</a>
              <Partial name="foo">
                <p class="init">init</p>
                <SelfCounter />
              </Partial>
            </div>
          </Doc>,
        );
      });

    await withBrowserApp(app, async (page, address) => {
      await page.goto(address, { waitUntil: "load" });
      await page.locator(".ready").wait();

      await page.locator(".increment").click();
      await waitForText(page, ".output", "1");

      await page.locator(".update").click();
      await page.locator(".done").wait();

      await page.waitForFunction(() => {
        const url = new URL(window.location.href);
        return url.pathname === "/partial";
      });

      await waitForText(page, ".output", "1");

      await page.evaluate(() => window.history.go(-1));

      await page.locator(".init").wait();
      await page.waitForFunction(() => {
        const url = new URL(window.location.href);
        return url.pathname === "/";
      });
    });
  },
});

Deno.test({
  name: "partials - uses f-partial instead",
  fn: async () => {
    const app = testApp()
      .get("/partial", (ctx) => {
        return ctx.render(
          <Doc>
            <Partial name="foo">
              <p class="done">done</p>
              <SelfCounter />
            </Partial>
          </Doc>,
        );
      })
      .get("/", (ctx) => {
        return ctx.render(
          <Doc>
            <div f-client-nav>
              <a href="/foo" f-partial="/partial" class="update">update</a>
              <Partial name="foo">
                <p class="init">init</p>
                <SelfCounter />
              </Partial>
            </div>
          </Doc>,
        );
      });

    await withBrowserApp(app, async (page, address) => {
      await page.goto(address, { waitUntil: "load" });
      await page.locator(".ready").wait();

      await page.locator(".increment").click();
      await waitForText(page, ".output", "1");

      await page.locator(".update").click();
      await page.locator(".done").wait();

      await page.waitForFunction(() => {
        const url = new URL(window.location.href);
        return url.pathname === "/foo";
      });
      await waitForText(page, ".output", "1");

      await page.evaluate(() => window.history.go(-1));

      await page.locator(".init").wait();
      await page.waitForFunction(() => {
        const url = new URL(window.location.href);
        return url.pathname === "/";
      });
    });
  },
});

Deno.test({
  name: "partials - with SVG in link",
  fn: async () => {
    const app = testApp()
      .get("/partial", (ctx) => {
        return ctx.render(
          <Doc>
            <Partial name="foo">
              <p class="done">done</p>
              <SelfCounter />
            </Partial>
          </Doc>,
        );
      })
      .get("/", (ctx) => {
        return ctx.render(
          <Doc>
            <div f-client-nav>
              <a href="/foo" f-partial="/partial">
                <svg
                  width="100"
                  height="100"
                  viewBox="-256 -256 512 512"
                  version="1.1"
                  xmlns="http://www.w3.org/2000/svg"
                  xmlnsXlink="http://www.w3.org/1999/xlink"
                >
                  <path
                    class="update"
                    d="M0,-256 221.7025033688164,-128 221.7025033688164,128 0,256 -221.7025033688164,128 -221.7025033688164,-128z"
                    fill="#673ab8"
                  />
                  <ellipse
                    cx="0"
                    cy="0"
                    stroke-width="16px"
                    rx="75px"
                    ry="196px"
                    fill="none"
                    stroke="white"
                    transform="rotate(52.5)"
                  />
                  <ellipse
                    cx="0"
                    cy="0"
                    stroke-width="16px"
                    rx="75px"
                    ry="196px"
                    fill="none"
                    stroke="white"
                    transform="rotate(-52.5)"
                  />
                  <circle cx="0" cy="0" r="34" fill="white" />
                </svg>
                update
              </a>
              <Partial name="foo">
                <p class="init">init</p>
                <SelfCounter />
              </Partial>
            </div>
          </Doc>,
        );
      });

    await withBrowserApp(app, async (page, address) => {
      await page.goto(address, { waitUntil: "load" });
      await page.locator(".ready").wait();

      await page.locator(".increment").click();
      await waitForText(page, ".output", "1");

      await page.locator(".update").click();

      await page.waitForFunction(() => {
        const url = new URL(window.location.href);
        return url.pathname === "/foo";
      });
      await page.locator(".done").wait();
      await waitForText(page, ".output", "1");
    });
  },
});

Deno.test({
  name: "partials - with SVG in button",
  fn: async () => {
    const app = testApp()
      .get("/partial", (ctx) => {
        return ctx.render(
          <Doc>
            <Partial name="foo">
              <p class="done">done</p>
              <SelfCounter />
            </Partial>
          </Doc>,
        );
      })
      .get("/", (ctx) => {
        return ctx.render(
          <Doc>
            <div f-client-nav>
              <button type="button" f-partial="/partial">
                <svg
                  width="100"
                  height="100"
                  viewBox="-256 -256 512 512"
                  version="1.1"
                  xmlns="http://www.w3.org/2000/svg"
                  xmlnsXlink="http://www.w3.org/1999/xlink"
                >
                  <path
                    class="update"
                    d="M0,-256 221.7025033688164,-128 221.7025033688164,128 0,256 -221.7025033688164,128 -221.7025033688164,-128z"
                    fill="#673ab8"
                  />
                  <ellipse
                    cx="0"
                    cy="0"
                    stroke-width="16px"
                    rx="75px"
                    ry="196px"
                    fill="none"
                    stroke="white"
                    transform="rotate(52.5)"
                  />
                  <ellipse
                    cx="0"
                    cy="0"
                    stroke-width="16px"
                    rx="75px"
                    ry="196px"
                    fill="none"
                    stroke="white"
                    transform="rotate(-52.5)"
                  />
                  <circle cx="0" cy="0" r="34" fill="white" />
                </svg>
                update
              </button>
              <Partial name="foo">
                <p class="init">init</p>
                <SelfCounter />
              </Partial>
            </div>
          </Doc>,
        );
      });

    await withBrowserApp(app, async (page, address) => {
      await page.goto(address, { waitUntil: "load" });
      await page.locator(".ready").wait();

      await page.locator(".increment").click();
      await waitForText(page, ".output", "1");

      await page.locator(".update").click();

      await page.locator(".done").wait();
      await waitForText(page, ".output", "1");
    });
  },
});

Deno.test({
  name: "partials - opt out of partial navigation",
  ignore: true, // TODO: test is flaky
  fn: async () => {
    const app = testApp()
      .get("/partial", (ctx) => {
        return ctx.render(
          <Doc>
            <Partial name="foo">
              <h1 class="fail">Fail</h1>
            </Partial>
          </Doc>,
        );
      })
      .get("/foo", (ctx) =>
        ctx.render(
          <Doc>
            <Partial name="foo">
              <h1 class="done">done</h1>
              <SelfCounter />
            </Partial>
          </Doc>,
        ))
      .get("/", (ctx) => {
        return ctx.render(
          <Doc>
            <div f-client-nav>
              <a
                href="/foo"
                f-client-nav={false}
                f-partial="/partial"
                class="update"
              >
                update
              </a>
              <Partial name="foo">
                <p class="init">init</p>
                <SelfCounter />
              </Partial>
            </div>
          </Doc>,
        );
      });

    await withBrowserApp(app, async (page, address) => {
      await retry(async () => {
        await page.goto(address, { waitUntil: "load" });
        await page.locator(".ready").wait();

        await page.locator(".increment").click();
        await waitForText(page, ".output", "1");

        await page.locator(".update").click();
        await page.locator(".done").wait();

        await page.waitForFunction(() => {
          const url = new URL(window.location.href);
          return url.pathname === "/foo";
        });
        await page.locator(".output").wait();
        await waitForText(page, ".output", "0");
      });
    });
  },
});

Deno.test({
  name: "partials - opt out of partial navigation #2",
  ignore: true, // TODO: test is flaky
  fn: async () => {
    const app = testApp()
      .get("/partial", (ctx) => {
        return ctx.render(
          <Doc>
            <Partial name="foo">
              <h1 class="fail">Fail</h1>
            </Partial>
          </Doc>,
        );
      })
      .get("/foo", (ctx) =>
        ctx.render(
          <Doc>
            <Partial name="foo">
              <h1 class="done">done</h1>
              <SelfCounter />
            </Partial>
          </Doc>,
        ))
      .get("/", (ctx) => {
        return ctx.render(
          <Doc>
            <div f-client-nav>
              <div>
                <div f-client-nav={false}>
                  <a
                    href="/foo"
                    f-partial="/partial"
                    class="update"
                  >
                    update
                  </a>
                </div>
              </div>
              <Partial name="foo">
                <p class="init">init</p>
                <SelfCounter />
              </Partial>
            </div>
          </Doc>,
        );
      });

    await withBrowserApp(app, async (page, address) => {
      await retry(async () => {
        await page.goto(address, { waitUntil: "load" });
        await page.locator(".ready").wait();

        await page.locator(".increment").click();
        await waitForText(page, ".output", "1");

        await page.locator(".update").click();
        await page.waitForSelector(".done");

        const url = new URL(page.url!);
        expect(url.pathname).toEqual("/foo");
        await waitForText(page, ".output", "0");
      });
    });
  },
});

Deno.test({
  name: "partials - opt out of partial navigation in island",
  fn: async () => {
    const app = testApp()
      .get("/partial", (ctx) => {
        return ctx.render(
          <Doc>
            <Partial name="foo">
              <h1 class="fail">Fail</h1>
            </Partial>
          </Doc>,
        );
      })
      .get("/foo", (ctx) =>
        ctx.render(
          <Doc>
            <Partial name="foo">
              <h1 class="done">done</h1>
              <SelfCounter />
            </Partial>
          </Doc>,
        ))
      .get("/", (ctx) => {
        return ctx.render(
          <Doc>
            <div f-client-nav>
              <div>
                <OptOutPartialLink href="/foo" partial="/partial" />
              </div>
              <Partial name="foo">
                <p class="init">init</p>
                <SelfCounter />
              </Partial>
            </div>
          </Doc>,
        );
      });

    await withBrowserApp(app, async (page, address) => {
      await retry(async () => {
        await page.goto(address, { waitUntil: "load" });
        await page.locator(".ready").wait();

        await page.locator(".increment").click();
        await waitForText(page, ".output", "1");

        await Promise.all([
          page.waitForNavigation(),
          page.locator(".update").click(),
        ]);
        await page.waitForSelector(".done");

        const url = new URL(page.url!);
        expect(url.pathname).toEqual("/foo");
        await waitForText(page, ".output", "0");
      });
    });
  },
});

Deno.test({
  name: "partials - restore scroll position",
  fn: async () => {
    const app = testApp()
      .get("/partial", (ctx) => {
        return ctx.render(
          <Doc>
            <Partial name="foo">
              <h1 class="partial-content">foo</h1>
            </Partial>
          </Doc>,
        );
      })
      .get("/", (ctx) => {
        return ctx.render(
          <Doc>
            <div f-client-nav>
              <Partial name="foo">
                {new Array(10).fill(0).map((it) => {
                  return <p key={it}>{loremIpsum}</p>;
                })}
                <p class="init">init</p>
              </Partial>
              <p>
                <a
                  class="update"
                  href="/partial"
                >
                  update
                </a>
              </p>
            </div>
          </Doc>,
        );
      });

    await withBrowserApp(app, async (page, address) => {
      await page.goto(address, { waitUntil: "load" });
      await page.evaluate(() => {
        document.querySelector(".update")?.scrollIntoView({
          behavior: "instant",
        });
      });
      await page.locator(".update").click();

      await page.locator(".partial-content").wait();
      await page.evaluate(() => window.history.go(-1));
      await page.locator(".init").wait();
      // deno-lint-ignore no-explicit-any
      const scroll: any = await page.evaluate(() => ({ scrollX, scrollY }));

      expect(scroll.scrollY > 100).toEqual(true);
    });
  },
});

Deno.test({
  name: "partials - submit form",
  fn: async () => {
    const app = testApp()
      .get("/partial", (ctx) => {
        const name = ctx.url.searchParams.get("name")!;
        const submitter = ctx.url.searchParams.get("submitter")!;
        return ctx.render(
          <Doc>
            <Partial name="foo">
              <p class={`done-${name}-${submitter}`}>done</p>
            </Partial>
          </Doc>,
        );
      })
      .get("/", (ctx) => {
        return ctx.render(
          <Doc>
            <div f-client-nav>
              <form action="/partial">
                <input name="name" value="foo" />
                <Partial name="foo">
                  <p class="init">init</p>
                </Partial>
                <SelfCounter />
                <button
                  type="submit"
                  class="update"
                  name="submitter"
                  value="sub"
                >
                  update
                </button>
              </form>
            </div>
          </Doc>,
        );
      });

    await withBrowserApp(app, async (page, address) => {
      await page.goto(address, { waitUntil: "load" });
      await page.locator(".ready").wait();

      await page.locator(".increment").click();
      await waitForText(page, ".output", "1");

      await page.locator(".update").click();
      await page.locator(".done-foo-sub").wait();
    });
  },
});

Deno.test({
  name: "partials - submit form f-partial",
  fn: async () => {
    const app = testApp()
      .get("/partial", (ctx) => {
        const name = ctx.url.searchParams.get("name")!;
        const submitter = ctx.url.searchParams.get("submitter")!;
        return ctx.render(
          <Doc>
            <Partial name="foo">
              <p class={`done-${name}-${submitter}`}>done</p>
            </Partial>
          </Doc>,
        );
      })
      .get("/", (ctx) => {
        return ctx.render(
          <Doc>
            <div f-client-nav>
              <form action="/foo" f-partial="/partial">
                <input name="name" value="foo" />
                <Partial name="foo">
                  <p class="init">init</p>
                </Partial>
                <SelfCounter />
                <button
                  type="submit"
                  class="update"
                  name="submitter"
                  value="sub"
                >
                  update
                </button>
              </form>
            </div>
          </Doc>,
        );
      });

    await withBrowserApp(app, async (page, address) => {
      await page.goto(address, { waitUntil: "load" });
      await page.locator(".ready").wait();

      await page.locator(".increment").click();
      await waitForText(page, ".output", "1");

      await page.locator(".update").click();
      await page.locator(".done-foo-sub").wait();

      const pathname = await page.evaluate(() => window.location.pathname);
      expect(pathname).toEqual("/foo");
    });
  },
});

Deno.test({
  name: "partials - submit form POST",
  fn: async () => {
    const app = testApp()
      .post("/partial", async (ctx) => {
        const data = await ctx.req.formData();
        const name = data.get("name");
        const submitter = data.get("submitter");
        return ctx.render(
          <Doc>
            <Partial name="foo">
              <p class={`done-${name}-${submitter}`}>done</p>
            </Partial>
          </Doc>,
        );
      })
      .get("/", (ctx) => {
        return ctx.render(
          <Doc>
            <div f-client-nav>
              <form action="/partial" method="post">
                <input name="name" value="foo" />
                <Partial name="foo">
                  <p class="init">init</p>
                </Partial>
                <SelfCounter />
                <button
                  type="submit"
                  class="update"
                  name="submitter"
                  value="sub"
                >
                  update
                </button>
              </form>
            </div>
          </Doc>,
        );
      });

    await withBrowserApp(app, async (page, address) => {
      await page.goto(address, { waitUntil: "load" });
      await page.locator(".ready").wait();

      await page.locator(".increment").click();
      await waitForText(page, ".output", "1");

      await page.locator(".update").click();
      await page.locator(".done-foo-sub").wait();
    });
  },
});

Deno.test({
  name: "partials - submit form dialog should do nothing",
  fn: async () => {
    const app = testApp()
      .post("/partial", () => {
        throw new Error("FAIL");
      })
      .get("/", (ctx) => {
        return ctx.render(
          <Doc>
            <div f-client-nav>
              <dialog open>
                <p>Greetings, one and all!</p>
                <form method="dialog">
                  <Partial name="foo">
                    <p class="init">init</p>
                  </Partial>
                  <SelfCounter />
                  <button type="submit" class="update">OK</button>
                </form>
              </dialog>
            </div>
          </Doc>,
        );
      });

    await withBrowserApp(app, async (page, address) => {
      await page.goto(address, { waitUntil: "load" });
      await page.locator(".ready").wait();

      await page.locator(".increment").click();
      await waitForText(page, ".output", "1");

      await page.locator(".update").click();
      await page.locator("dialog:not([open])").wait();
    });
  },
});

Deno.test({
  name: "partials - form without action inside f-client-nav not intercepted",
  fn: async () => {
    const app = testApp()
      .post("/", (ctx) => {
        return ctx.render(
          <Doc>
            <p class="submitted">form submitted normally</p>
          </Doc>,
        );
      })
      .get("/", (ctx) => {
        return ctx.render(
          <Doc>
            <div f-client-nav>
              <form method="post">
                <input name="name" value="foo" />
                <Partial name="foo">
                  <p class="init">init</p>
                </Partial>
                <button type="submit" class="update">
                  update
                </button>
              </form>
            </div>
          </Doc>,
        );
      });

    await withBrowserApp(app, async (page, address) => {
      await page.goto(address, { waitUntil: "load" });
      await page.locator(".init").wait();

      // Form should do a full page navigation, not a partial update
      await Promise.all([
        page.waitForNavigation(),
        page.locator(".update").click(),
      ]);
      await page.locator(".submitted").wait();
    });
  },
});

Deno.test({
  name: "partials - submit form redirect",
  fn: async () => {
    const app = testApp()
      .get("/done", (ctx) => {
        return ctx.render(
          <Doc>
            <Partial name="foo">
              <h1 class="done">success</h1>
            </Partial>
          </Doc>,
        );
      })
      .post("/partial", async (ctx) => {
        const data = await ctx.req.formData();
        const name = String(data.get("name"));

        return new Response(null, {
          status: 303,
          headers: { Location: `/done?name=${encodeURIComponent(name)}` },
        });
      })
      .get("/", (ctx) => {
        return ctx.render(
          <Doc>
            <div f-client-nav>
              <form action="/partial" method="post">
                <input name="name" value="foo" />
                <Partial name="foo">
                  <p class="init">init</p>
                </Partial>
                <SelfCounter />
                <button type="submit" class="update">
                  update
                </button>
              </form>
            </div>
          </Doc>,
        );
      });

    await withBrowserApp(app, async (page, address) => {
      await page.goto(address, { waitUntil: "load" });
      await page.locator(".ready").wait();

      await page.locator(".update").click();
      await page.locator(".done").wait();

      const pathname = await page.evaluate(() => window.location.pathname);
      expect(pathname).toEqual("/done");
    });
  },
});

Deno.test({
  name: "partials - submit form via external submitter",
  fn: async () => {
    const app = testApp()
      .post("/partial", async (ctx) => {
        const data = await ctx.req.formData();
        const name = data.get("name");
        const submitter = data.get("submitter");
        return ctx.render(
          <Doc>
            <Partial name="foo">
              <p class={`done-${name}-${submitter}`}>done</p>
            </Partial>
          </Doc>,
        );
      })
      .get("/", (ctx) => {
        return ctx.render(
          <Doc>
            <div f-client-nav>
              <form action="/foo" id="foo">
                <input name="name" value="foo" />
                <Partial name="foo">
                  <p class="init">init</p>
                </Partial>
                <SelfCounter />
                <button type="button">
                  nothing
                </button>
              </form>
              <button
                type="submit"
                class="update"
                form="foo"
                formaction="/partial"
                formmethod="POST"
                name="submitter"
                value="sub"
              >
                submit
              </button>
            </div>
          </Doc>,
        );
      });

    await withBrowserApp(app, async (page, address) => {
      await page.goto(address, { waitUntil: "load" });
      await page.locator(".ready").wait();

      await page.locator(".increment").click();
      await waitForText(page, ".output", "1");

      await page.locator(".update").click();
      await page.locator(".done-foo-sub").wait();
    });
  },
});

Deno.test({
  name: "partials - submit form via external submitter f-partial",
  fn: async () => {
    const app = testApp()
      .post("/partial", async (ctx) => {
        const data = await ctx.req.formData();
        const name = data.get("name");
        const submitter = data.get("submitter");
        return ctx.render(
          <Doc>
            <Partial name="foo">
              <p class={`done-${name}-${submitter}`}>done</p>
            </Partial>
          </Doc>,
        );
      })
      .get("/", (ctx) => {
        return ctx.render(
          <Doc>
            <div f-client-nav>
              <form action="/foo" id="foo">
                <input name="name" value="foo" />
                <Partial name="foo">
                  <p class="init">init</p>
                </Partial>
                <SelfCounter />
                <button type="button">
                  nothing
                </button>
              </form>
              <button
                type="submit"
                class="update"
                form="foo"
                formaction="/foo"
                formmethod="POST"
                f-partial="/partial"
                name="submitter"
                value="sub"
              >
                submit
              </button>
            </div>
          </Doc>,
        );
      });

    await withBrowserApp(app, async (page, address) => {
      await page.goto(address, { waitUntil: "load" });
      await page.locator(".ready").wait();

      await page.locator(".increment").click();
      await waitForText(page, ".output", "1");

      await page.locator(".update").click();
      await page.locator(".done-foo-sub").wait();
    });
  },
});

Deno.test({
  name:
    "partials - don't apply partials when submitter has client nav disabled",
  fn: async () => {
    const app = testApp()
      .post("/partial", async (ctx) => {
        const data = await ctx.req.formData();
        const name = data.get("name");
        const submitter = data.get("submitter");
        return ctx.render(
          <Doc>
            <Partial name="foo">
              <p class={`done-${name}-${submitter}`}>done</p>
            </Partial>
          </Doc>,
        );
      })
      .get("/", (ctx) => {
        return ctx.render(
          <Doc>
            <div f-client-nav>
              <form action="/foo" id="foo">
                <input name="name" value="foo" />
                <Partial name="foo">
                  <p class="init">init</p>
                </Partial>
                <SelfCounter />
                <button type="button">
                  nothing
                </button>
              </form>
              <button
                f-client-nav={false}
                type="submit"
                class="update"
                form="foo"
                formaction="/partial"
                formmethod="POST"
                f-partial="/partial"
                name="submitter"
                value="sub"
              >
                submit
              </button>
            </div>
          </Doc>,
        );
      });

    await withBrowserApp(app, async (page, address) => {
      await page.goto(address, { waitUntil: "load" });
      await page.locator(".ready").wait();

      await page.locator(".increment").click();
      await waitForText(page, ".output", "1");

      await Promise.all([
        page.waitForNavigation(),
        page.locator(".update").click(),
      ]);
      await page.locator(".done-foo-sub").wait();

      const doc = parseHtml(await page.content());
      assertNotSelector(doc, "button");
    });
  },
});

Deno.test({
  name: "partials - form submit multiple values",
  fn: async () => {
    const app = testApp()
      .get("/partial", (ctx) => {
        const values = ctx.url.searchParams.getAll("name");
        return ctx.render(
          <Doc>
            <Partial name="foo">
              <p class={`done-${values.join("-")}`}>done</p>
            </Partial>
          </Doc>,
        );
      })
      .get("/", (ctx) => {
        return ctx.render(
          <Doc>
            <div f-client-nav>
              <form action="/partial" method="get">
                <input type="checkbox" name="name" value="a" />
                <input type="checkbox" name="name" value="b" />
                <input type="checkbox" name="name" value="c" />
                <Partial name="foo">
                  <p class="init">init</p>
                </Partial>
                <SelfCounter />
                <button type="submit" class="update">
                  submit
                </button>
              </form>
            </div>
          </Doc>,
        );
      });

    await withBrowserApp(app, async (page, address) => {
      await page.goto(address, { waitUntil: "load" });
      await page.locator(".ready").wait();

      await page.locator(".increment").click();
      await waitForText(page, ".output", "1");

      await page.locator<HTMLInputElement>("input[value=a]").evaluate((el) =>
        el.checked = true
      );
      await page.locator<HTMLInputElement>("input[value=b]").evaluate((el) =>
        el.checked = true
      );
      await page.locator<HTMLInputElement>("input[value=c]").evaluate((el) =>
        el.checked = true
      );

      await page.locator(".update").click();
      await page.locator(".done-a-b-c").wait();
    });
  },
});

Deno.test({
  name: "partials - fragment nav should not cause infinite loop",
  fn: async () => {
    const app = testApp()
      .get("/", (ctx) => {
        return ctx.render(
          <Doc>
            <div f-client-nav>
              <h1 id="foo">Same nav</h1>
              <a href="#foo">#foo</a>
            </div>
          </Doc>,
        );
      });

    await withBrowserApp(app, async (page, address) => {
      const logs: string[] = [];
      page.addEventListener("console", (msg) => logs.push(msg.detail.text));

      await page.goto(address, { waitUntil: "load" });

      await page.locator("a").click();
      await page.waitForFunction(() => location.hash === "#foo");
      expect(logs).toEqual([]);
    });
  },
});

Deno.test({
  name: "partials - fragment navigation should not scroll to top",
  fn: async () => {
    const app = testApp()
      .get("/", (ctx) => {
        return ctx.render(
          <Doc>
            <div f-client-nav>
              {new Array(10).fill(0).map((it) => {
                return <p key={it}>{loremIpsum}</p>;
              })}
              <h1 id="foo">Same nav</h1>
              <a href="#foo">#foo</a>
              <Partial name="foo">
                <p class="partial-text">
                  foo partial
                </p>
              </Partial>
            </div>
          </Doc>,
        );
      });

    await withBrowserApp(app, async (page, address) => {
      await page.goto(address, { waitUntil: "load" });

      await page.locator("a").click();
      await page.waitForFunction(() => location.hash === "#foo");
      // deno-lint-ignore no-explicit-any
      const scroll: any = await page.evaluate(() => globalThis.scrollY);
      expect(scroll > 0).toEqual(true);
    });
  },
});

Deno.test({
  name: "partials - throws an error when response contains no partials",
  fn: async () => {
    const app = testApp()
      .get("/partial", (ctx) =>
        ctx.render(
          <Doc>
            <p class="status-append">append content</p>
          </Doc>,
        ))
      .get("/", (ctx) => {
        return ctx.render(
          <Doc>
            <div f-client-nav>
              <Partial name="body">
                <p class="init">
                  init
                </p>
              </Partial>
              <p>
                <button type="button" class="update" f-partial="/partial">
                  update
                </button>
              </p>
            </div>
          </Doc>,
        );
      });

    await withBrowserApp(app, async (page, address) => {
      await page.goto(address, { waitUntil: "load" });
      const logs: string[] = [];
      page.addEventListener("pageerror", (msg) => {
        logs.push(String(msg.detail));
      });

      await page.goto(address, { waitUntil: "load" });
      await page.locator(".update").click();

      await waitFor(() => logs.length > 0);
      expect(logs[0]).toMatch(/Found no partials/);
    });
  },
});

Deno.test({
  name: "partials - merges <head> content",
  fn: async () => {
    const app = testApp()
      .get("/other.css", () =>
        new Response("h1 { color: red }", {
          headers: {
            "Content-Type": "text/css",
          },
        }))
      .get("/partial", (ctx) => {
        return ctx.render(
          <html>
            <head>
              {charset}
              {favicon}
              <title>Head merge updated</title>
              <meta name="foo" content="bar baz" />
              <meta property="og:foo" content="og value foo" />
              <meta property="og:bar" content="og value bar" />
              <link rel="stylesheet" href="/other.css" />
              <style>{`p { color: green }`}</style>
            </head>
            <body f-client-nav>
              <Partial name="body">
                <h1>updated heading</h1>
                <p class="updated">
                  updated
                </p>
              </Partial>
            </body>
          </html>,
        );
      })
      .get("/", (ctx) => {
        return ctx.render(
          <html>
            <head>
              {charset}
              {favicon}
              <title>Head merge</title>
              <meta name="foo" content="bar" />
              <meta property="og:foo" content="og value foo" />
              <style id="style-foo">{`.foo { color: red}`}</style>
            </head>
            <body f-client-nav>
              <Partial name="body">
                <p class="init">
                  init
                </p>
              </Partial>
              <p>
                <button type="button" class="update" f-partial="/partial">
                  update
                </button>
              </p>
            </body>
          </html>,
        );
      });

    await withBrowserApp(app, async (page, address) => {
      await page.goto(address, { waitUntil: "load" });

      await page.locator(".update").click();
      await page.locator(".updated").wait();

      await waitFor(async () => {
        return (await page.evaluate(() => document.title)) ===
          "Head merge updated";
      });

      const doc = parseHtml(await page.content());
      expect(doc.title).toEqual("Head merge updated");

      assertMetaContent(doc, "foo", "bar baz");
      assertMetaContent(doc, "og:foo", "og value foo");
      assertMetaContent(doc, "og:bar", "og value bar");

      await waitFor(async () => {
        const color = await page
          .locator<HTMLHeadingElement>("h1")
          .evaluate((el) => {
            return globalThis.getComputedStyle(el).color;
          });
        expect(color).toEqual("rgb(255, 0, 0)");
        return true;
      });

      await waitFor(async () => {
        const textColor = await page
          .locator<HTMLParagraphElement>("p")
          .evaluate((el) => {
            return globalThis.getComputedStyle(el).color;
          });
        expect(textColor).toEqual("rgb(0, 128, 0)");
        return true;
      });
    });
  },
});

Deno.test({
  name: "partials - does not merge duplicate <head> content",
  fn: async () => {
    const app = testApp()
      .get("/style.css", () =>
        new Response("h1 { color: red }", {
          headers: {
            "Content-Type": "text/css",
          },
        }))
      .get("/partial", (ctx) => {
        return ctx.render(
          <html>
            <head>
              {charset}
              {favicon}
              <title>Head merge duplicated</title>
              <meta name="foo" content="bar" />
              <meta property="og:foo" content="og value foo" />
              <link rel="stylesheet" href="/style.css" />
              <style id="style-foo">{`.foo { color: red}`}</style>
            </head>
            <body f-client-nav>
              <Partial name="body">
                <p class="updated">
                  updated
                </p>
              </Partial>
              <p>
                <button type="button" class="update" f-partial="/partial">
                  update
                </button>
              </p>
            </body>
          </html>,
        );
      })
      .get("/", (ctx) => {
        return ctx.render(
          <html>
            <head>
              {charset}
              {favicon}
              <title>Head merge</title>
              <meta name="foo" content="bar" />
              <meta property="og:foo" content="og value foo" />
              <link rel="stylesheet" href="/style.css" />
              <style id="style-foo">{`.foo { color: red}`}</style>
            </head>
            <body f-client-nav>
              <Partial name="body">
                <p class="init">
                  init
                </p>
              </Partial>
              <p>
                <button type="button" class="update" f-partial="/partial">
                  update
                </button>
              </p>
            </body>
          </html>,
        );
      });

    await withBrowserApp(app, async (page, address) => {
      await page.goto(address, { waitUntil: "load" });
      await page.locator(".update").click();
      await page.locator(".updated").wait();

      await waitFor(async () => {
        return (await page.evaluate(() => document.title)) ===
          "Head merge duplicated";
      });

      const html = await page.content();
      expect(
        Array.from(html.matchAll(/id="style-foo"/g)).length === 1,
      ).toEqual(true);

      expect(
        Array.from(html.matchAll(/style\.css/g)).length === 1,
      ).toEqual(true);
    });
  },
});

Deno.test({
  name: "partials - supports relative links",
  fn: async () => {
    const app = testApp()
      .get("/", (ctx) => {
        const { searchParams } = ctx.url;
        return ctx.render(
          <Doc>
            <div f-client-nav>
              <Partial name="body">
                <p
                  class={searchParams.has("refresh")
                    ? "status-refreshed"
                    : "status-initial"}
                >
                  {searchParams.has("refresh")
                    ? "Refreshed content"
                    : "Initial content"}
                </p>
              </Partial>
              <p>
                <button type="button" f-partial="?refresh">
                  refresh
                </button>
              </p>
            </div>
          </Doc>,
        );
      });

    await withBrowserApp(app, async (page, address) => {
      await page.goto(address, { waitUntil: "load" });
      await page.locator(".status-initial").wait();

      await page.locator("button").click();
      await page.locator(".status-refreshed").wait();
    });
  },
});

Deno.test({
  name: "partials - update stateful inner partials",
  fn: async () => {
    const app = testApp()
      .get("/partial", (ctx) => {
        return ctx.render(
          <Doc>
            <Partial name="inner">
              <p class="done">done</p>
              <SelfCounter id="inner" />
            </Partial>
          </Doc>,
        );
      })
      .get("/", (ctx) => {
        return ctx.render(
          <Doc>
            <div f-client-nav>
              <button type="button" f-partial="/partial" class="update">
                update
              </button>
              <Partial name="outer">
                <SelfCounter id="outer" />
                <Partial name="inner">
                  <p>init</p>
                  <SelfCounter id="inner" />
                </Partial>
              </Partial>
            </div>
          </Doc>,
        );
      });

    await withBrowserApp(app, async (page, address) => {
      await page.goto(address, { waitUntil: "load" });
      await page.locator(".ready").wait();
      await page.locator("#outer .increment").click();
      await page.locator("#outer .increment").click();

      await page.locator("#inner .increment").click();

      await waitForText(page, "#outer .output", "2");
      await waitForText(page, "#inner .output", "1");

      await page.locator(".update").click();
      await page.locator(".done").wait();

      await waitForText(page, "#outer .output", "2");
      await waitForText(page, "#inner .output", "1");
    });
  },
});

Deno.test({
  name: "partials - with redirects",
  fn: async () => {
    const app = testApp()
      .get("/a", (ctx) => {
        return ctx.render(
          <Doc>
            <Partial name="foo">
              <h1 class="done">foo update</h1>
            </Partial>
          </Doc>,
        );
      })
      .get("/partial", (ctx) => ctx.redirect("/a"))
      .get("/", (ctx) => {
        return ctx.render(
          <Doc>
            <div f-client-nav>
              <button type="button" f-partial="/partial" class="update">
                update
              </button>
              <Partial name="foo">
                <h1>foo</h1>
              </Partial>
            </div>
          </Doc>,
        );
      });

    await withBrowserApp(app, async (page, address) => {
      await page.goto(address, { waitUntil: "load" });
      await page.locator("h1").wait();
      await page.locator(".update").click();
      await page.locator(".done").wait();
    });
  },
});

Deno.test({
  name: "partials - render 404 partial",
  fn: async () => {
    const app = testApp()
      .get("/", (ctx) => {
        return ctx.render(
          <Doc>
            <div f-client-nav>
              <button type="button" f-partial="/partial" class="update">
                update
              </button>
              <Partial name="foo">
                <h1>foo</h1>
              </Partial>
            </div>
          </Doc>,
        );
      })
      .get("/*", (ctx) => {
        return ctx.render(
          <Doc>
            <Partial name="foo">
              <h1 class="error-404">404</h1>
            </Partial>
          </Doc>,
        );
      });

    await withBrowserApp(app, async (page, address) => {
      await page.goto(address, { waitUntil: "load" });
      await page.locator("h1").wait();
      await page.locator(".update").click();
      await page.locator(".error-404").wait();
    });
  },
});

Deno.test({
  name: "partials - render with new title",
  fn: async () => {
    const app = testApp()
      .get("/partial", (ctx) => {
        return ctx.render(
          <Doc title="after update">
            <Partial name="foo">
              <h1 class="done">foo update</h1>
            </Partial>
          </Doc>,
        );
      })
      .get("/", (ctx) => {
        return ctx.render(
          <Doc>
            <div f-client-nav>
              <button type="button" f-partial="/partial" class="update">
                update
              </button>
              <Partial name="foo">
                <h1>foo</h1>
              </Partial>
            </div>
          </Doc>,
        );
      });

    await withBrowserApp(app, async (page, address) => {
      await page.goto(address, { waitUntil: "load" });
      await page.locator("h1").wait();
      await page.locator(".update").click();
      await page.locator(".done").wait();

      const title = await page.evaluate(() => document.title);
      expect(title).toEqual("after update");
    });
  },
});

Deno.test({
  name: "partials - button should not update history",
  fn: async () => {
    const app = testApp()
      .get("/other", (ctx) => {
        return ctx.render(
          <Doc>
            <Partial name="foo">
              <h1 class="done">other</h1>
            </Partial>
          </Doc>,
        );
      })
      .get("/", (ctx) => {
        return ctx.render(
          <Doc>
            <div f-client-nav>
              <button type="button" f-partial="/other">click</button>
              <Partial name="foo">
                <h1 class="init">foo</h1>
              </Partial>
              <SelfCounter />
            </div>
          </Doc>,
        );
      });

    await withBrowserApp(app, async (page, address) => {
      await page.goto(address, { waitUntil: "load" });
      await page.locator(".ready").wait();
      await page.locator("button").click();
      await page.locator(".done").wait();

      const rawUrl = await page.evaluate(() => window.location.href);
      const url = new URL(rawUrl);
      expect(`${url.pathname}${url.search}`).toEqual("/");
    });
  },
});

Deno.test({
  name: "partials - backwards navigation should keep URLs",
  fn: async () => {
    const app = testApp()
      .get("/other", (ctx) => {
        return ctx.render(
          <Doc>
            <Partial name="foo">
              <h1 class="done">other</h1>
            </Partial>
            <SelfCounter />
          </Doc>,
        );
      })
      .get("/", (ctx) => {
        return ctx.render(
          <Doc>
            <div f-client-nav>
              <a href="/other">other</a>
              <Partial name="foo">
                <h1 class="init">foo</h1>
              </Partial>
              <SelfCounter />
            </div>
          </Doc>,
        );
      });

    await withBrowserApp(app, async (page, address) => {
      await page.goto(address, { waitUntil: "load" });
      await page.locator(".ready").wait();
      await page.locator("a").click();
      await page.locator(".done").wait();

      await page.evaluate(() => window.history.go(-1));
      await page.locator(".init").wait();
      const rawUrl = await page.evaluate(() => window.location.href);
      const url = new URL(rawUrl);
      expect(`${url.pathname}${url.search}`).toEqual("/");
    });
  },
});

Deno.test({
  name: "partials - independent user popstate",
  fn: async () => {
    const app = testApp()
      .get("/", (ctx) => {
        return ctx.render(
          <Doc>
            <div class="container">
            </div>
          </Doc>,
        );
      });

    await withBrowserApp(app, async (page, address) => {
      await page.goto(address, { waitUntil: "load" });
      await page.locator<HTMLDivElement>(".container").evaluate((el) => {
        const dynamicContent = document.createElement("span");
        dynamicContent.classList.add("dynamic-content");
        el.appendChild(dynamicContent);
      });
      await page.evaluate(() => {
        window.history.replaceState({ custom: true }, "", "#");
        window.history.pushState({ custom: true }, "", "#custom");
      });
      // Fresh partials popstate gets called on back navigation and
      // should exit early/avoid reload due to custom user history entries
      await page.evaluate(() => window.history.go(-1));
      await page.locator(".dynamic-content").wait();
    });
  },
});

Deno.test({
  name: "partials - warns when append/prepend missing key",
  fn: async () => {
    const app = testApp()
      .get("/", (ctx) => {
        return ctx.render(
          <Doc>
            <Partial name="no-key-append" mode="append">
              <p>content</p>
            </Partial>
            <Partial name="no-key-prepend" mode="prepend">
              <p>content</p>
            </Partial>
          </Doc>,
        );
      });

    const warnSpy = spy(console, "warn");
    try {
      const server = new FakeServer(app.handler());
      await server.get("/");
      assertSpyCalls(warnSpy, 2);
      expect(String(warnSpy.calls[0].args[0])).toContain("no-key-append");
      expect(String(warnSpy.calls[0].args[0])).toContain("append");
      expect(String(warnSpy.calls[1].args[0])).toContain("no-key-prepend");
      expect(String(warnSpy.calls[1].args[0])).toContain("prepend");
    } finally {
      warnSpy.restore();
    }
  },
});

Deno.test({
  name: "partials - no warning when append/prepend has key",
  fn: async () => {
    const app = testApp()
      .get("/", (ctx) => {
        return ctx.render(
          <Doc>
            <Partial name="keyed-append" mode="append" key="a">
              <p>content</p>
            </Partial>
            <Partial name="keyed-prepend" mode="prepend" key="b">
              <p>content</p>
            </Partial>
          </Doc>,
        );
      });

    const warnSpy = spy(console, "warn");
    try {
      const server = new FakeServer(app.handler());
      await server.get("/");
      assertSpyCalls(warnSpy, 0);
    } finally {
      warnSpy.restore();
    }
  },
});

Deno.test({
  name: "partials - no warning for replace mode without key",
  fn: async () => {
    const app = testApp()
      .get("/", (ctx) => {
        return ctx.render(
          <Doc>
            <Partial name="replace-no-key" mode="replace">
              <p>content</p>
            </Partial>
            <Partial name="default-no-key">
              <p>content</p>
            </Partial>
          </Doc>,
        );
      });

    const warnSpy = spy(console, "warn");
    try {
      const server = new FakeServer(app.handler());
      await server.get("/");
      assertSpyCalls(warnSpy, 0);
    } finally {
      warnSpy.restore();
    }
  },
});

Deno.test({
  name: "partials - appends data scripts to head",
  fn: async () => {
    const app = testApp()
      .get("/partial", (ctx) => {
        return ctx.render(
          <html>
            <head>
              {charset}
              {favicon}
              <title>Updated</title>
              <script
                type="application/ld+json"
                // deno-lint-ignore react-no-danger
                dangerouslySetInnerHTML={{
                  __html: JSON.stringify({
                    "@type": "Article",
                    name: "Updated",
                  }),
                }}
              />
            </head>
            <body f-client-nav>
              <Partial name="body">
                <p class="updated">updated</p>
              </Partial>
            </body>
          </html>,
        );
      })
      .get("/", (ctx) => {
        return ctx.render(
          <html>
            <head>
              {charset}
              {favicon}
              <title>Init</title>
            </head>
            <body f-client-nav>
              <Partial name="body">
                <p class="init">init</p>
              </Partial>
              <button type="button" class="update" f-partial="/partial">
                update
              </button>
            </body>
          </html>,
        );
      });

    await withBrowserApp(app, async (page, address) => {
      await page.goto(address, { waitUntil: "load" });
      await page.locator(".init").wait();

      await page.locator(".update").click();
      await page.locator(".updated").wait();

      const count = await page.evaluate(
        () =>
          document.head.querySelectorAll('script[type="application/ld+json"]')
            .length,
      );
      expect(count).toEqual(1);

      const content = await page.evaluate(
        () =>
          document.head.querySelector('script[type="application/ld+json"]')
            ?.textContent,
      );
      expect(JSON.parse(content!)).toEqual({
        "@type": "Article",
        name: "Updated",
      });
    });
  },
});

Deno.test({
  name: "partials - does not duplicate data scripts on repeat navigation",
  fn: async () => {
    const app = testApp()
      .get("/partial", (ctx) => {
        return ctx.render(
          <html>
            <head>
              {charset}
              {favicon}
              <title>Updated</title>
              <script
                type="application/ld+json"
                // deno-lint-ignore react-no-danger
                dangerouslySetInnerHTML={{
                  __html: JSON.stringify({
                    "@type": "Article",
                    name: "Same",
                  }),
                }}
              />
            </head>
            <body f-client-nav>
              <Partial name="body">
                <p class="updated">updated</p>
              </Partial>
            </body>
          </html>,
        );
      })
      .get("/", (ctx) => {
        return ctx.render(
          <html>
            <head>
              {charset}
              {favicon}
              <title>Init</title>
            </head>
            <body f-client-nav>
              <Partial name="body">
                <p class="init">init</p>
              </Partial>
              <button type="button" class="update" f-partial="/partial">
                update
              </button>
            </body>
          </html>,
        );
      });

    await withBrowserApp(app, async (page, address) => {
      await page.goto(address, { waitUntil: "load" });
      await page.locator(".init").wait();

      // Click twice to trigger two partial navigations
      await page.locator(".update").click();
      await page.locator(".updated").wait();
      await page.locator(".update").click();
      await page.locator(".updated").wait();

      const count = await page.evaluate(
        () =>
          document.head.querySelectorAll('script[type="application/ld+json"]')
            .length,
      );
      // Should still be 1, not 2
      expect(count).toEqual(1);
    });
  },
});
// View Transitions tests

Deno.test({
  name: "partials - view transitions enabled with f-view-transition",
  fn: async () => {
    const app = testApp()
      .get("/partial", (ctx) => {
        return ctx.render(
          <Doc>
            <Partial name="foo">
              <p class="done">updated</p>
            </Partial>
          </Doc>,
        );
      })
      .get("/", (ctx) => {
        return ctx.render(
          <Doc>
            <div f-client-nav f-view-transition>
              <a href="/partial" class="update">update</a>
              <Partial name="foo">
                <p class="init">init</p>
              </Partial>
            </div>
          </Doc>,
        );
      });

    await withBrowserApp(app, async (page, address) => {
      await page.goto(address, { waitUntil: "load" });
      await page.locator(".init").wait();

      // Track whether startViewTransition was called
      await page.evaluate(() => {
        // deno-lint-ignore no-explicit-any
        (window as any).__vtCalled = false;
        // deno-lint-ignore no-explicit-any
        (document as any).startViewTransition = (fn: () => void) => {
          // deno-lint-ignore no-explicit-any
          (window as any).__vtCalled = true;
          fn();
          return { finished: Promise.resolve() };
        };
      });

      await page.locator(".update").click();
      await waitForText(page, ".done", "updated");

      const vtCalled = await page.evaluate(
        // deno-lint-ignore no-explicit-any
        () => (window as any).__vtCalled,
      );
      expect(vtCalled).toBe(true);
    });
  },
});

Deno.test({
  name: "partials - view transitions not called without f-view-transition",
  fn: async () => {
    const app = testApp()
      .get("/partial", (ctx) => {
        return ctx.render(
          <Doc>
            <Partial name="foo">
              <p class="done">updated</p>
            </Partial>
          </Doc>,
        );
      })
      .get("/", (ctx) => {
        return ctx.render(
          <Doc>
            <div f-client-nav>
              <a href="/partial" class="update">update</a>
              <Partial name="foo">
                <p class="init">init</p>
              </Partial>
            </div>
          </Doc>,
        );
      });

    await withBrowserApp(app, async (page, address) => {
      await page.goto(address, { waitUntil: "load" });
      await page.locator(".init").wait();

      // Install spy - should NOT be called
      await page.evaluate(() => {
        // deno-lint-ignore no-explicit-any
        (window as any).__vtCalled = false;
        // deno-lint-ignore no-explicit-any
        (document as any).startViewTransition = (fn: () => void) => {
          // deno-lint-ignore no-explicit-any
          (window as any).__vtCalled = true;
          fn();
          return { finished: Promise.resolve() };
        };
      });

      await page.locator(".update").click();
      await waitForText(page, ".done", "updated");

      const vtCalled = await page.evaluate(
        // deno-lint-ignore no-explicit-any
        () => (window as any).__vtCalled,
      );
      expect(vtCalled).toBe(false);
    });
  },
});

Deno.test({
  name: "partials - view transitions disabled with f-view-transition=false",
  fn: async () => {
    const app = testApp()
      .get("/partial", (ctx) => {
        return ctx.render(
          <Doc>
            <Partial name="foo">
              <p class="done">updated</p>
            </Partial>
          </Doc>,
        );
      })
      .get("/", (ctx) => {
        return ctx.render(
          <Doc>
            <div f-client-nav f-view-transition="false">
              <a href="/partial" class="update">update</a>
              <Partial name="foo">
                <p class="init">init</p>
              </Partial>
            </div>
          </Doc>,
        );
      });

    await withBrowserApp(app, async (page, address) => {
      await page.goto(address, { waitUntil: "load" });
      await page.locator(".init").wait();

      await page.evaluate(() => {
        // deno-lint-ignore no-explicit-any
        (window as any).__vtCalled = false;
        // deno-lint-ignore no-explicit-any
        (document as any).startViewTransition = (fn: () => void) => {
          // deno-lint-ignore no-explicit-any
          (window as any).__vtCalled = true;
          fn();
          return { finished: Promise.resolve() };
        };
      });

      await page.locator(".update").click();
      await waitForText(page, ".done", "updated");

      const vtCalled = await page.evaluate(
        // deno-lint-ignore no-explicit-any
        () => (window as any).__vtCalled,
      );
      expect(vtCalled).toBe(false);
    });
  },
});

Deno.test({
  name: "partials - view transitions work with popstate navigation",
  fn: async () => {
    const app = testApp()
      .get("/page2", (ctx) => {
        return ctx.render(
          <Doc>
            <Partial name="foo">
              <p class="page2">page 2</p>
            </Partial>
          </Doc>,
        );
      })
      .get("/", (ctx) => {
        return ctx.render(
          <Doc>
            <div f-client-nav f-view-transition>
              <a href="/page2" class="nav">go to page 2</a>
              <Partial name="foo">
                <p class="page1">page 1</p>
              </Partial>
            </div>
          </Doc>,
        );
      });

    await withBrowserApp(app, async (page, address) => {
      await page.goto(address, { waitUntil: "load" });
      await page.locator(".page1").wait();

      // Install spy that counts calls
      await page.evaluate(() => {
        // deno-lint-ignore no-explicit-any
        (window as any).__vtCount = 0;
        // deno-lint-ignore no-explicit-any
        (document as any).startViewTransition = (fn: () => void) => {
          // deno-lint-ignore no-explicit-any
          (window as any).__vtCount++;
          fn();
          return { finished: Promise.resolve() };
        };
      });

      // Navigate forward
      await page.locator(".nav").click();
      await waitForText(page, ".page2", "page 2");

      // Navigate back
      await page.evaluate(() => window.history.go(-1));
      await page.locator(".page1").wait();

      // Both navigations should have used view transitions
      const vtCount = await page.evaluate(
        // deno-lint-ignore no-explicit-any
        () => (window as any).__vtCount,
      );
      expect(vtCount).toBe(2);
    });
  },
});

Deno.test({
  name: "partials - submit form indicator on button",
  fn: async () => {
    const app = testApp()
      .get("/partial", (ctx) => {
        return ctx.render(
          <Doc>
            <Partial name="foo">
              <p class="done">done</p>
            </Partial>
          </Doc>,
        );
      })
      .get("/", (ctx) => {
        return ctx.render(
          <Doc>
            <div f-client-nav>
              <form action="/partial">
                <Partial name="foo">
                  <p class="init">init</p>
                </Partial>
                <button type="submit" class="update">
                  update
                </button>
              </form>
            </div>
          </Doc>,
        );
      });

    await withBrowserApp(app, async (page, address) => {
      await page.goto(address, { waitUntil: "load" });
      await page.locator(".init").wait();

      // Attach a tracking indicator to the submit button
      await page.evaluate(() => {
        const btn = document.querySelector(".update")!;
        const indicator = { _wasTrue: false, _value: false };
        Object.defineProperty(indicator, "value", {
          get() {
            return this._value;
          },
          set(v: boolean) {
            this._value = v;
            if (v) this._wasTrue = true;
          },
        });
        // deno-lint-ignore no-explicit-any
        (btn as any)._freshIndicator = indicator;
        // deno-lint-ignore no-explicit-any
        (window as any).__indicator = indicator;
      });

      await page.locator(".update").click();
      await page.locator(".done").wait();

      const result = await page.evaluate(() => {
        // deno-lint-ignore no-explicit-any
        const ind = (window as any).__indicator;
        return { wasTrue: ind._wasTrue, currentValue: ind.value };
      });
      expect(result.wasTrue).toBe(true);
      expect(result.currentValue).toBe(false);
    });
  },
});

Deno.test({
  name: "partials - submit form indicator on form element",
  fn: async () => {
    const app = testApp()
      .get("/partial", (ctx) => {
        return ctx.render(
          <Doc>
            <Partial name="foo">
              <p class="done">done</p>
            </Partial>
          </Doc>,
        );
      })
      .get("/", (ctx) => {
        return ctx.render(
          <Doc>
            <div f-client-nav>
              <form action="/partial" class="myform">
                <Partial name="foo">
                  <p class="init">init</p>
                </Partial>
                <button type="submit" class="update">
                  update
                </button>
              </form>
            </div>
          </Doc>,
        );
      });

    await withBrowserApp(app, async (page, address) => {
      await page.goto(address, { waitUntil: "load" });
      await page.locator(".init").wait();

      // Attach indicator to the form element (not the button)
      await page.evaluate(() => {
        const form = document.querySelector(".myform")!;
        const indicator = { _wasTrue: false, _value: false };
        Object.defineProperty(indicator, "value", {
          get() {
            return this._value;
          },
          set(v: boolean) {
            this._value = v;
            if (v) this._wasTrue = true;
          },
        });
        // deno-lint-ignore no-explicit-any
        (form as any)._freshIndicator = indicator;
        // deno-lint-ignore no-explicit-any
        (window as any).__indicator = indicator;
      });

      await page.locator(".update").click();
      await page.locator(".done").wait();

      const result = await page.evaluate(() => {
        // deno-lint-ignore no-explicit-any
        const ind = (window as any).__indicator;
        return { wasTrue: ind._wasTrue, currentValue: ind.value };
      });
      expect(result.wasTrue).toBe(true);
      expect(result.currentValue).toBe(false);
    });
  },
});

Deno.test({
  name: "partials - submit form indicator prefers submitter over form",
  fn: async () => {
    const app = testApp()
      .get("/partial", (ctx) => {
        return ctx.render(
          <Doc>
            <Partial name="foo">
              <p class="done">done</p>
            </Partial>
          </Doc>,
        );
      })
      .get("/", (ctx) => {
        return ctx.render(
          <Doc>
            <div f-client-nav>
              <form action="/partial" class="myform">
                <Partial name="foo">
                  <p class="init">init</p>
                </Partial>
                <button type="submit" class="update">
                  update
                </button>
              </form>
            </div>
          </Doc>,
        );
      });

    await withBrowserApp(app, async (page, address) => {
      await page.goto(address, { waitUntil: "load" });
      await page.locator(".init").wait();

      // Attach indicators to both form and button
      await page.evaluate(() => {
        function makeIndicator(name: string) {
          const indicator = { _wasTrue: false, _value: false };
          Object.defineProperty(indicator, "value", {
            get() {
              return this._value;
            },
            set(v: boolean) {
              this._value = v;
              if (v) this._wasTrue = true;
            },
          });
          // deno-lint-ignore no-explicit-any
          (window as any)[name] = indicator;
          return indicator;
        }

        const btn = document.querySelector(".update")!;
        const form = document.querySelector(".myform")!;
        // deno-lint-ignore no-explicit-any
        (btn as any)._freshIndicator = makeIndicator("__btnIndicator");
        // deno-lint-ignore no-explicit-any
        (form as any)._freshIndicator = makeIndicator("__formIndicator");
      });

      await page.locator(".update").click();
      await page.locator(".done").wait();

      const result = await page.evaluate(() => {
        // deno-lint-ignore no-explicit-any
        const w = window as any;
        return {
          btnWasTrue: w.__btnIndicator._wasTrue,
          btnCurrent: w.__btnIndicator.value,
          formWasTrue: w.__formIndicator._wasTrue,
          formCurrent: w.__formIndicator.value,
        };
      });
      // Submitter indicator should have been toggled
      expect(result.btnWasTrue).toBe(true);
      expect(result.btnCurrent).toBe(false);
      // Form indicator should NOT have been used
      expect(result.formWasTrue).toBe(false);
      expect(result.formCurrent).toBe(false);
    });
  },
});

Deno.test({
  name: "partials - redirect does not create back-button trap",
  fn: async () => {
    const app = testApp()
      .get("/target", (ctx) => {
        return ctx.render(
          <Doc>
            <Partial name="foo">
              <h1 class="done">target page</h1>
            </Partial>
          </Doc>,
        );
      })
      .get("/redirect", (ctx) => ctx.redirect("/target"))
      .get("/", (ctx) => {
        return ctx.render(
          <Doc>
            <div f-client-nav>
              <a href="/redirect" class="nav">go</a>
              <Partial name="foo">
                <h1 class="init">home</h1>
              </Partial>
            </div>
          </Doc>,
        );
      });

    await withBrowserApp(app, async (page, address) => {
      await page.goto(address, { waitUntil: "load" });
      await page.locator(".init").wait();

      // Click link that redirects
      await page.locator(".nav").click();
      await page.locator(".done").wait();

      // Should show the redirect target URL, not the intermediate
      await page.waitForFunction(() => {
        return window.location.pathname === "/target";
      });

      // Going back should return to home, not to /redirect
      await page.evaluate(() => window.history.go(-1));
      await page.locator(".init").wait();
      await page.waitForFunction(() => {
        return window.location.pathname === "/";
      });
    });
  },
});

Deno.test({
  name: "partials - redirect does not leak ?fresh-partial in URL",
  fn: async () => {
    const app = testApp()
      .get("/target", (ctx) => {
        return ctx.render(
          <Doc>
            <Partial name="foo">
              <h1 class="done">target page</h1>
            </Partial>
          </Doc>,
        );
      })
      .get("/redirect", (ctx) => ctx.redirect("/target"))
      .get("/", (ctx) => {
        return ctx.render(
          <Doc>
            <div f-client-nav>
              <a href="/redirect" class="nav">go</a>
              <Partial name="foo">
                <h1 class="init">home</h1>
              </Partial>
            </div>
          </Doc>,
        );
      });

    await withBrowserApp(app, async (page, address) => {
      await page.goto(address, { waitUntil: "load" });
      await page.locator(".init").wait();

      await page.locator(".nav").click();
      await page.locator(".done").wait();

      const url = await page.evaluate(() => window.location.href);
      expect(url).not.toContain("fresh-partial");
    });
  },
});
