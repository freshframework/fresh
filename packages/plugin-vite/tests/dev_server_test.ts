import * as path from "@std/path";
import { expect } from "@std/expect";
import {
  waitFor,
  waitForText,
  withBrowser,
} from "../../fresh/tests/test_utils.tsx";
import {
  DEMO_DIR,
  FIXTURE_DIR,
  integrationTest,
  launchDevServer,
  prepareDevServer,
  spawnDevServer,
  updateFile,
  withDevServer,
} from "./test_utils.ts";

const tmp = await prepareDevServer(DEMO_DIR);
const demoServer = await spawnDevServer(tmp.dir, {
  FRESH_PUBLIC_FOO: "foobar",
});

integrationTest("vite dev - launches", async () => {
  const res = await fetch(`${demoServer.address()}/tests/it_works`);
  const text = await res.text();
  expect(text).toContain("it works");
});

integrationTest("vite dev - upgrades WebSocket connections", async () => {
  const address = demoServer.address();
  const wsUrl = address.replace(/^http/, "ws") + "/tests/ws_echo";

  const ws = new WebSocket(wsUrl);
  const reply = await new Promise<string>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error("timed out waiting for echo")),
      5000,
    );
    ws.onopen = () => ws.send("hello");
    ws.onmessage = (e) => {
      clearTimeout(timer);
      resolve(typeof e.data === "string" ? e.data : "");
    };
    ws.onerror = () => {
      clearTimeout(timer);
      reject(new Error("websocket errored"));
    };
  });
  ws.close();
  expect(reply).toBe("echo: hello");
});

integrationTest("vite dev - serves static files", async () => {
  const res = await fetch(`${demoServer.address()}/test_static/foo.txt`);
  const text = await res.text();
  expect(text).toContain("it works");

  const resWithSpace = await fetch(
    `${demoServer.address()}/test%20%2520encodeUri/foo%20%2520encodeUri.txt`,
  );
  const textWithSpace = await resWithSpace.text();
  expect(textWithSpace).toContain("space it works");
});

integrationTest("vite dev - loads islands", async () => {
  await withBrowser(async (page) => {
    await page.goto(`${demoServer.address()}/tests/island_hooks`, {
      waitUntil: "networkidle2",
    });
    await waitForText(page, "button", "count: 0");

    await page.locator("button").click();
    await waitForText(page, "button", "count: 1");
  });
});

integrationTest("vite dev - starts without static/ dir", async () => {
  const fixture = path.join(FIXTURE_DIR, "no_static");
  await withDevServer(fixture, async (address) => {
    const res = await fetch(`${address}/`);
    const text = await res.text();
    expect(text).toContain("ok");
  });
});

integrationTest("vite dev - starts without islands/ dir", async () => {
  const fixture = path.join(FIXTURE_DIR, "no_islands");
  await withDevServer(fixture, async (address) => {
    const res = await fetch(`${address}/`);
    const text = await res.text();
    expect(text).toContain("ok");
  });
});

integrationTest("vite dev - starts without routes/ dir", async () => {
  const fixture = path.join(FIXTURE_DIR, "no_routes");
  await withDevServer(fixture, async (address) => {
    const res = await fetch(`${address}/`);
    const text = await res.text();
    expect(text).toContain("ok");
  });
});

integrationTest({
  name: "vite dev - can apply HMR to islands (hooks)",
  ignore: true, // Test is very flaky
}, async () => {
  await withBrowser(async (page) => {
    await page.goto(`${demoServer.address()}/tests/island_hooks`, {
      waitUntil: "networkidle2",
    });
    await waitForText(page, "button", "count: 0");
    await page.locator("button").click();
    await waitForText(page, "button", "count: 1");

    const island = path.join(
      demoServer.dir,
      "islands",
      "tests",
      "CounterHooks.tsx",
    );
    await using _ = await updateFile(
      island,
      (text) => text.replace("count:", "hmr:"),
    );

    await waitForText(page, "button", "hmr: 1");
    await page.locator("button").click();
    await waitForText(page, "button", "hmr: 2");
  });
});

integrationTest("vite dev - can import json in npm package", async () => {
  await withBrowser(async (page) => {
    await page.goto(`${demoServer.address()}/tests/mime`, {
      waitUntil: "networkidle2",
    });
    await page.locator(".ready").wait();
  });
});

integrationTest("vite dev - inline env vars", async () => {
  await withBrowser(async (page) => {
    await page.goto(`${demoServer.address()}/tests/env`, {
      waitUntil: "networkidle2",
    });
    await page.locator(".ready").wait();

    const res = await page.locator("pre").evaluate((el) =>
      // deno-lint-ignore no-explicit-any
      (el as any).textContent ?? ""
    );

    expect(JSON.parse(res)).toEqual({ deno: "foobar", nodeEnv: "foobar" });
  });
});

integrationTest("vite dev - serves imported assets", async () => {
  // Vite has an internal allowlist that is refreshed when
  // pathnames are requested. It will discover valid static
  // files imported in JS once it encounters them. Therefore
  // we must request the URL that ultimately imports the
  // asset first for it to work.
  let res = await fetch(`${demoServer.address()}/tests/assets`);
  await res.body?.cancel();

  res = await fetch(`${demoServer.address()}/assets/deno-logo.png`);
  expect(res.status).toEqual(200);
  expect(res.headers.get("Content-Type")).toEqual("image/png");
});

integrationTest("vite dev - tailwind no _app", async () => {
  const fixture = path.join(FIXTURE_DIR, "tailwind_no_app");
  await withDevServer(fixture, async (address) => {
    await withBrowser(async (page) => {
      await page.goto(`${address}`, {
        waitUntil: "networkidle2",
      });

      await page.locator("style[vite-module-id]").wait();
    });
  });
});

integrationTest("vite dev - tailwind _app", async () => {
  const fixture = path.join(FIXTURE_DIR, "tailwind_app");
  await withDevServer(fixture, async (address) => {
    await withBrowser(async (page) => {
      await page.goto(`${address}`, {
        waitUntil: "networkidle2",
      });

      await page.locator("style[vite-module-id]").wait();
    });
  });
});

integrationTest("vite dev - partial island", async () => {
  await withBrowser(async (page) => {
    await page.goto(`${demoServer.address()}/tests/partial`, {
      waitUntil: "networkidle2",
    });

    await page.locator(".ready").wait();
    await page.locator("a").click();
    await page.locator(".counter-hooks").wait();

    await page.locator(".counter-hooks button").click();
    await waitForText(page, ".counter-hooks button", "count: 1");
  });
});

integrationTest("vite dev - json from jsr dependency", async () => {
  const res = await fetch(`${demoServer.address()}/tests/dep_json`);
  const json = await res.json();
  expect(json.name).toEqual("@marvinh-test/import-json");
});

integrationTest("vite dev - import node:*", async () => {
  const res = await fetch(`${demoServer.address()}/tests/feed`);
  await res.body?.cancel();
  expect(res.status).toEqual(200);
});

integrationTest("vite dev - css modules", async () => {
  await withBrowser(async (page) => {
    await page.goto(`${demoServer.address()}/tests/css_modules`, {
      waitUntil: "networkidle2",
    });

    await waitFor(async () => {
      let color = await page
        .locator(".red > h1")
        // deno-lint-ignore no-explicit-any
        .evaluate((el) => window.getComputedStyle(el as any).color);
      expect(color).toEqual("rgb(255, 0, 0)");

      color = await page
        .locator(".green > h1")
        // deno-lint-ignore no-explicit-any
        .evaluate((el) => window.getComputedStyle(el as any).color);
      expect(color).toEqual("rgb(0, 128, 0)");

      color = await page
        .locator(".blue > h1")
        // deno-lint-ignore no-explicit-any
        .evaluate((el) => window.getComputedStyle(el as any).color);
      expect(color).toEqual("rgb(0, 0, 255)");

      // Route css
      color = await page
        .locator(".route > h1")
        // deno-lint-ignore no-explicit-any
        .evaluate((el) => window.getComputedStyle(el as any).color);
      expect(color).toEqual("rgb(255, 218, 185)");
      return true;
    });
  });
});

// Issue: https://github.com/denoland/fresh/issues/3633
integrationTest(
  "vite dev - css modules in _app.tsx island are injected",
  async () => {
    await withBrowser(async (page) => {
      await page.goto(`${demoServer.address()}/tests/css_modules`, {
        waitUntil: "networkidle2",
      });

      await waitFor(async () => {
        const bgColor = await page
          .locator(".app-nav")
          // deno-lint-ignore no-explicit-any
          .evaluate((el) => window.getComputedStyle(el as any).backgroundColor);
        expect(bgColor).toEqual("rgb(30, 30, 30)");
        return true;
      });
    });
  },
);

// Issue: https://github.com/denoland/fresh/issues/3633
integrationTest(
  "vite dev - css modules work on second page with shared island",
  async () => {
    await withBrowser(async (page) => {
      // First visit a different page, then visit page2 that shares
      // the CssModules island. In dev mode, the CSS must still work.
      await page.goto(`${demoServer.address()}/`, {
        waitUntil: "networkidle2",
      });
      await page.goto(`${demoServer.address()}/tests/css_modules_page2`, {
        waitUntil: "networkidle2",
      });

      await waitFor(async () => {
        const color = await page
          .locator(".red > h1")
          // deno-lint-ignore no-explicit-any
          .evaluate((el) => window.getComputedStyle(el as any).color);
        expect(color).toEqual("rgb(255, 0, 0)");
        return true;
      });
    });
  },
);

integrationTest("vite dev - route css import", async () => {
  await withBrowser(async (page) => {
    await page.goto(`${demoServer.address()}/tests/css`, {
      waitUntil: "networkidle2",
    });

    await waitFor(async () => {
      const color = await page
        .locator("h1")
        // deno-lint-ignore no-explicit-any
        .evaluate((el) => window.getComputedStyle(el as any).color);
      expect(color).toEqual("rgb(255, 0, 0)");
      return true;
    });
  });
});

integrationTest("vite dev - nested islands", async () => {
  await withBrowser(async (page) => {
    await page.goto(`${demoServer.address()}/tests/island_nested`, {
      waitUntil: "networkidle2",
    });

    await page.locator(".outer-ready").wait();
    await page.locator(".inner-ready").wait();
  });
});

integrationTest("vite dev - remote island", async () => {
  const fixture = path.join(FIXTURE_DIR, "remote_island");
  await launchDevServer(fixture, async (address) => {
    await withBrowser(async (page) => {
      await page.goto(`${address}`, {
        waitUntil: "networkidle2",
      });

      await page.locator(".remote-island").wait();
      await page.locator(".increment").click();
      await waitForText(page, ".result", "Count: 1");
    });
  });
});

integrationTest("vite dev - error on 'node:process' import", async () => {
  const fixture = path.join(FIXTURE_DIR, "node_builtin");

  await launchDevServer(fixture, async (address) => {
    let res = await fetch(`${address}`);
    await res.body?.cancel();

    res = await fetch(`${address}/@id/fresh-island::NodeIsland`);
    await res.body?.cancel();

    expect(res.status).toEqual(500);
  });
});

// issue: https://github.com/denoland/fresh/issues/3322
integrationTest(
  "vite dev - allow routes looking like static paths",
  async () => {
    const res = await fetch(
      `${demoServer.address()}/tests/api/@marvinh@infosec.exchange`,
    );
    const text = await res.text();
    expect(text).toEqual("ok");
  },
);

// issue: https://github.com/denoland/fresh/issues/3323
integrationTest("vite dev - npm:pg", async () => {
  const res = await fetch(`${demoServer.address()}/tests/pg`);
  const text = await res.text();
  expect(text).toContain("<h1>pg</h1>");
});

integrationTest("vite dev - npm:ioredis", async () => {
  const res = await fetch(`${demoServer.address()}/tests/ioredis`);
  const text = await res.text();
  expect(text).toContain("<h1>ioredis</h1>");
});

integrationTest("vite dev - redis", async () => {
  const res = await fetch(`${demoServer.address()}/tests/redis`);
  const text = await res.text();
  expect(text).toContain("<h1>redis</h1>");
});

integrationTest("vite dev - @supabase/postgres-js", async () => {
  const res = await fetch(`${demoServer.address()}/tests/supabase_pg`);
  const text = await res.text();
  expect(text).toContain("<h1>supabase</h1>");
});

integrationTest("vite dev - radix", async () => {
  const res = await fetch(`${demoServer.address()}/tests/radix`);
  const text = await res.text();
  expect(text).toContain("click me</button>");
});

integrationTest("vite dev - qs", async () => {
  const res = await fetch(`${demoServer.address()}/tests/qs`);
  const text = await res.text();
  expect(text).toContain("<h1>qs</h1>");
});

integrationTest("vite dev - stripe", async () => {
  const res = await fetch(`${demoServer.address()}/tests/stripe`);
  const text = await res.text();
  expect(text).toContain("<h1>stripe</h1>");
});

integrationTest("vite dev - static index.html", async () => {
  const res = await fetch(`${demoServer.address()}/test_static/foo`);
  const text = await res.text();
  expect(text).toContain("<h1>ok</h1>");

  const resWithSpace = await fetch(
    `${demoServer.address()}/test%20%2520encodeUri/`,
  );
  const textWithSpace = await resWithSpace.text();
  expect(textWithSpace).toContain("<h1>ok</h1>");
});

integrationTest("vite dev - load .env files", async () => {
  const res = await fetch(`${demoServer.address()}/tests/env_files`);
  const json = await res.json();
  expect(json).toEqual({
    MY_ENV: "MY_ENV test value",
    VITE_MY_ENV: "VITE_MY_ENV test value",
    MY_LOCAL_ENV: "MY_LOCAL_ENV test value",
    VITE_MY_LOCAL_ENV: "VITE_MY_LOCAL_ENV test value",
  });
});

integrationTest("vite dev - support _middleware Array", async () => {
  const res = await fetch(`${demoServer.address()}/tests/middlewares`);
  const text = await res.text();
  expect(text).toEqual("AB");
});

integrationTest("vite dev - support jsx namespace", async () => {
  const res = await fetch(`${demoServer.address()}/tests/jsx_namespace`);
  const text = await res.text();
  expect(text).toContain(`xml:space="preserve"`);
});

// issue: https://github.com/denoland/fresh/issues/3653
Deno.test({
  name: "vite dev - CJS module import",
  fn: async () => {
    const res = await fetch(`${demoServer.address()}/tests/commonjs`);
    const text = await res.text();
    expect(text).toContain("<h1>ok</h1>");
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

Deno.test({
  name: "vite dev - maxmind CJS",
  fn: async () => {
    const res = await fetch(`${demoServer.address()}/tests/maxmind`);
    const text = await res.text();
    expect(text).toContain("<h1>maxmind</h1>");
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

// issue: https://github.com/denoland/fresh/issues/3666
integrationTest(
  "vite dev - basePath does not intercept Vite URLs",
  async () => {
    const fixture = path.join(FIXTURE_DIR, "basepath");
    await launchDevServer(fixture, async (address) => {
      const viteClientRes = await fetch(`${address}/@vite/client`);
      await viteClientRes.body?.cancel();
      expect(viteClientRes.status).toEqual(200);
    });
  },
);

integrationTest("vite dev - source mapped stack traces", async () => {
  const res = await fetch(`${demoServer.address()}/tests/throw`);
  const text = await res.text();
  expect(text).toContain("throw.tsx:5:11");
});

integrationTest("vite dev - client side <Head>", async () => {
  await withBrowser(async (page) => {
    await page.goto(`${demoServer.address()}/tests/head_counter`, {
      waitUntil: "networkidle2",
    });

    await page.locator(".ready").wait();
    await page.locator("button").click();
    await waitForText(page, ".result", "Count: 1");

    await waitFor(async () => {
      const title = await page.evaluate(() => document.title);
      expect(title).toEqual("Count: 1");
      return true;
    });

    await page.goto(`${demoServer.address()}/tests/head_meta`, {
      waitUntil: "networkidle2",
    });

    await page.locator(".ready").wait();

    await waitFor(async () => {
      const custom = await page
        .locator("meta[name='custom']")
        // deno-lint-ignore no-explicit-any
        .evaluate((el: any) => el.content);
      expect(custom).toEqual("ok");

      const custom2 = await page
        .locator("meta[name='custom-new']")
        // deno-lint-ignore no-explicit-any
        .evaluate((el: any) => el.content);
      expect(custom2).toEqual("ok");
      return true;
    });
  });
});
