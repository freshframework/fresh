// deno-lint-ignore-file no-console
import { error, findProjectRoot } from "../utils.ts";

export interface DevFlags {
  port: string | undefined;
  host: string | undefined;
  dir: string | undefined;
}

export async function devCommand(flags: DevFlags): Promise<void> {
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
    // Vite-based project: run `deno run -A npm:vite`
    args.push("run", "-A", "npm:vite");
    if (flags.port) args.push("--port", flags.port);
    if (flags.host) args.push("--host", flags.host);
  } else {
    // Builder-based project: run `deno run -A dev.ts`
    args.push("run", "-A", "dev.ts");
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
