// deno-lint-ignore-file no-console
import * as path from "@std/path";
import * as colors from "@std/fmt/colors";

/** Convert a path segment to PascalCase for use as a component name. */
export function toPascalCase(input: string): string {
  return input
    .replace(/[\[\]\.]/g, "") // strip brackets and dots
    .replace(/^\.+/, "") // strip leading dots (catch-all)
    .split(/[-_\/]/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join("");
}

/**
 * Compute the relative import path to `utils.ts` from a target file.
 * Both paths are relative to the project root.
 */
export function computeUtilsImport(targetFilePath: string): string {
  const dir = path.dirname(targetFilePath);
  const rel = path.relative(dir, ".");
  return (rel ? rel + "/" : "./") + "utils.ts";
}

/**
 * Find the Fresh project root by walking up from `startDir` looking for a
 * `deno.json` that imports `fresh` or `@fresh/core`.
 */
export function findProjectRoot(startDir: string): string | null {
  let dir = path.resolve(startDir);
  const root = path.parse(dir).root;

  while (true) {
    for (const name of ["deno.json", "deno.jsonc"]) {
      const configPath = path.join(dir, name);
      try {
        const text = Deno.readTextFileSync(configPath);
        const config = JSON.parse(text);
        const imports = config.imports ?? {};
        if (
          imports["fresh"] !== undefined ||
          imports["@fresh/core"] !== undefined
        ) {
          return dir;
        }
      } catch {
        // file doesn't exist or isn't valid JSON
      }
    }
    const parent = path.dirname(dir);
    if (parent === dir || dir === root) return null;
    dir = parent;
  }
}

/**
 * Write a file, creating parent directories as needed.
 * Errors if the file already exists unless `force` is true.
 */
export function writeFile(
  filePath: string,
  content: string,
  opts: { force?: boolean; dryRun?: boolean },
): void {
  if (opts.dryRun) {
    console.log(colors.yellow(`[dry-run] Would create ${filePath}`));
    console.log(colors.dim(content));
    return;
  }

  if (!opts.force) {
    try {
      Deno.statSync(filePath);
      error(`File already exists: ${filePath}\n  Use --force to overwrite.`);
    } catch (e) {
      if (!(e instanceof Deno.errors.NotFound)) throw e;
    }
  }

  Deno.mkdirSync(path.dirname(filePath), { recursive: true });
  Deno.writeTextFileSync(filePath, content);
  console.log(colors.green("  create") + " " + filePath);
}

/**
 * Check for semantic route collisions:
 * e.g. routes/about.tsx vs routes/about/index.tsx
 */
export function checkCollisions(
  filePath: string,
  projectRoot: string,
): string | null {
  const abs = path.join(projectRoot, filePath);

  // Check file.tsx vs file/index.tsx
  for (const ext of [".tsx", ".ts", ".jsx", ".js"]) {
    if (filePath.endsWith(`/index${ext}`)) {
      const alt = filePath.replace(`/index${ext}`, ext);
      try {
        Deno.statSync(path.join(projectRoot, alt));
        return `Conflict: ${alt} already serves the same URL pattern`;
      } catch { /* not found */ }
    } else if (filePath.endsWith(ext)) {
      const base = filePath.slice(0, -ext.length);
      for (const altExt of [".tsx", ".ts", ".jsx", ".js"]) {
        const alt = base + `/index${altExt}`;
        try {
          Deno.statSync(path.join(projectRoot, alt));
          return `Conflict: ${alt} already serves the same URL pattern`;
        } catch { /* not found */ }
      }
    }
  }

  // Check if the exact file exists (any extension)
  try {
    Deno.statSync(abs);
    return null; // Will be caught by writeFile's existence check
  } catch { /* not found, good */ }

  return null;
}

export function error(message: string): never {
  console.error(
    `${colors.red(colors.bold("error"))}: ${message}`,
  );
  Deno.exit(1);
}

export function warn(message: string): void {
  console.warn(
    `${colors.yellow(colors.bold("warn"))}: ${message}`,
  );
}

export function info(message: string): void {
  console.log(
    `${colors.blue(colors.bold("info"))}: ${message}`,
  );
}
