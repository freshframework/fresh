import { App, staticFiles } from "fresh";
import { Head } from "fresh/runtime";
import {
  buildProd,
  parseHtml,
  waitFor,
  waitForText,
  withBrowserApp,
} from "./test_utils.tsx";
import { expect } from "@std/expect";
import { FakeServer, integrationTest } from "../src/test_utils.ts";
import * as path from "@std/path";

const applyHeadCache = await buildProd({
  root: path.join(import.meta.dirname!, "fixture_head"),
});

Deno.test("Head - ssr - updates title", async () => {
  const handler = new App()
    .appWrapper(({ Component }) => {
      return (
        <html lang="en">
          <head>
            <meta charset="utf-8" />
            <title>not ok</title>
          </head>
          <body>
            <Component />
          </body>
        </html>
      );
    })
    .get("/", (ctx) => {
      return ctx.render(
        <>
          <h1>heading</h1>
          <Head>
            <title>ok</title>
          </Head>
        </>,
      );
    }).handler();

  const server = new FakeServer(handler);
  const res = await server.get("/");

  const doc = parseHtml(await res.text());

  expect(doc.querySelector("title")?.textContent).toEqual("ok");
  expect(doc.querySelector("h1")?.textContent).toEqual("heading");
});

Deno.test("Head - ssr - updates meta", async () => {
  const handler = new App()
    .appWrapper(({ Component }) => {
      return (
        <html lang="en">
          <head>
            <meta charset="utf-8" />
            <title>ok</title>
            <meta name="foo" content="not ok" />
          </head>
          <body>
            <Component />
          </body>
        </html>
      );
    })
    .get("/", (ctx) => {
      return ctx.render(
        <>
          <h1>heading</h1>
          <Head>
            <meta name="foo" content="ok" />
          </Head>
        </>,
      );
    }).handler();

  const server = new FakeServer(handler);
  const res = await server.get("/");
  const doc = parseHtml(await res.text());

  const meta = doc.querySelector("meta[name='foo']") as HTMLMetaElement;
  expect(meta.content).toEqual("ok");
});

Deno.test("Head - ssr - updates style", async () => {
  const handler = new App()
    .appWrapper(({ Component }) => {
      return (
        <html lang="en">
          <head>
            <meta charset="utf-8" />
            <title>ok</title>
            <meta name="foo" content="not ok" />
          </head>
          <body>
            <Component />
          </body>
        </html>
      );
    })
    .get("/", (ctx) => {
      return ctx.render(
        <>
          <h1>heading</h1>
          <Head>
            <style>ok</style>
          </Head>
        </>,
      );
    }).handler();

  const server = new FakeServer(handler);
  const res = await server.get("/");
  const doc = parseHtml(await res.text());

  const meta = doc.querySelector("style") as HTMLStyleElement;
  expect(meta.textContent).toEqual("ok");
});

Deno.test("Head - ssr - merge keyed", async () => {
  const handler = new App()
    .appWrapper(({ Component }) => {
      return (
        <html lang="en">
          <head>
            <meta charset="utf-8" />
            <title>ok</title>
            <style>not ok</style>
            <style key="a">not ok</style>
          </head>
          <body>
            <Component />
          </body>
        </html>
      );
    })
    .get("/", (ctx) => {
      return ctx.render(
        <>
          <h1>heading</h1>
          <Head>
            <style key="a">ok</style>
          </Head>
        </>,
      );
    }).handler();

  const server = new FakeServer(handler);
  const res = await server.get("/");
  const doc = parseHtml(await res.text());

  const last = doc.head.lastChild;
  expect(last?.textContent).toEqual("ok");
});

Deno.test("Head - ssr - stylesheet links with different hrefs coexist", async () => {
  const handler = new App()
    .appWrapper(({ Component }) => {
      return (
        <html lang="en">
          <head>
            <meta charset="utf-8" />
            <link rel="stylesheet" href="/entry.css" />
          </head>
          <body>
            <Component />
          </body>
        </html>
      );
    })
    .get("/", (ctx) => {
      return ctx.render(
        <Head>
          <link rel="stylesheet" href="https://fonts.example.com/font.css" />
        </Head>,
      );
    }).handler();

  const server = new FakeServer(handler);
  const res = await server.get("/");
  const doc = parseHtml(await res.text());

  const hrefs = Array.from(
    doc.querySelectorAll("link[rel='stylesheet']"),
  ).map((el) => (el as HTMLLinkElement).getAttribute("href"));

  expect(hrefs).toContain("/entry.css");
  expect(hrefs).toContain("https://fonts.example.com/font.css");
});

Deno.test("Head - ssr - updates link", async () => {
  const handler = new App()
    .appWrapper(({ Component }) => {
      return (
        <html lang="en">
          <head>
            <meta charset="utf-8" />
            <link rel="canonical" href="https://example.com/not-ok" />
          </head>
          <body>
            <Component />
          </body>
        </html>
      );
    })
    .get("/", (ctx) => {
      return ctx.render(
        <Head>
          <link rel="canonical" href="https://example.com/ok" />
        </Head>,
      );
    }).handler();

  const server = new FakeServer(handler);
  const res = await server.get("/");
  const doc = parseHtml(await res.text());

  const link = doc.querySelector("link[rel='canonical']") as HTMLLinkElement;
  expect(link.href).toEqual("https://example.com/ok");
});

integrationTest("Head - client - set title", async () => {
  const app = new App({})
    .use(staticFiles())
    .fsRoutes();

  applyHeadCache(app);

  await withBrowserApp(app, async (page, address) => {
    await page.goto(`${address}/title`);

    await page.locator(".ready").wait();
    await page.locator("button").click();

    await waitForText(page, "title", "Count: 1");
  });
});

integrationTest("Head - client - match meta", async () => {
  const app = new App({})
    .use(staticFiles())
    .fsRoutes();

  applyHeadCache(app);

  await withBrowserApp(app, async (page, address) => {
    await page.goto(`${address}/meta`);
    await page.locator(".ready").wait();

    await waitFor(async () => {
      const metas = await page.evaluate(() => {
        const metas = Array.from(
          document.querySelectorAll("meta[name]"),
        ) as HTMLMetaElement[];

        return metas.map((
          el: HTMLMetaElement,
        ) => ({ name: el.name, content: el.content }));
      });

      expect(metas).toEqual([
        { name: "foo", content: "ok" },
        { name: "bar", content: "not ok" },
      ]);
      return true;
    });
  });
});

integrationTest("Head - client - match style by id", async () => {
  const app = new App({})
    .use(staticFiles())
    .fsRoutes();

  applyHeadCache(app);

  await withBrowserApp(app, async (page, address) => {
    await page.goto(`${address}/id`);
    await page.locator(".ready").wait();

    await waitFor(async () => {
      const styles = await page.evaluate(() => {
        const els = Array.from(
          document.querySelectorAll("head style"),
        ) as HTMLStyleElement[];

        return els.map((
          el: HTMLStyleElement,
        ) => ({ id: el.id, text: el.textContent }));
      });

      expect(styles).toEqual([
        { id: "", text: "not ok" },
        { id: "style-id", text: "ok" },
      ]);
      return true;
    });
  });
});

integrationTest("Head - client - match key", async () => {
  const app = new App({})
    .use(staticFiles())
    .fsRoutes();

  applyHeadCache(app);

  await withBrowserApp(app, async (page, address) => {
    await page.goto(`${address}/key`);
    await page.locator(".ready").wait();

    await waitFor(async () => {
      const tpls = await page.evaluate(() => {
        const els = Array.from(
          document.querySelectorAll("head template"),
        ) as HTMLTemplateElement[];

        return els.map((
          el: HTMLTemplateElement,
        ) => ({
          key: el.getAttribute("data-key"),
          text: el.content.textContent,
        }));
      });

      expect(tpls).toEqual([
        { key: "a", text: "ok" },
        { key: "b", text: "not ok" },
        { key: null, text: "not ok" },
      ]);
      return true;
    });
  });
});

integrationTest("Head - client - dynamic meta update", async () => {
  const app = new App({})
    .use(staticFiles())
    .fsRoutes();

  applyHeadCache(app);

  await withBrowserApp(app, async (page, address) => {
    await page.goto(`${address}/dynamic_meta`);
    await page.locator(".ready").wait();

    // Verify initial meta value
    await waitFor(async () => {
      const content = await page.evaluate(() => {
        const el = document.querySelector(
          "meta[name='foo']",
        ) as HTMLMetaElement;
        return el?.content;
      });
      expect(content).toEqual("value-0");
      return true;
    });

    // Click to update and verify meta changes reactively
    await page.locator("button").click();

    await waitFor(async () => {
      const content = await page.evaluate(() => {
        const el = document.querySelector(
          "meta[name='foo']",
        ) as HTMLMetaElement;
        return el?.content;
      });
      expect(content).toEqual("value-1");
      return true;
    });
  });
});

integrationTest("Head - client - link element", async () => {
  const app = new App({})
    .use(staticFiles())
    .fsRoutes();

  applyHeadCache(app);

  await withBrowserApp(app, async (page, address) => {
    await page.goto(`${address}/link`);
    await page.locator(".ready").wait();

    await waitFor(async () => {
      const href = await page.evaluate(() => {
        const el = document.querySelector(
          "link[rel='canonical']",
        ) as HTMLLinkElement;
        return el?.href;
      });
      expect(href).toEqual("https://example.com/ok");
      return true;
    });
  });
});

integrationTest("Head - client - multiple islands with Head", async () => {
  const app = new App({})
    .use(staticFiles())
    .fsRoutes();

  applyHeadCache(app);

  await withBrowserApp(app, async (page, address) => {
    await page.goto(`${address}/multi`);
    await page.locator(".ready-a").wait();
    await page.locator(".ready-b").wait();

    await waitFor(async () => {
      const title = await page.evaluate(() => document.title);
      expect(title).toEqual("from island A");
      return true;
    });

    await waitFor(async () => {
      const metas = await page.evaluate(() => {
        return {
          author: (document.querySelector(
            "meta[name='author']",
          ) as HTMLMetaElement)?.content,
          description: (document.querySelector(
            "meta[name='description']",
          ) as HTMLMetaElement)?.content,
        };
      });
      expect(metas.author).toEqual("island-a");
      expect(metas.description).toEqual("from-island-b");
      return true;
    });
  });
});

integrationTest("Head - client - title updates multiple times", async () => {
  const app = new App({})
    .use(staticFiles())
    .fsRoutes();

  applyHeadCache(app);

  await withBrowserApp(app, async (page, address) => {
    await page.goto(`${address}/title`);
    await page.locator(".ready").wait();

    await page.locator("button").click();
    await waitForText(page, "title", "Count: 1");

    await page.locator("button").click();
    await waitForText(page, "title", "Count: 2");

    await page.locator("button").click();
    await waitForText(page, "title", "Count: 3");
  });
});
