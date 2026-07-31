import { createBuilder } from "vite";
import * as path from "@std/path";
import { walk } from "@std/fs/walk";
import { integrationTest, withTmpDir } from "../../fresh/src/test_utils.ts";
import { withChildProcessServer } from "../../fresh/tests/test_utils.tsx";

export { integrationTest };

export const DEMO_DIR = path.join(import.meta.dirname!, "..", "demo");
export const FIXTURE_DIR = path.join(import.meta.dirname!, "fixtures");

export async function updateFile(
  filePath: string,
  fn: (text: string) => string | Promise<string>,
) {
  const original = await Deno.readTextFile(filePath);
  const result = await fn(original);
  await Deno.writeTextFile(filePath, result);

  return {
    async [Symbol.asyncDispose]() {
      await Deno.writeTextFile(filePath, original);
    },
  };
}

async function copyDir(from: string, to: string) {
  const entries = walk(from, {
    includeFiles: true,
    includeDirs: false,
    skip: [/([\\/]+(_fresh|node_modules|vendor)[\\/]+|[\\/]+vite\.config\.ts)/],
  });

  for await (const entry of entries) {
    if (entry.isFile) {
      const relative = path.relative(from, entry.path);
      const target = path.join(to, relative);

      try {
        await Deno.mkdir(path.dirname(target), { recursive: true });
      } catch (err) {
        if (!(err instanceof Deno.errors.NotFound)) {
          throw err;
        }
      }

      await Deno.copyFile(entry.path, target);
    }
  }
}

export async function prepareDevServer(
  fixtureDir: string,
  options: { config?: string } = {},
) {
  const tmp = await withTmpDir({
    dir: path.join(import.meta.dirname!, ".."),
    prefix: "tmp_vite_",
  });

  await copyDir(fixtureDir, tmp.dir);

  await Deno.writeTextFile(
    path.join(tmp.dir, "vite.config.ts"),
    options.config ?? `import { defineConfig } from "vite";
import { fresh } from "@fresh/plugin-vite";

export default defineConfig({
  plugins: [
    fresh(),
  ],
});
`,
  );

  return tmp;
}

export async function launchDevServer(
  dir: string,
  fn: (address: string, dir: string) => void | Promise<void>,
  env: Record<string, string> = {},
) {
  await withChildProcessServer(
    {
      cwd: dir,
      args: ["run", "-A", "--cached-only", "npm:vite", "--port", "0"],
      env,
    },
    async (address) => await fn(address, dir),
  );
}

export async function spawnDevServer(
  dir: string,
  env: Record<string, string> = {},
) {
  const boot = Promise.withResolvers<void>();
  const p = Promise.withResolvers<void>();

  let serverAddress = "";

  const server = withChildProcessServer(
    {
      cwd: dir,
      args: ["run", "-A", "--cached-only", "npm:vite", "--port", "0"],
      env,
    },
    async (address) => {
      serverAddress = address;
      boot.resolve();
      await p.promise;
    },
  );

  await boot.promise;

  return {
    dir,
    promise: server,
    address: () => {
      return serverAddress;
    },
    async [Symbol.asyncDispose]() {
      await p.resolve();
    },
  };
}

export async function withDevServer(
  fixtureDir: string,
  fn: (address: string, dir: string) => void | Promise<void>,
  env: Record<string, string> = {},
) {
  await using tmp = await prepareDevServer(fixtureDir);
  await launchDevServer(tmp.dir, fn, env);
}

export async function buildVite(
  fixtureDir: string,
  options?: {
    base?: string;
    rollupOutput?: {
      entryFileNames?: string;
      chunkFileNames?: string;
      assetFileNames?: string;
    };
  },
) {
  const tmp = await withTmpDir({
    dir: path.join(import.meta.dirname!, ".."),
    prefix: "tmp_vite_",
  });

  const builder = await createBuilder({
    logLevel: "error",
    root: fixtureDir,
    base: options?.base,
    build: {
      emptyOutDir: true,
    },
    environments: {
      ssr: {
        build: {
          outDir: path.join(tmp.dir, "_fresh", "server"),
          rollupOptions: options?.rollupOutput
            ? { output: options.rollupOutput }
            : undefined,
        },
      },
      client: {
        build: {
          outDir: path.join(tmp.dir, "_fresh", "client"),
        },
      },
    },
  });
  await builder.buildApp();

  return {
    tmp: tmp.dir,
    async [Symbol.asyncDispose]() {
      return await tmp[Symbol.asyncDispose]();
    },
  };
}

export function usingEnv(name: string, value: string) {
  const prev = Deno.env.get(name);
  Deno.env.set(name, value);
  return {
    [Symbol.dispose]: () => {
      if (prev === undefined) {
        Deno.env.delete(name);
      } else {
        Deno.env.set(name, prev);
      }
    },
  };
}

export interface ProdOptions {
  cwd: string;
  args?: string[];
  bin?: string;
  env?: Record<string, string>;
}

export async function launchProd(
  options: ProdOptions,
  fn: (address: string) => void | Promise<void>,
) {
  return await withChildProcessServer(
    {
      cwd: options.cwd,
      args: options.args ??
        ["serve", "-A", "--cached-only", "--port", "0", "_fresh/server.js"],
    },
    fn,
  );
}
