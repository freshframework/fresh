import { expect } from "@std/expect";
import {
  CONFIRM_TAILWIND_MESSAGE,
  CONFIRM_VITE_MESSAGE,
  CONFIRM_VSCODE_MESSAGE,
  HELP_TEXT,
  InitError,
  initProject,
} from "./init.ts";
import * as path from "@std/path";
import { getStdOutput, withBrowser } from "../../fresh/tests/test_utils.tsx";
import { waitForText } from "../../fresh/tests/test_utils.tsx";
import { withChildProcessServer } from "../../fresh/tests/test_utils.tsx";
import { withTmpDir as withTmpDirBase } from "../../fresh/src/test_utils.ts";
import { stub } from "@std/testing/mock";

// deno-lint-ignore no-explicit-any
(globalThis as any).INIT_TEST = true;

const testInitProject: typeof initProject = async (cwd, input, flags = {}) => {
  return await initProject(cwd, input, { ...flags, skipInstall: true });
};

function stubPrompt(result: string) {
  return stub(globalThis, "prompt", () => result);
}

function stubConfirm(steps: Record<string, boolean> = {}) {
  return stub(
    globalThis,
    "confirm",
    (message) => message ? steps[message] : false,
  );
}

function stubLogs() {
  return stub(
    console,
    "log",
    () => undefined,
  );
}

function withTmpDir(): Promise<{ dir: string } & AsyncDisposable> {
  // Windows need temporary files in the repository root
  if (Deno.build.os === "windows") {
    const dir = path.join(import.meta.dirname!, "..", "..", "..", "..");
    return withTmpDirBase({ dir, prefix: "tmp_" });
  }
  return withTmpDirBase();
}

async function patchProject(dir: string): Promise<void> {
  const jsonPath = path.join(dir, "deno.json");
  const json = JSON.parse(await Deno.readTextFile(jsonPath));

  const linkedDir = path.join(dir, "_linked");
  try {
    await Deno.mkdir(linkedDir, { recursive: true });
  } catch (err) {
    if (!(err instanceof Deno.errors.AlreadyExists)) {
      throw err;
    }
  }

  const ignore = (entry: Deno.DirEntry, _full: string) => {
    return /^(\.|tmp_)/.test(entry.name) ||
      /_test\.[tj]sx?$/.test(entry.name) ||
      entry.name === "tests" || entry.name === "test";
  };

  await copyRecursive(
    path.join(import.meta.dirname!, "..", "..", "fresh"),
    path.join(linkedDir, "fresh"),
    ignore,
  );

  await copyRecursive(
    path.join(import.meta.dirname!, "..", "..", "build-id"),
    path.join(linkedDir, "build-id"),
    ignore,
  );

  json.workspace = ["./_linked/*"];
  json.exclude = [...json.exclude ?? [], "**/_linked/*"];

  // assert with this stricter rule, before adding it to initialized projects
  json.lint.rules.include = ["verbatim-module-syntax"];

  await Deno.writeTextFile(jsonPath, JSON.stringify(json, null, 2) + "\n");
  const installProc = await new Deno.Command(Deno.execPath(), {
    cwd: dir,
    args: ["install"],
  }).output();

  if (installProc.code !== 0) {
    const { stderr, stdout } = getStdOutput(installProc);
    // deno-lint-ignore no-console
    console.log(stderr);
    // deno-lint-ignore no-console
    console.log(stdout);
  }

  expect(installProc.code).toEqual(0);
}

async function copyRecursive(
  from: string,
  to: string,
  ignore?: (entry: Deno.DirEntry, full: string) => boolean,
): Promise<void> {
  for await (const entry of Deno.readDir(from)) {
    const source = path.join(from, entry.name);
    const target = path.join(to, entry.name);

    if (ignore && ignore(entry, source)) {
      continue;
    }

    if (entry.isFile) {
      try {
        await Deno.mkdir(to, { recursive: true });
      } catch (err) {
        if (!(err instanceof Deno.errors.AlreadyExists)) {
          throw err;
        }
      }
      await Deno.copyFile(source, target);
    } else if (entry.isDirectory) {
      await copyRecursive(source, target, ignore);
    }
  }
}

async function expectProjectFile(dir: string, pathname: string) {
  const filePath = path.join(dir, ...pathname.split("/").filter(Boolean));
  const stat = await Deno.stat(filePath);
  if (!stat.isFile) {
    throw new Error(`Not a project file: ${filePath}`);
  }
}

async function expectNotProjectFile(dir: string, pathname: string) {
  const filePath = path.join(dir, ...pathname.split("/").filter(Boolean));
  try {
    const stat = await Deno.stat(filePath);
    if (stat.isFile) {
      throw new Error(`A project file but expected it not to be: ${filePath}`);
    }
  } catch (err) {
    if (!(err instanceof Deno.errors.NotFound)) {
      throw err;
    }
  }
}

async function readProjectFile(dir: string, pathname: string): Promise<string> {
  const filePath = path.join(dir, ...pathname.split("/").filter(Boolean));
  const content = await Deno.readTextFile(filePath);
  return content;
}

Deno.test("init - show help", async () => {
  using logs = stubLogs();

  await testInitProject("", [], { help: true });
  const args = logs.calls.flatMap((c) => c.args);
  const out = args.join("\n");
  await testInitProject("", [], { h: true });

  expect(out).toBe(HELP_TEXT);
  expect(args).toEqual(logs.calls.flatMap((c) => c.args).slice(args.length));
});

Deno.test("init - new project", async () => {
  await using tmp = await withTmpDir();
  using _promptStub = stubPrompt("fresh-init");
  using _confirmStub = stubConfirm();

  await testInitProject(tmp.dir, [], { builder: true });
});

Deno.test("init - create project dir", async () => {
  await using tmp = await withTmpDir();
  const dir = tmp.dir;
  using _promptStub = stubPrompt("fresh-init");
  using _confirmStub = stubConfirm();
  await testInitProject(dir, [], { builder: true });

  const root = path.join(dir, "fresh-init");
  await expectProjectFile(root, "deno.json");
  await expectProjectFile(root, "main.ts");
  await expectProjectFile(root, "dev.ts");
  await expectProjectFile(root, ".gitignore");
  await expectProjectFile(root, "static/styles.css");
});

Deno.test("init - create project dir with 'src'", async () => {
  await using tmp = await withTmpDir();
  const dir = tmp.dir;
  using _promptStub = stubPrompt(".");
  using _confirmStub = stubConfirm();
  await initProject(dir, [], { "src-dir": "" });

  const src = path.join(dir, "src");
  await expectProjectFile(dir, ".gitignore");
  await expectProjectFile(dir, "deno.json");
  await expectProjectFile(dir, "vite.config.ts");
  await expectProjectFile(src, "main.ts");
  await expectProjectFile(src, "client.ts");
  await expectProjectFile(src, "routes/index.tsx");
  await expectProjectFile(src, "assets/styles.css");
  await expectProjectFile(src, "static/logo.svg");
});

Deno.test("init - create project dir with custom source dir", async () => {
  await using tmp = await withTmpDir();
  const dir = tmp.dir;
  using _promptStub = stubPrompt(".");
  using _confirmStub = stubConfirm();
  await initProject(dir, [], { "src-dir": "packages/fresh" });

  const src = path.join(dir, "packages", "fresh");
  await expectProjectFile(dir, "deno.json");
  await expectProjectFile(src, "main.ts");
});

Deno.test("init - fail with src dir and builder", async () => {
  await using tmp = await withTmpDir();
  const dir = tmp.dir;

  const promise = initProject(dir, ["."], { "src-dir": "", builder: true });
  await expect(promise).rejects.toBeInstanceOf(InitError);
});

Deno.test("init - with tailwind", async () => {
  await using tmp = await withTmpDir();
  const dir = tmp.dir;
  using _promptStub = stubPrompt(".");
  using _confirmStub = stubConfirm({
    [CONFIRM_TAILWIND_MESSAGE]: true,
  });
  await testInitProject(dir, [], { builder: true });

  const css = await readProjectFile(dir, "static/styles.css");
  expect(css).toMatch(/@import "tailwindcss"/);

  const main = await readProjectFile(dir, "main.ts");
  const dev = await readProjectFile(dir, "dev.ts");
  expect(main).not.toMatch(/tailwind/);
  expect(dev).toMatch(/tailwind/);
});

Deno.test("init - with vscode", async () => {
  await using tmp = await withTmpDir();
  const dir = tmp.dir;
  using _promptStub = stubPrompt(".");
  using _confirmStub = stubConfirm({
    [CONFIRM_VSCODE_MESSAGE]: true,
  });
  await testInitProject(dir, [], { builder: true });

  await expectProjectFile(dir, ".vscode/settings.json");
  await expectProjectFile(dir, ".vscode/extensions.json");
});

Deno.test({
  name: "init - fmt, lint, and type check project",
  // Ignore this test on canary due to different formatting
  // behaviours when the formatter changes.
  ignore: Deno.version.deno.includes("+"),
  fn: async () => {
    await using tmp = await withTmpDir();
    const dir = tmp.dir;
    using _promptStub = stubPrompt(".");
    using _confirmStub = stubConfirm();
    await testInitProject(dir, [], { builder: true });
    await expectProjectFile(dir, "main.ts");
    await expectProjectFile(dir, "dev.ts");

    await patchProject(dir);

    const check = await new Deno.Command(Deno.execPath(), {
      args: ["task", "check"],
      cwd: dir,
      stderr: "inherit",
      stdout: "inherit",
    }).output();
    expect(check.code).toEqual(0);
  },
});

Deno.test(
  "init with tailwind - fmt, lint, and type check project",
  async () => {
    await using tmp = await withTmpDir();
    const dir = tmp.dir;
    using _promptStub = stubPrompt(".");
    using _confirmStub = stubConfirm({
      [CONFIRM_TAILWIND_MESSAGE]: true,
    });

    await testInitProject(dir, [], { builder: true });
    await expectProjectFile(dir, "main.ts");
    await expectProjectFile(dir, "dev.ts");

    await patchProject(dir);

    const check = await new Deno.Command(Deno.execPath(), {
      args: ["task", "check"],
      cwd: dir,
      stderr: "inherit",
      stdout: "inherit",
    }).output();
    expect(check.code).toEqual(0);
  },
);

Deno.test({
  // TODO: For some reason this test is flaky in GitHub CI. It works when
  // testing locally on windows though. Not sure what's going on.
  ignore: Deno.build.os === "windows" && Deno.env.get("CI") !== undefined,
  name: "init - can start dev server",
  fn: async () => {
    await using tmp = await withTmpDir();
    const dir = tmp.dir;
    using _promptStub = stubPrompt(".");
    using _confirmStub = stubConfirm();
    await testInitProject(dir, [], { builder: true });
    await expectProjectFile(dir, "main.ts");
    await expectProjectFile(dir, "dev.ts");

    await patchProject(dir);
    await withChildProcessServer(
      { cwd: dir, args: ["task", "dev"] },
      async (address) => {
        await withBrowser(async (page) => {
          await page.goto(address);
          await page.locator("#decrement").click();
          await waitForText(page, "button + p", "2");
        });
      },
    );
  },
});

Deno.test("init - can start built project", async () => {
  await using tmp = await withTmpDir();
  const dir = tmp.dir;
  using _promptStub = stubPrompt(".");
  using _confirmStub = stubConfirm();
  await testInitProject(dir, [], { builder: true });
  await expectProjectFile(dir, "main.ts");
  await expectProjectFile(dir, "dev.ts");

  await patchProject(dir);

  // Build
  await new Deno.Command(Deno.execPath(), {
    args: ["task", "build"],
    stdin: "null",
    stdout: "piped",
    stderr: "piped",
    cwd: dir,
  }).output();

  await withChildProcessServer(
    { cwd: dir, args: ["serve", "-A", "--port", "0", "_fresh/server.js"] },
    async (address) => {
      await withBrowser(async (page) => {
        await page.goto(address);
        await page.locator("button").click();
        await waitForText(page, "button + p", "2");
      });
    },
  );
});

Deno.test("init - errors on missing build cache in prod", async () => {
  await using tmp = await withTmpDir();
  const dir = tmp.dir;
  using _promptStub = stubPrompt(".");
  using _confirmStub = stubConfirm();
  await testInitProject(dir, [], { builder: true });
  await expectProjectFile(dir, "main.ts");
  await expectProjectFile(dir, "dev.ts");

  await patchProject(dir);

  const cp = await new Deno.Command(Deno.execPath(), {
    args: ["task", "start"],
    stdin: "null",
    stdout: "piped",
    stderr: "piped",
    cwd: dir,
  }).output();

  const { stderr } = getStdOutput(cp);
  expect(cp.code).toEqual(1);

  expect(stderr).toMatch(/Module not found/);
});

// There is a peerDependency issue with links
Deno.test.ignore("init - vite dev server", async () => {
  await using tmp = await withTmpDir();
  const dir = tmp.dir;
  using _promptStub = stubPrompt(".");
  using _confirmStub = stubConfirm();
  await testInitProject(dir, [], {});

  await expectProjectFile(dir, "vite.config.ts");
  await expectNotProjectFile(dir, "dev.ts");

  await patchProject(dir);

  await withChildProcessServer(
    { cwd: dir, args: ["task", "dev"] },
    async (address) => {
      await withBrowser(async (page) => {
        await page.goto(address);
        await page.locator("#decrement").click();
        await waitForText(page, "button + p", "2");
      });
    },
  );
});

// There is a peerDependency issue with links
Deno.test.ignore("init - vite build", async () => {
  await using tmp = await withTmpDir();
  const dir = tmp.dir;
  using _promptStub = stubPrompt(".");
  using _confirmStub = stubConfirm();
  await testInitProject(dir, [], {});

  await expectProjectFile(dir, "vite.config.ts");

  await patchProject(dir);

  // Build
  await new Deno.Command(Deno.execPath(), {
    args: ["task", "build"],
    stdin: "null",
    stdout: "piped",
    stderr: "piped",
    cwd: dir,
  }).output();

  await withChildProcessServer(
    { cwd: dir, args: ["serve", "-A", "--port", "0", "_fresh/server.js"] },
    async (address) => {
      await withBrowser(async (page) => {
        await page.goto(address);
        await page.locator("button").click();
        await waitForText(page, "button + p", "2");
      });
    },
  );
});

Deno.test("init - with vite", async () => {
  await using tmp = await withTmpDir();
  const dir = tmp.dir;
  using _promptStub = stubPrompt(".");
  using _confirmStub = stubConfirm({
    [CONFIRM_VITE_MESSAGE]: true,
  });
  await testInitProject(dir, [], {});

  await expectProjectFile(dir, "vite.config.ts");
  await expectNotProjectFile(dir, "dev.ts");
});
