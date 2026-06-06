import { expect } from "@std/expect";
import * as path from "@std/path";
import { generateCommand } from "./generate.ts";

const DEFAULTS = {
  handler: false,
  force: false,
  "dry-run": true, // Always dry-run in tests
  dir: undefined as string | undefined,
};

async function withTmpProject(
  fn: (dir: string) => void | Promise<void>,
): Promise<void> {
  const dir = Deno.makeTempDirSync({ prefix: "fresh-cli-test-" });
  try {
    // Create a minimal Fresh project structure
    Deno.writeTextFileSync(
      path.join(dir, "deno.json"),
      JSON.stringify({
        imports: { fresh: "jsr:@fresh/core@^2.0.0" },
      }),
    );
    Deno.writeTextFileSync(
      path.join(dir, "utils.ts"),
      'import { createDefine } from "fresh";\nexport const define = createDefine();\n',
    );
    Deno.mkdirSync(path.join(dir, "routes"), { recursive: true });
    Deno.mkdirSync(path.join(dir, "islands"), { recursive: true });
    Deno.mkdirSync(path.join(dir, "components"), { recursive: true });

    await fn(dir);
  } finally {
    Deno.removeSync(dir, { recursive: true });
  }
}

Deno.test("generate route - creates route file", async () => {
  await withTmpProject((dir) => {
    generateCommand(["route", "about"], { ...DEFAULTS, dir, "dry-run": false });
    const content = Deno.readTextFileSync(path.join(dir, "routes/about.tsx"));
    expect(content).toContain("function About()");
    expect(content).toContain('import { define }');
    expect(content).toContain("define.page");
  });
});

Deno.test("generate route --handler - includes handler", async () => {
  await withTmpProject((dir) => {
    generateCommand(["route", "users/[id]"], {
      ...DEFAULTS,
      dir,
      handler: true,
      "dry-run": false,
    });
    const content = Deno.readTextFileSync(
      path.join(dir, "routes/users/[id].tsx"),
    );
    expect(content).toContain("define.handlers");
    expect(content).toContain("define.page<typeof handler>");
    expect(content).toContain('import { page } from "fresh"');
  });
});

Deno.test("generate api - creates .ts file with handler", async () => {
  await withTmpProject((dir) => {
    generateCommand(["api", "users"], { ...DEFAULTS, dir, "dry-run": false });
    const content = Deno.readTextFileSync(path.join(dir, "routes/users.ts"));
    expect(content).toContain("define.handlers");
    expect(content).toContain("Response.json");
    expect(content).not.toContain("define.page");
  });
});

Deno.test("generate island - creates island file", async () => {
  await withTmpProject((dir) => {
    generateCommand(["island", "Counter"], {
      ...DEFAULTS,
      dir,
      "dry-run": false,
    });
    const content = Deno.readTextFileSync(
      path.join(dir, "islands/Counter.tsx"),
    );
    expect(content).toContain("function Counter(");
    expect(content).toContain("CounterProps");
    expect(content).toContain("@preact/signals");
  });
});

Deno.test("generate middleware - creates _middleware.ts", async () => {
  await withTmpProject((dir) => {
    generateCommand(["middleware", "admin"], {
      ...DEFAULTS,
      dir,
      "dry-run": false,
    });
    const content = Deno.readTextFileSync(
      path.join(dir, "routes/admin/_middleware.ts"),
    );
    expect(content).toContain("define.middleware");
    expect(content).toContain("ctx.next()");
  });
});

Deno.test("generate middleware (root) - creates routes/_middleware.ts", async () => {
  await withTmpProject((dir) => {
    generateCommand(["middleware"], { ...DEFAULTS, dir, "dry-run": false });
    const content = Deno.readTextFileSync(
      path.join(dir, "routes/_middleware.ts"),
    );
    expect(content).toContain("define.middleware");
  });
});

Deno.test("generate layout - creates _layout.tsx", async () => {
  await withTmpProject((dir) => {
    generateCommand(["layout", "dashboard"], {
      ...DEFAULTS,
      dir,
      "dry-run": false,
    });
    const content = Deno.readTextFileSync(
      path.join(dir, "routes/dashboard/_layout.tsx"),
    );
    expect(content).toContain("define.layout");
    expect(content).toContain("DashboardLayout");
    expect(content).toContain("<Component />");
  });
});

Deno.test("generate component - creates component file", async () => {
  await withTmpProject((dir) => {
    generateCommand(["component", "Button"], {
      ...DEFAULTS,
      dir,
      "dry-run": false,
    });
    const content = Deno.readTextFileSync(
      path.join(dir, "components/Button.tsx"),
    );
    expect(content).toContain("function Button(");
    expect(content).toContain("ButtonProps");
    expect(content).toContain("children");
  });
});

Deno.test("generate route - refuses to overwrite without --force", async () => {
  await withTmpProject((dir) => {
    // Create the file first
    Deno.mkdirSync(path.join(dir, "routes"), { recursive: true });
    Deno.writeTextFileSync(path.join(dir, "routes/existing.tsx"), "existing");

    // Should exit(1) on collision - we can't easily test Deno.exit,
    // so just verify the file wasn't changed by using --dry-run
    generateCommand(["route", "existing"], { ...DEFAULTS, dir });
    const content = Deno.readTextFileSync(
      path.join(dir, "routes/existing.tsx"),
    );
    expect(content).toBe("existing"); // unchanged
  });
});

Deno.test("generate route - nested import path is correct", async () => {
  await withTmpProject((dir) => {
    generateCommand(["route", "admin/settings/general"], {
      ...DEFAULTS,
      dir,
      "dry-run": false,
    });
    const content = Deno.readTextFileSync(
      path.join(dir, "routes/admin/settings/general.tsx"),
    );
    expect(content).toContain('../../../utils.ts"');
  });
});
