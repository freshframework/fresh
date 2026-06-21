#!/usr/bin/env node
import {
  cancel,
  confirm,
  intro,
  isCancel,
  log,
  multiselect,
  note,
  outro,
  spinner,
  text,
} from "@clack/prompts";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { cp, mkdir, readdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import pc from "picocolors";

interface PackageManager {
  name: "npm" | "pnpm" | "yarn" | "deno";
  install: string;
  run: (script: string) => string;
}

function detectPackageManager(): PackageManager {
  // Deno doesn't set npm_config_user_agent; sniff the runtime instead.
  if (typeof (globalThis as { Deno?: unknown }).Deno !== "undefined") {
    return {
      name: "deno",
      install: "deno install",
      run: (s) => `deno task ${s}`,
    };
  }

  const ua = process.env.npm_config_user_agent ?? "";
  const name = ua.split(" ")[0]?.split("/")[0];
  switch (name) {
    case "pnpm":
      return {
        name: "pnpm",
        install: "pnpm install",
        run: (s) => `pnpm ${s}`,
      };
    case "yarn":
      return {
        name: "yarn",
        install: "yarn",
        run: (s) => `yarn ${s}`,
      };
    default:
      return {
        name: "npm",
        install: "npm install",
        run: (s) => `npm run ${s}`,
      };
  }
}

function run(command: string, args: string[], cwd: string): Promise<void> {
  return new Promise((resolveP, rejectP) => {
    const child = spawn(command, args, {
      cwd,
      stdio: "ignore",
      shell: process.platform === "win32",
    });
    child.on("error", rejectP);
    child.on("exit", (code) => {
      if (code === 0) resolveP();
      else rejectP(new Error(`${command} exited with code ${code}`));
    });
  });
}

async function isEmptyDir(dir: string): Promise<boolean> {
  if (!existsSync(dir)) return true;
  const entries = await readdir(dir);
  return entries.length === 0;
}

interface Feature {
  id: string;
  label: string;
  hint?: string;
  apply: (projectDir: string) => Promise<void>;
}

async function patchJson(
  path: string,
  mutate: (json: Record<string, unknown>) => void,
): Promise<void> {
  const json = JSON.parse(await readFile(path, "utf8")) as Record<string, unknown>;
  mutate(json);
  await writeFile(path, JSON.stringify(json, null, 2) + "\n");
}

function mergeDeps(
  pkg: Record<string, unknown>,
  key: "dependencies" | "devDependencies",
  add: Record<string, string>,
): void {
  const existing = (pkg[key] ?? {}) as Record<string, string>;
  pkg[key] = Object.fromEntries(
    Object.entries({ ...existing, ...add }).sort(([a], [b]) => a.localeCompare(b)),
  );
}

const FEATURES: Feature[] = [
  {
    id: "tailwind",
    label: "Tailwind CSS",
    hint: "utility-first styling via @tailwindcss/vite",
    async apply(projectDir) {
      await patchJson(resolve(projectDir, "package.json"), (pkg) => {
        mergeDeps(pkg, "dependencies", {
          tailwindcss: "^4",
          "@tailwindcss/vite": "^4",
        });
      });

      const vitePath = resolve(projectDir, "vite.config.ts");
      const vite = await readFile(vitePath, "utf8");
      const patched = vite
        .replace(
          'import { fresh } from "fresh/vite";',
          'import { fresh } from "fresh/vite";\nimport tailwindcss from "@tailwindcss/vite";',
        )
        .replace("plugins: [fresh()]", "plugins: [fresh(), tailwindcss()]");
      await writeFile(vitePath, patched);

      const cssPath = resolve(projectDir, "style.css");
      const css = await readFile(cssPath, "utf8");
      await writeFile(cssPath, `@import "tailwindcss";\n\n${css}`);
    },
  },
];

function assertNotCancelled<T>(value: T | symbol): asserts value is T {
  if (isCancel(value)) {
    cancel("Cancelled.");
    process.exit(0);
  }
}

async function main(): Promise<void> {
  const pm = detectPackageManager();
  const here = dirname(fileURLToPath(import.meta.url));
  const templateDir = resolve(here, "..", "template");

  console.log();
  intro(pc.bgCyan(pc.black(" create-fresh-app ")));

  const positional = process.argv.slice(2).filter((a) => !a.startsWith("-"));
  let targetArg = positional[0];

  if (!targetArg) {
    const answer = await text({
      message: "Where should we create your project?",
      placeholder: "./my-app",
      defaultValue: "./my-app",
      validate(value: string) {
        if (!value) return;
        if (value.startsWith("-")) return "Project path cannot start with '-'.";
      },
    });
    assertNotCancelled(answer);
    targetArg = answer;
  }

  const projectDir = resolve(process.cwd(), targetArg);
  const projectName =
    targetArg === "." || targetArg === "./"
      ? "fresh-app"
      : (targetArg.replace(/\/+$/, "").split(/[\\/]/).pop() ?? "fresh-app");

  if (!(await isEmptyDir(projectDir))) {
    const proceed = await confirm({
      message: `${pc.yellow(
        relative(process.cwd(), projectDir) || ".",
      )} is not empty. Continue anyway?`,
      initialValue: false,
    });
    assertNotCancelled(proceed);
    if (!proceed) {
      cancel("Aborted.");
      process.exit(0);
    }
  }

  const selectedIds = await multiselect({
    message: "Pick optional features (space to toggle, enter to confirm)",
    options: FEATURES.map((f) => ({
      value: f.id,
      label: f.label,
      hint: f.hint,
    })),
    required: false,
  });
  assertNotCancelled(selectedIds);
  const selectedFeatures = FEATURES.filter((f) => (selectedIds as string[]).includes(f.id));

  const installDeps = await confirm({
    message: `Install dependencies with ${pc.cyan(pm.name)}?`,
    initialValue: true,
  });
  assertNotCancelled(installDeps);

  const initGit = await confirm({
    message: "Initialize a new git repository?",
    initialValue: true,
  });
  assertNotCancelled(initGit);

  const s = spinner();
  s.start(`Scaffolding project in ${pc.cyan(projectDir)}`);
  try {
    await mkdir(projectDir, { recursive: true });
    await cp(templateDir, projectDir, { recursive: true });

    // npm strips a literal ".gitignore" out of published tarballs, so the
    // template ships it as "_gitignore" and we rename on copy.
    const gitignoreSrc = resolve(projectDir, "_gitignore");
    if (existsSync(gitignoreSrc)) {
      await rename(gitignoreSrc, resolve(projectDir, ".gitignore"));
    }

    const selfPkg = JSON.parse(await readFile(resolve(here, "..", "package.json"), "utf8")) as {
      version: string;
    };
    const freshSpec = `npm:@frsh/fresh@^${selfPkg.version}`;

    const pkgPath = resolve(projectDir, "package.json");
    const pkg = JSON.parse(await readFile(pkgPath, "utf8")) as {
      name?: string;
      dependencies?: Record<string, string>;
    };
    pkg.name = projectName;
    if (pkg.dependencies?.fresh) pkg.dependencies.fresh = freshSpec;
    await writeFile(pkgPath, JSON.stringify(pkg, null, 2) + "\n");
    for (const feature of selectedFeatures) {
      await feature.apply(projectDir);
    }
    s.stop(
      selectedFeatures.length > 0
        ? `Project scaffolded with ${selectedFeatures.map((f) => f.label).join(", ")}.`
        : "Project scaffolded.",
    );
  } catch (err) {
    s.stop("Scaffolding failed.");
    throw err;
  }

  if (installDeps) {
    const [bin, ...args] = pm.install.split(" ");
    const ds = spinner();
    ds.start(`Installing dependencies with ${pm.name}`);
    try {
      await run(bin!, args, projectDir);
      ds.stop("Dependencies installed.");
    } catch (err) {
      ds.stop("Dependency install failed.");
      log.warn(String(err));
      log.info(`You can run ${pc.cyan(pm.install)} yourself later.`);
    }
  }

  if (initGit) {
    const gs = spinner();
    gs.start("Initializing git repository");
    try {
      await run("git", ["init"], projectDir);
      await run("git", ["add", "-A"], projectDir);
      await run("git", ["commit", "-m", "Initial commit from @frsh/create-app"], projectDir);
      gs.stop("Git repository initialized.");
    } catch (err) {
      gs.stop("Git initialization failed.");
      log.warn(String(err));
    }
  }

  const rel = relative(process.cwd(), projectDir) || ".";
  const steps: string[] = [];
  if (rel !== ".") steps.push(`cd ${rel}`);
  if (!installDeps) steps.push(pm.install);
  steps.push(pm.run("dev"));

  note(steps.map((s) => pc.cyan(s)).join("\n"), "Next steps");
  outro(`${pc.green("Done!")} Happy hacking with Fresh.`);
}

try {
  await main();
} catch (err) {
  console.error(err);
  process.exit(1);
}
