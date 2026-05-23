import { expect } from "@std/expect";
import { walk } from "@std/fs/walk";
import {
  waitFor,
  waitForText,
  withBrowser,
} from "../../fresh/tests/test_utils.tsx";
import {
  buildVite,
  DEMO_DIR,
  FIXTURE_DIR,
  integrationTest,
  launchProd,
  usingEnv,
} from "./test_utils.ts";
import * as path from "@std/path";
import { FRESH_CSS_PLACEHOLDER } from "../src/plugins/server_snapshot.ts";

const viteResult = await buildVite(DEMO_DIR);
const NON_ISLAND_CSS_MODULES_FIXTURE = path.join(
  FIXTURE_DIR,
  "non_island_css_modules",
);

integrationTest("vite build - launches", async () => {
  await launchProd(
    { cwd: viteResult.tmp },
    async (address) => {
      const res = await fetch(address);
      const text = await res.text();
      expect(text).toEqual("it works");
    },
  );
});

integrationTest("vite build - creates compiled entry", async () => {
  const stat = await Deno.stat(
    path.join(viteResult.tmp, "_fresh", "compiled-entry.js"),
  );

  expect(stat.isFile).toEqual(true);
});

integrationTest("vite build - serves static files", async () => {
  await launchProd(
    { cwd: viteResult.tmp },
    async (address) => {
      const res = await fetch(`${address}/test_static/foo.txt`);
      const text = await res.text();
      expect(text).toEqual("it works");

      const resWithSpace = await fetch(
        `${address}/test%20%2520encodeUri/foo%20%2520encodeUri.txt`,
      );
      const textWithSpace = await resWithSpace.text();
      expect(textWithSpace).toEqual("space it works");
    },
  );
});

integrationTest("vite build - loads islands", async () => {
  await launchProd(
    { cwd: viteResult.tmp },
    async (address) => {
      await withBrowser(async (page) => {
        await page.goto(`${address}/tests/island_hooks`, {
          waitUntil: "networkidle2",
        });

        await waitForText(page, "button", "count: 0");

        await page.locator("button").click();
        await waitForText(page, "button", "count: 1");
      });
    },
  );
});

integrationTest("vite build - nested islands", async () => {
  await launchProd(
    { cwd: viteResult.tmp },
    async (address) => {
      await withBrowser(async (page) => {
        await page.goto(`${address}/tests/island_nested`, {
          waitUntil: "networkidle2",
        });

        await page.locator(".outer-ready").wait();
        await page.locator(".inner-ready").wait();
      });
    },
  );
});

integrationTest("vite build - without static/ dir", async () => {
  const fixture = path.join(FIXTURE_DIR, "no_static");
  await using res = await buildVite(fixture);

  await launchProd(
    { cwd: res.tmp },
    async (address) => {
      const res = await fetch(`${address}/ok`);
      const text = await res.text();
      expect(text).toEqual("ok");
    },
  );
});

integrationTest("vite build - without islands/ dir", async () => {
  const fixture = path.join(FIXTURE_DIR, "no_islands");
  await using res = await buildVite(fixture);

  await launchProd(
    { cwd: res.tmp },
    async (address) => {
      const res = await fetch(`${address}`);
      const text = await res.text();
      expect(text).toContain("ok");
    },
  );
});

integrationTest("vite build - without routes/ dir", async () => {
  const fixture = path.join(FIXTURE_DIR, "no_routes");
  await using res = await buildVite(fixture);

  await launchProd(
    { cwd: res.tmp },
    async (address) => {
      const res = await fetch(`${address}`);
      const text = await res.text();
      expect(text).toEqual("ok");
    },
  );
});

integrationTest("vite build - load json inside npm package", async () => {
  await launchProd(
    { cwd: viteResult.tmp },
    async (address) => {
      await withBrowser(async (page) => {
        await page.goto(`${address}/tests/mime`, {
          waitUntil: "networkidle2",
        });

        await page.locator(".ready").wait();
      });
    },
  );
});

integrationTest("vite build - fetch static assets", async () => {
  await launchProd(
    { cwd: viteResult.tmp },
    async (address) => {
      await withBrowser(async (page) => {
        await page.goto(`${address}/tests/assets`, {
          waitUntil: "networkidle2",
        });

        const url = await page.locator("img").evaluate((el) =>
          // deno-lint-ignore no-explicit-any
          (el as any).src
        );

        const res = await fetch(url);
        await res.body?.cancel();
        expect(res.status).toEqual(200);
        expect(res.headers.get("Content-Type")).toEqual("image/png");
      });
    },
  );
});

integrationTest("vite build - tailwind no _app", async () => {
  const fixture = path.join(FIXTURE_DIR, "tailwind_no_app");
  await using res = await buildVite(fixture);

  await launchProd(
    { cwd: res.tmp },
    async (address) => {
      await withBrowser(async (page) => {
        await page.goto(`${address}`, {
          waitUntil: "networkidle2",
        });

        const href = await page
          .locator("link[rel='stylesheet']")
          .evaluate((el) => {
            // deno-lint-ignore no-explicit-any
            return (el as any).href;
          });

        expect(href).toMatch(/\/assets\/client-entry-.*\.css(\?.*)?$/);
      });
    },
  );
});

integrationTest("vite build - tailwind _app", async () => {
  const fixture = path.join(FIXTURE_DIR, "tailwind_app");
  await using res = await buildVite(fixture);

  await launchProd(
    { cwd: res.tmp },
    async (address) => {
      await withBrowser(async (page) => {
        await page.goto(`${address}`, {
          waitUntil: "networkidle2",
        });

        const href = await page
          .locator("link[rel='stylesheet']")
          .evaluate((el) => {
            // deno-lint-ignore no-explicit-any
            return (el as any).href;
          });

        expect(href).toMatch(/\/assets\/client-entry-.*\.css/);
      });
    },
  );
});

integrationTest("vite build - partial island", async () => {
  await launchProd(
    { cwd: viteResult.tmp },
    async (address) => {
      await withBrowser(async (page) => {
        await page.goto(`${address}/tests/partial`, {
          waitUntil: "networkidle2",
        });

        await page.locator(".ready").wait();
        await page.locator("a").click();
        await page.locator(".counter-hooks").wait();

        await page.locator(".counter-hooks button").click();
        await waitForText(page, ".counter-hooks button", "count: 1");
      });
    },
  );
});

integrationTest(
  "vite build - build ID uses env variables when set",
  async () => {
    const revision = "test-commit-hash-123";

    // We're running on GitHub Actions, so GITHUB_SHA will always
    // be set
    Deno.env.delete("GITHUB_SHA");

    for (
      const key of [
        "DENO_DEPLOYMENT_ID",
        "GITHUB_SHA",
        "CI_COMMIT_SHA",
        "OTHER",
      ]
    ) {
      using _ = usingEnv(key, revision);
      await using res = await buildVite(DEMO_DIR);

      await launchProd(
        { cwd: res.tmp },
        async (address) => {
          const res = await fetch(`${address}/tests/build_id`);
          const text = await res.text();

          if (key === "OTHER") {
            expect(text).not.toEqual(revision);
          } else {
            expect(text).toEqual(revision);
          }
        },
      );
    }
  },
);

integrationTest(
  "vite build - import json from jsr dependency",
  async () => {
    await launchProd(
      { cwd: viteResult.tmp },
      async (address) => {
        const res = await fetch(`${address}/tests/dep_json`);
        const json = await res.json();
        expect(json.name).toEqual("@marvinh-test/import-json");
      },
    );
  },
);

integrationTest("vite build - import node:*", async () => {
  await launchProd(
    { cwd: viteResult.tmp },
    async (address) => {
      const res = await fetch(`${address}/tests/feed`);
      await res.body?.cancel();
      expect(res.status).toEqual(200);
    },
  );
});

integrationTest("vite build - css modules", async () => {
  await launchProd(
    { cwd: viteResult.tmp },
    async (address) => {
      await withBrowser(async (page) => {
        await page.goto(`${address}/tests/css_modules`, {
          waitUntil: "networkidle2",
        });

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
      });
    },
  );
});

// Issue: https://github.com/denoland/fresh/issues/3633
integrationTest(
  "vite build - css modules in _app.tsx island are injected",
  async () => {
    await launchProd(
      { cwd: viteResult.tmp },
      async (address) => {
        await withBrowser(async (page) => {
          await page.goto(`${address}/tests/css_modules`, {
            waitUntil: "networkidle2",
          });

          // The AppNav island is in _app.tsx and uses a CSS module.
          // Its styles should be injected even though the island
          // is discovered after <head> renders.
          const bgColor = await page
            .locator(".app-nav")
            .evaluate((el) =>
              window.getComputedStyle(el as Element).backgroundColor
            );
          expect(bgColor).toEqual("rgb(30, 30, 30)");
        });
      },
    );
  },
);

// Issue: https://github.com/denoland/fresh/issues/3633
integrationTest(
  "vite build - css modules work on second page with shared island",
  async () => {
    await launchProd(
      { cwd: viteResult.tmp },
      async (address) => {
        await withBrowser(async (page) => {
          // Access the second page that shares the CssModules island
          await page.goto(`${address}/tests/css_modules_page2`, {
            waitUntil: "networkidle2",
          });

          // The shared CssModules island's CSS should work here too
          const color = await page
            .locator(".red > h1")
            // deno-lint-ignore no-explicit-any
            .evaluate((el) => window.getComputedStyle(el as any).color);
          expect(color).toEqual("rgb(255, 0, 0)");
        });
      },
    );
  },
);

integrationTest(
  "vite build - css modules in _app/_layout/_error non-island component are injected",
  async () => {
    await using res = await buildVite(NON_ISLAND_CSS_MODULES_FIXTURE);

    await launchProd(
      { cwd: res.tmp },
      async (address) => {
        await withBrowser(async (page) => {
          {
            // check _app/_layout
            await page.goto(`${address}`, {
              waitUntil: "networkidle2",
            });

            const _app = await page
              .locator<HTMLHeadingElement>(".green > h1")
              .evaluate((el) => window.getComputedStyle(el).color);
            expect(_app).toEqual("rgb(0, 128, 0)");

            const _layout = await page
              .locator<HTMLHeadingElement>(".red > h1")
              .evaluate((el) => window.getComputedStyle(el).color);
            expect(_layout).toEqual("rgb(255, 0, 0)");
          }

          {
            // check _app/_layout/_error
            await page.goto(`${address}/boom`, {
              waitUntil: "networkidle2",
            });

            const _app = await page
              .locator<HTMLHeadingElement>(".green > h1")
              .evaluate((el) => window.getComputedStyle(el).color);
            expect(_app).toEqual("rgb(0, 128, 0)");

            const _layout = await page
              .locator<HTMLHeadingElement>(".red > h1")
              .evaluate((el) => window.getComputedStyle(el).color);
            expect(_layout).toEqual("rgb(255, 0, 0)");

            const _error = await page
              .locator<HTMLHeadingElement>(".blue > h1")
              .evaluate((el) => window.getComputedStyle(el).color);
            expect(_error).toEqual("rgb(0, 0, 255)");
          }

          {
            // check _app/_layout/_404
            await page.goto(`${address}/non_existent`, {
              waitUntil: "networkidle2",
            });

            const _app = await page
              .locator<HTMLHeadingElement>(".green > h1")
              .evaluate((el) => window.getComputedStyle(el).color);
            expect(_app).toEqual("rgb(0, 128, 0)");

            const _layout = await page
              .locator<HTMLHeadingElement>(".red > h1")
              .evaluate((el) => window.getComputedStyle(el).color);
            expect(_layout).toEqual("rgb(255, 0, 0)");

            const _404 = await page
              .locator<HTMLHeadingElement>(".orange > h1")
              .evaluate((el) => window.getComputedStyle(el).color);
            expect(_404).toEqual("rgb(255, 165, 0)");
          }
        });
      },
    );
  },
);

integrationTest("vite build - route css import", async () => {
  await launchProd(
    { cwd: viteResult.tmp },
    async (address) => {
      await withBrowser(async (page) => {
        await page.goto(`${address}/tests/css`, {
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
    },
  );
});

integrationTest(
  "vite build - __FRESH_CSS_PLACEHOLDER__ has been replaced in all server chunks",
  async () => {
    await using res = await buildVite(NON_ISLAND_CSS_MODULES_FIXTURE, {
      base: "/my-app/",
    });

    const serverDir = path.join(res.tmp, "_fresh", "server");
    const inspected: string[] = [];
    for await (
      const entry of walk(serverDir, {
        exts: [".mjs"],
        includeDirs: false,
      })
    ) {
      const content = await Deno.readTextFile(entry.path);
      inspected.push(path.relative(serverDir, entry.path));
      expect(content).not.toContain(FRESH_CSS_PLACEHOLDER);
    }

    expect(inspected.length).toBeGreaterThan(0);
  },
);

integrationTest(
  "vite build - shared server chunk keeps utility css references after replacement",
  async () => {
    await using res = await buildVite(NON_ISLAND_CSS_MODULES_FIXTURE);

    const serverEntryJs = await Deno.readTextFile(
      path.join(res.tmp, "_fresh", "server", "server-entry.mjs"),
    );

    const cssRefs = serverEntryJs.match(/"\/assets\/server-entry-.*?\.css"/g) ??
      [];
    expect(cssRefs.length).toBeGreaterThanOrEqual(4);
  },
);

integrationTest("vite build - remote island", async () => {
  const fixture = path.join(FIXTURE_DIR, "remote_island");
  await using res = await buildVite(fixture);

  await launchProd(
    { cwd: res.tmp },
    async (address) => {
      await withBrowser(async (page) => {
        await page.goto(`${address}`, {
          waitUntil: "networkidle2",
        });

        await page.locator(".remote-island").wait();
        await page.locator(".increment").click();
        await waitForText(page, ".result", "Count: 1");
      });
    },
  );
});

integrationTest(
  "vite build - error on 'node:process' import",
  async () => {
    const fixture = path.join(FIXTURE_DIR, "node_builtin");

    await expect(buildVite(fixture)).rejects.toThrow(
      "Node built-in modules cannot be imported in the browser",
    );
  },
);

integrationTest("vite build - static index.html", async () => {
  await launchProd(
    { cwd: viteResult.tmp },
    async (address) => {
      const res = await fetch(`${address}/test_static/foo`);
      const text = await res.text();
      expect(text).toContain("<h1>ok</h1>");

      const resWithSpace = await fetch(`${address}/test%20%2520encodeUri`);
      const textWithSpace = await resWithSpace.text();
      expect(textWithSpace).toContain("<h1>ok</h1>");
    },
  );
});

integrationTest("vite build - base path asset handling", async () => {
  await using res = await buildVite(DEMO_DIR, { base: "/my-app/" });

  // Read the generated server.js to check asset paths
  const serverJs = await Deno.readTextFile(
    path.join(res.tmp, "_fresh", "server.js"),
  );

  // Asset paths should include the base path /my-app/
  expect(serverJs).toContain('"/my-app/assets/');
});

integrationTest(
  "vite build - custom rollup entryFileNames in server.js",
  async () => {
    await using res = await buildVite(DEMO_DIR, {
      rollupOutput: {
        entryFileNames: "[hash].mjs",
        chunkFileNames: "[hash].mjs",
      },
    });

    const serverJs = await Deno.readTextFile(
      path.join(res.tmp, "_fresh", "server.js"),
    );

    // When custom entryFileNames is set, server.js should use the actual
    // hashed filename from the manifest, not hardcoded "server-entry.mjs"
    expect(serverJs).not.toContain("server-entry.mjs");
    expect(serverJs).toMatch(
      /from "\.\/server\/[a-zA-Z0-9_-]+\.mjs"/,
    );
  },
);

integrationTest("vite build - env files", async () => {
  await launchProd(
    { cwd: viteResult.tmp },
    async (address) => {
      const res = await fetch(`${address}/tests/env_files`);
      const json = await res.json();
      expect(json).toEqual({
        MY_ENV: "MY_ENV test value",
        VITE_MY_ENV: "VITE_MY_ENV test value",
        MY_LOCAL_ENV: "MY_LOCAL_ENV test value",
        VITE_MY_LOCAL_ENV: "VITE_MY_LOCAL_ENV test value",
      });
    },
  );
});

integrationTest("vite build - support _middleware Array", async () => {
  await launchProd(
    { cwd: viteResult.tmp },
    async (address) => {
      const res = await fetch(`${address}/tests/middlewares`);
      const text = await res.text();
      expect(text).toEqual("AB");
    },
  );
});

integrationTest(
  "vite build - island named after global object (Map)",
  async () => {
    const fixture = path.join(FIXTURE_DIR, "island_global_name");
    await using res = await buildVite(fixture);

    await launchProd(
      { cwd: res.tmp },
      async (address) => {
        const response = await fetch(address);
        const html = await response.text();

        // Verify the fix: UniqueNamer prefixes "Map" with underscore to prevent shadowing
        // Without the fix: import Map from "..." and boot({Map}, ...) - shadows global Map
        // With the fix: import _Map_N from "..." and boot({_Map_N}, ...) - no shadowing
        expect(html).toMatch(/import.*_Map(_\d+)?.*from/);
        expect(html).toMatch(/boot\(\s*\{\s*_Map(_\d+)?\s*\}/);
      },
    );
  },
);

integrationTest(
  "vite build - excludes test files from routes",
  async () => {
    const fixture = path.join(FIXTURE_DIR, "test_files_exclusion");
    await using res = await buildVite(fixture);

    // Verify that test files in routes/ are not bundled
    const serverAssetsDir = path.join(
      res.tmp,
      "_fresh",
      "server",
      "assets",
    );

    // List all compiled route files
    const files: string[] = [];
    for await (const entry of Deno.readDir(serverAssetsDir)) {
      if (entry.isFile && entry.name.startsWith("_fresh-route")) {
        files.push(entry.name);
      }
    }

    // Should have index route but NOT test files
    expect(files.some((f) => f.includes("_fresh-route___index"))).toBe(true);
    expect(files.some((f) => f.includes("index_test"))).toBe(false);
    expect(files.some((f) => f.includes("foo.test"))).toBe(false);

    // Verify no test pattern files at all
    // Note: files with "_test" or ".test" in their name (not just a "tests" folder)
    const testPatterns = ["_test.", "_test-", ".test."];
    for (const file of files) {
      for (const pattern of testPatterns) {
        expect(file.includes(pattern)).toBe(false);
      }
    }
  },
);

integrationTest("vite build - client side <Head>", async () => {
  await launchProd(
    { cwd: viteResult.tmp },
    async (address) => {
      await withBrowser(async (page) => {
        await page.goto(`${address}/tests/head_counter`, {
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
      });
    },
  );
});

integrationTest(
  "vite build - vite-plugin-pwa generates service worker",
  async () => {
    const fixture = path.join(FIXTURE_DIR, "vite_plugin_pwa");
    await using res = await buildVite(fixture);

    // Verify that vite-plugin-pwa generated the expected files in _fresh/client
    const swPath = path.join(res.tmp, "_fresh", "client", "sw.js");
    const manifestPath = path.join(
      res.tmp,
      "_fresh",
      "client",
      "manifest.webmanifest",
    );

    // Check that files were generated
    const swStat = await Deno.stat(swPath);
    expect(swStat.isFile).toEqual(true);

    const manifestStat = await Deno.stat(manifestPath);
    expect(manifestStat.isFile).toEqual(true);
  },
);

integrationTest(
  "vite build - vite-plugin-pwa files are accessible via HTTP",
  async () => {
    const fixture = path.join(FIXTURE_DIR, "vite_plugin_pwa");
    await using res = await buildVite(fixture);

    await launchProd(
      { cwd: res.tmp },
      async (address) => {
        // Test that service worker is accessible
        const swRes = await fetch(`${address}/sw.js`);
        expect(swRes.status).toEqual(200);
        expect(swRes.headers.get("content-type")).toMatch(/javascript/);

        const swContent = await swRes.text();
        expect(swContent.length).toBeGreaterThan(0);

        // Test that manifest is accessible
        const manifestRes = await fetch(`${address}/manifest.webmanifest`);
        expect(manifestRes.status).toEqual(200);
        expect(manifestRes.headers.get("content-type")).toMatch(/json/);

        const manifestContent = await manifestRes.json();
        expect(manifestContent.name).toEqual("Fresh PWA Test");

        // Test that registerSW.js is accessible
        const registerRes = await fetch(`${address}/registerSW.js`);
        expect(registerRes.status).toEqual(200);
        expect(registerRes.headers.get("content-type")).toMatch(/javascript/);
      },
    );
  },
);

integrationTest(
  "vite build - asset cache headers on CSS and JS",
  async () => {
    await launchProd(
      { cwd: viteResult.tmp },
      async (address) => {
        // Fetch a page with islands to get CSS and JS asset URLs
        const res = await fetch(`${address}/tests/island_hooks`);
        const html = await res.text();

        // CSS link tags should get immutable cache headers
        const cssMatches = html.matchAll(
          /href="(\/assets\/[^"]*\.css[^"]*)"/g,
        );
        for (const match of cssMatches) {
          const href = match[1];
          const cssRes = await fetch(`${address}${href}`);
          await cssRes.body?.cancel();
          expect(cssRes.status).toEqual(200);
          expect(cssRes.headers.get("Cache-Control")).toEqual(
            "public, max-age=31536000, immutable",
          );
        }

        // JS module imports should get immutable cache headers
        const scriptMatch = html.match(
          /<script[^>]*type="module"[^>]*>([\s\S]*?)<\/script>/,
        );
        expect(scriptMatch).not.toBeNull();
        const scriptContent = scriptMatch![1];

        const importMatches = scriptContent.matchAll(
          /from "([^"]+)"/g,
        );
        for (const match of importMatches) {
          const url = match[1];
          if (url.startsWith("/assets/") || url.includes("/assets/")) {
            const jsRes = await fetch(`${address}${url}`);
            await jsRes.body?.cancel();
            expect(jsRes.status).toEqual(200);
            expect(jsRes.headers.get("Cache-Control")).toEqual(
              "public, max-age=31536000, immutable",
            );
          }
        }
      },
    );
  },
);
