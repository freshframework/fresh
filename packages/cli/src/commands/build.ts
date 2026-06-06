// deno-lint-ignore-file no-console
import { error, findProjectRoot } from "../utils.ts";

export interface BuildFlags {
  dir: string | undefined;
}

export async function buildCommand(flags: BuildFlags): Promise<void> {
  const startDir = flags.dir ?? Deno.cwd();
  const root = findProjectRoot(startDir);
  if (!root) {
    error("Could not find a Fresh project. Run from inside a Fresh project.");
  }

  const config = readProjectConfig(root);
  const isVite = config.imports?.["vite"] !== undefined ||
    config.imports?.["@fresh/plugin-vite"] !== undefined;

  const args: string[] = [];

  if (isVite) {
    args.push("run", "-A", "npm:vite", "build");
  } else {
    args.push("run", "-A", "dev.ts", "build");
  }

  const cmd = new Deno.Command("deno", {
    args,
    cwd: root,
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
  });

  const proc = cmd.spawn();
  const status = await proc.status;
  Deno.exit(status.code);
}

function readProjectConfig(
  root: string,
): Record<string, Record<string, string>> {
  for (const name of ["deno.json", "deno.jsonc"]) {
    try {
      return JSON.parse(Deno.readTextFileSync(`${root}/${name}`));
    } catch { /* try next */ }
  }
  return {};
}
