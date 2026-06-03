import { parseArgs } from "@std/cli/parse-args";
import { initProject } from "./init.ts";
import { InitError } from "./init.ts";

// Note: "deno run -Ar jsr:@fresh/init" is the recommended way to create a new project.

const flags = parseArgs(Deno.args, {
  boolean: ["force", "tailwind", "vscode", "docker", "help", "builder"],
  string: ["src-dir"],
  default: {
    force: null,
    tailwind: null,
    vscode: null,
    docker: null,
    builder: null,
    "src-dir": null,
  },
  alias: {
    help: "h",
  },
});

try {
  await initProject(Deno.cwd(), flags._, flags);
} catch (err) {
  if (err instanceof InitError) {
    Deno.exit(1);
  }
  throw err;
}
