// deno-lint-ignore-file no-console
import { error, findProjectRoot } from "../utils.ts";

export interface StartFlags {
  port: string | undefined;
  dir: string | undefined;
}

export async function startCommand(flags: StartFlags): Promise<void> {
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
    // Production: run `deno run -A main.ts`
    args.push("run", "-A", "main.ts");
  } else {
    args.push("run", "-A", "main.ts");
  }

  const env: Record<string, string> = {};
  if (flags.port) {
    env["PORT"] = flags.port;
  }

  const cmd = new Deno.Command("deno", {
    args,
    cwd: root,
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
    env,
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
