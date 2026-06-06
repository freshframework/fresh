// deno-lint-ignore-file no-console

export async function initCommand(args: string[]): Promise<void> {
  // Delegate to @fresh/init, passing all arguments through
  const cmd = new Deno.Command("deno", {
    args: ["run", "-Ar", "jsr:@fresh/init", ...args],
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
  });

  const proc = cmd.spawn();
  const status = await proc.status;
  Deno.exit(status.code);
}
