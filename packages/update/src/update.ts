import * as path from "@std/path";
import * as JSONC from "@std/jsonc";
import * as tsmorph from "ts-morph";
import * as colors from "@std/fmt/colors";
import { ProgressBar } from "@std/cli/unstable-progress-bar";
import { walk } from "@std/fs/walk";

export const SyntaxKind = tsmorph.ts.SyntaxKind;

export const FRESH_VERSION = "2.3.3";
export const PREACT_VERSION = "10.29.1";
export const PREACT_SIGNALS_VERSION = "2.9.0";

// Directories to skip when walking the project tree. Covers hidden directories,
// dependency caches, and common build output folders.
const SKIP_DIRS =
  /(?:[\\/]\.[^\\/]+(?:[\\/]|$)|[\\/](node_modules|vendor|\.git|\.next|\.turbo|_fresh|dist|target|\.cache)(?:[\\/]|$))/;
export interface DenoJson {
  lock?: boolean;
  tasks?: Record<string, string>;
  name?: string;
  version?: string;
  imports?: Record<string, string>;
}

async function format(filePath: string) {
  const command = new Deno.Command(Deno.execPath(), {
    args: ["fmt", filePath],
  });
  await command.output();
}

async function writeFormatted(filePath: string, content: string) {
  await Deno.writeTextFile(filePath, content);
  await format(filePath);
}

async function updateDenoJson(
  dir: string,
  fn: (json: DenoJson) => void | Promise<void>,
): Promise<void> {
  let filePath = path.join(dir, "deno.json");
  try {
    const config = JSON.parse(await Deno.readTextFile(filePath)) as DenoJson;
    await fn(config);
    await writeFormatted(filePath, JSON.stringify(config));
    return;
  } catch (err) {
    if (!(err instanceof Deno.errors.NotFound)) {
      throw err;
    }
  }

  filePath = path.join(dir, "deno.jsonc");
  try {
    const config = JSONC.parse(await Deno.readTextFile(filePath)) as DenoJson;
    await fn(config);
    await writeFormatted(filePath, JSON.stringify(config));
    return;
  } catch (err) {
    if (!(err instanceof Deno.errors.NotFound)) {
      throw err;
    }
  }

  throw new Error(`Could not find deno.json or deno.jsonc in: ${dir}`);
}

export interface ImportState {
  core: Set<string>;
  runtime: Set<string>;
  compat: Set<string>;
  httpError: number;
}

const compat = new Set([
  "defineApp",
  "defineLayout",
  "defineRoute",
  "AppProps",
  "ErrorPageProps",
  "Handler",
  "Handlers",
  "LayoutProps",
  "RouteContext",
  "UnknownPageProps",
]);

async function detectFresh2(dir: string): Promise<boolean> {
  for (const filename of ["deno.json", "deno.jsonc"]) {
    try {
      const content = await Deno.readTextFile(path.join(dir, filename));
      const config = JSONC.parse(content) as DenoJson;
      const imports = config.imports;
      if (imports) {
        // Fresh 2 uses "fresh" or "@fresh/core" as the import specifier
        if (imports["fresh"]?.includes("@fresh/core")) {
          return true;
        }
      }
    } catch {
      // File doesn't exist, try next
    }
  }
  return false;
}

export async function updateProject(dir: string) {
  // Detect if the project is already on Fresh 2 by checking imports
  const isFresh2 = await detectFresh2(dir);

  if (isFresh2) {
    // deno-lint-ignore no-console
    console.log(colors.blue(`🔄 Updating Fresh to ${FRESH_VERSION}...`));
  } else {
    // deno-lint-ignore no-console
    console.log(colors.blue("🚀 Starting Fresh 1 to Fresh 2 migration..."));
    // deno-lint-ignore no-console
    console.log(
      colors.italic(
        "Note: Breaking changes may require additional manual updates.",
      ),
    );
    // deno-lint-ignore no-console
    console.log();
  }

  // deno-lint-ignore no-console
  console.log(colors.yellow("📝 Updating configuration files..."));

  // Update config
  await updateDenoJson(dir, (config) => {
    if (config.imports !== null && typeof config.imports !== "object") {
      config.imports = {};
    }

    config.imports["fresh"] = `jsr:@fresh/core@^${FRESH_VERSION}`;
    config.imports["preact"] = `npm:preact@^${PREACT_VERSION}`;
    config.imports["@preact/signals"] =
      `npm:@preact/signals@^${PREACT_SIGNALS_VERSION}`;
    delete config.imports["$fresh/"];
    delete config.imports["@preact/signals-core"];
    delete config.imports["preact-render-to-string"];

    // We should always use a lockfile going forwards
    if ("lock" in config) {
      delete config.lock;
    }

    // Update Fresh 1.x tasks
    const tasks = config.tasks;
    if (tasks !== undefined) {
      if (tasks.manifest === "deno task cli manifest $(pwd)") {
        delete tasks.manifest;
      }

      if (
        tasks.cli ===
          "echo \"import '\\$fresh/src/dev/cli.ts'\" | deno run --unstable -A -" ||
        tasks.cli ===
          "echo \"import '$fresh/src/dev/cli.ts'\" | deno run --unstable -A -"
      ) {
        delete tasks.cli;
      }

      if (tasks.update === "deno run -A -r https://fresh.deno.dev/update .") {
        tasks.update = "deno run -A -r jsr:@fresh/update .";
      }

      if (
        tasks.check ===
          "deno fmt --check && deno lint && deno check **/*.ts && deno check **/*.tsx"
      ) {
        tasks.check = "deno fmt --check && deno lint && deno check";
      }

      if (tasks.preview === "deno run -A main.ts") {
        tasks.preview = "deno serve -A _fresh/server.js";
      }
    }
  });

  // add completion log
  // deno-lint-ignore no-console
  console.log(colors.green("✅ Configuration updated successfully"));

  // Delete fresh.gen.ts if it exists (no longer needed in Fresh 2.0)
  const freshGenPath = path.join(dir, "fresh.gen.ts");
  try {
    await Deno.remove(freshGenPath);
    // deno-lint-ignore no-console
    console.log(colors.cyan("🗑️ Deleted fresh.gen.ts (no longer needed)"));
  } catch (err) {
    if (!(err instanceof Deno.errors.NotFound)) {
      // deno-lint-ignore no-console
      console.error(
        `Could not delete fresh.gen.ts: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
    // If file doesn't exist, that's fine - nothing to do
  }

  // deno-lint-ignore no-console
  console.log(colors.cyan("🔍 Scanning for source files..."));

  // Update routes folder
  const project = new tsmorph.Project();

  // Collect file paths so we can size the progress bar.
  const filesToProcess: string[] = [];
  for await (
    const entry of walk(dir, {
      includeDirs: false,
      includeFiles: true,
      exts: ["js", "jsx", "ts", "tsx"],
      skip: [SKIP_DIRS],
    })
  ) {
    filesToProcess.push(entry.path);
  }

  // deno-lint-ignore no-console
  console.log(
    colors.cyan(`📁 Found ${filesToProcess.length} files to process`),
  );

  if (filesToProcess.length === 0) {
    // deno-lint-ignore no-console
    console.log(
      colors.green(
        isFresh2
          ? "🎉 Update completed successfully!"
          : "🎉 Migration completed successfully!",
      ),
    );
    return;
  }

  // deno-lint-ignore no-console
  console.log(colors.yellow("🔄 Processing files..."));

  // Track progress with a single counter
  let completedFiles = 0;
  const modifiedFilesList: string[] = [];

  // Create a progress bar
  const bar = new ProgressBar({
    max: filesToProcess.length,
    formatter(x) {
      return `[${x.styledTime}] [${x.progressBar}] [${x.value}/${x.max} files]`;
    },
  });

  // Process each file one-by-one to keep memory flat. We add a SourceFile,
  // transform it, then immediately forget it so ts-morph releases the AST.
  for (const filePath of filesToProcess) {
    const sourceFile = project.addSourceFileAtPath(filePath);
    try {
      const wasModified = await updateFile(sourceFile);
      if (wasModified) {
        modifiedFilesList.push(sourceFile.getFilePath());
      }
    } catch (err) {
      // deno-lint-ignore no-console
      console.error(`Could not process ${sourceFile.getFilePath()}`);
      throw err;
    } finally {
      completedFiles++;
      bar.value = completedFiles;
      // Drop the AST to avoid unbounded memory growth
      sourceFile.forget();
      project.removeSourceFile(sourceFile);
    }
  }

  // Clear the progress line and add a newline
  await bar.stop();

  // deno-lint-ignore no-console
  console.log(
    "\n" +
      colors.bold(isFresh2 ? "📊 Update Summary:" : "📊 Migration Summary:"),
  );
  // deno-lint-ignore no-console
  console.log(`   Total files processed: ${filesToProcess.length}`);
  // deno-lint-ignore no-console
  console.log(`   Successfully modified: ${modifiedFilesList.length}`);
  // deno-lint-ignore no-console
  console.log(
    `   Unmodified (no changes needed): ${
      filesToProcess.length - modifiedFilesList.length
    }`,
  );

  // Display modified files list
  if (modifiedFilesList.length > 0) {
    // deno-lint-ignore no-console
    console.log("\n" + colors.bold("📝 Modified Files:"));
    modifiedFilesList.forEach((filePath) => {
      // show relative path
      let relativePath = path.relative(dir, filePath);
      // Ensure consistent path separators for logging
      relativePath = relativePath.replace(/\\/g, "/");
      // deno-lint-ignore no-console
      console.log(colors.green(`   ✓ ${relativePath}`));
    });
  }

  // deno-lint-ignore no-console
  console.log(
    "\n" +
      colors.green(
        isFresh2
          ? "🎉 Update completed successfully!"
          : "🎉 Migration completed successfully!",
      ),
  );
}

async function updateFile(sourceFile: tsmorph.SourceFile): Promise<boolean> {
  // keep original text for comparison
  const originalText = sourceFile.getFullText();

  const newImports: ImportState = {
    core: new Set(),
    runtime: new Set(),
    compat: new Set(),
    httpError: 0,
  };

  const text = sourceFile.getFullText()
    .replaceAll("/** @jsx h */\n", "")
    .replaceAll("/** @jsxFrag Fragment */\n", "")
    .replaceAll('/// <reference no-default-lib="true" />\n', "")
    .replaceAll('/// <reference lib="dom" />\n', "")
    .replaceAll('/// <reference lib="dom.iterable" />\n', "")
    .replaceAll('/// <reference lib="dom.asynciterable" />\n', "")
    .replaceAll('/// <reference lib="deno.ns" />\n', "");
  sourceFile.replaceWithText(text);

  if (
    sourceFile.getFilePath().includes("/routes/") &&
    !sourceFile.getDirectoryPath().includes("/(_")
  ) {
    for (const [name, decl] of sourceFile.getExportedDeclarations()) {
      if (name === "handler") {
        const node = decl[0];
        if (node.isKind(SyntaxKind.VariableDeclaration)) {
          const init = node.getInitializer();
          if (
            init !== undefined &&
            init.isKind(SyntaxKind.ObjectLiteralExpression)
          ) {
            for (const property of init.getProperties()) {
              if (property.isKind(SyntaxKind.MethodDeclaration)) {
                const name = property.getName();
                if (
                  name === "GET" || name === "POST" || name === "PATCH" ||
                  name === "PUT" || name === "DELETE"
                ) {
                  const body = property.getBody();
                  if (body !== undefined) {
                    const stmts = body.getDescendantStatements();
                    rewriteCtxMethods(newImports, stmts);
                  }

                  maybePrependReqVar(property, newImports, true);
                }
              } else if (property.isKind(SyntaxKind.PropertyAssignment)) {
                const init = property.getInitializer();
                if (
                  init !== undefined &&
                  (init.isKind(SyntaxKind.ArrowFunction) ||
                    init.isKind(SyntaxKind.FunctionExpression))
                ) {
                  const body = init.getBody();
                  if (body !== undefined) {
                    const stmts = body.getDescendantStatements();
                    rewriteCtxMethods(newImports, stmts);
                  }

                  maybePrependReqVar(init, newImports, true);
                }
              }
            }
          }
        } else if (node.isKind(SyntaxKind.FunctionDeclaration)) {
          const body = node.getBody();
          if (body !== undefined) {
            const stmts = body.getDescendantStatements();
            rewriteCtxMethods(newImports, stmts);
          }

          maybePrependReqVar(node, newImports, false);
        }
      } else if (name === "default" && decl.length > 0) {
        const caller = decl[0];
        if (caller.isKind(SyntaxKind.CallExpression)) {
          const expr = caller.getExpression();
          if (expr.isKind(SyntaxKind.Identifier)) {
            const text = expr.getText();
            if (
              text === "defineApp" || text === "defineLayout" ||
              text === "defineRoute"
            ) {
              const args = caller.getArguments();
              if (args.length > 0) {
                const first = args[0];
                if (
                  first.isKind(SyntaxKind.ArrowFunction) ||
                  first.isKind(SyntaxKind.FunctionExpression)
                ) {
                  const body = first.getBody();
                  if (body !== undefined) {
                    const stmts = body.getDescendantStatements();
                    rewriteCtxMethods(newImports, stmts);
                  }

                  maybePrependReqVar(first, newImports, false);
                }
              }
            }
          }
        } else if (caller.isKind(SyntaxKind.FunctionDeclaration)) {
          const body = caller.getBody();
          if (body !== undefined) {
            const stmts = body.getDescendantStatements();
            rewriteCtxMethods(newImports, stmts);
          }

          maybePrependReqVar(caller, newImports, false);
        }
      }
    }
  }

  let hasCoreImport = false;
  let hasRuntimeImport = false;
  for (const d of sourceFile.getImportDeclarations()) {
    const specifier = d.getModuleSpecifierValue();
    if (specifier === "preact") {
      for (const n of d.getNamedImports()) {
        const name = n.getName();
        if (name === "h" || name === "Fragment") n.remove();
      }

      removeEmptyImport(d);
    } else if (specifier === "$fresh/server.ts") {
      hasCoreImport = true;
      d.setModuleSpecifier("fresh");

      for (const n of d.getNamedImports()) {
        const name = n.getName();
        newImports.core.delete(name);
        if (compat.has(name)) {
          n.remove();
          newImports.compat.add(name);
        }
      }
      if (newImports.core.size > 0) {
        newImports.core.forEach((name) => {
          d.addNamedImport(name);
        });
      }

      removeEmptyImport(d);
    } else if (specifier === "$fresh/runtime.ts") {
      hasRuntimeImport = true;
      d.setModuleSpecifier("fresh/runtime");

      for (const n of d.getNamedImports()) {
        const name = n.getName();
        newImports.runtime.delete(name);
      }
      if (newImports.runtime.size > 0) {
        newImports.runtime.forEach((name) => {
          d.addNamedImport(name);
        });
      }

      removeEmptyImport(d);
    }
  }

  if (!hasCoreImport && newImports.core.size > 0) {
    sourceFile.addImportDeclaration({
      moduleSpecifier: "fresh",
      namedImports: Array.from(newImports.core),
    });
  }
  if (!hasRuntimeImport && newImports.runtime.size > 0) {
    sourceFile.addImportDeclaration({
      moduleSpecifier: "fresh/runtime",
      namedImports: Array.from(newImports.runtime),
    });
  }
  if (newImports.compat.size > 0) {
    sourceFile.addImportDeclaration({
      moduleSpecifier: "fresh/compat",
      namedImports: Array.from(newImports.compat),
    });
  }
  if (newImports.httpError > 0) {
    sourceFile.addImportDeclaration({
      moduleSpecifier: "fresh",
      namedImports: ["HttpError"],
    });
  }

  await sourceFile.save();
  await format(sourceFile.getFilePath());

  // Check if the file was actually modified
  const finalText = sourceFile.getFullText();
  return originalText !== finalText;
}

function removeEmptyImport(d: tsmorph.ImportDeclaration) {
  if (
    d.getNamedImports().length === 0 &&
    d.getNamespaceImport() === undefined &&
    d.getDefaultImport() === undefined
  ) {
    d.remove();
  }
}

function maybePrependReqVar(
  method:
    | tsmorph.MethodDeclaration
    | tsmorph.FunctionDeclaration
    | tsmorph.FunctionExpression
    | tsmorph.ArrowFunction,
  newImports: ImportState,
  hasInferredTypes: boolean,
) {
  let hasRequestVar = false;
  const params = method.getParameters();
  if (params.length > 0) {
    const paramName = params[0].getName();

    // Add explicit types if the user did that
    if (hasInferredTypes && params[0].getTypeNode()) {
      hasInferredTypes = false;
    }

    hasRequestVar = params.length > 1 || paramName === "req";
    if (hasRequestVar || paramName === "_req") {
      if (hasRequestVar && params.length === 1) {
        params[0].replaceWithText("ctx");
        if (!hasInferredTypes) {
          newImports.core.add("FreshContext");
          params[0].setType("FreshContext");
        }
      } else {
        params[0].remove();

        // Use proper type
        if (params.length > 1) {
          const initType = params[1].getTypeNode()?.getText();
          if (initType !== undefined && initType === "RouteContext") {
            newImports.core.add("FreshContext");
            params[1].setType("FreshContext");
          }
        }
      }
    }
    const maybeObjBinding = params.length > 1
      ? params[1].getNameNode()
      : undefined;

    if (method.isKind(SyntaxKind.ArrowFunction)) {
      const body = method.getBody();
      if (!body.isKind(SyntaxKind.Block)) {
        // deno-lint-ignore no-console
        console.warn(`Cannot transform arrow function`);
        return;
      }
    }

    if (
      (maybeObjBinding === undefined ||
        !maybeObjBinding.isKind(SyntaxKind.ObjectBindingPattern)) &&
      hasRequestVar &&
      !paramName.startsWith("_")
    ) {
      method.insertVariableStatement(0, {
        declarationKind: tsmorph.VariableDeclarationKind.Const,
        declarations: [{
          name: paramName,
          initializer: "ctx.req",
        }],
      });
    }

    if (
      maybeObjBinding !== undefined &&
      maybeObjBinding.isKind(SyntaxKind.ObjectBindingPattern)
    ) {
      const bindings = maybeObjBinding.getElements();
      if (bindings.length > 0) {
        let needsRemoteAddr = false;
        for (let i = 0; i < bindings.length; i++) {
          const binding = bindings[i];
          const name = binding.getName();
          if (name === "remoteAddr") {
            binding.replaceWithText("info");
            needsRemoteAddr = true;
          }
        }
        if (hasRequestVar && !paramName.startsWith("_")) {
          const txt = maybeObjBinding.getFullText().slice(0, -2);
          maybeObjBinding.replaceWithText(txt + ", req }");
        }

        if (needsRemoteAddr) {
          method.insertVariableStatement(0, {
            declarationKind: tsmorph.VariableDeclarationKind.Const,
            declarations: [{
              name: "remoteAddr",
              initializer: "info.remoteAddr",
            }],
          });
        }
      }
    }
  }
}

function rewriteCtxMethods(
  importState: ImportState,
  nodes: (tsmorph.Node<tsmorph.ts.Node>)[],
) {
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];

    if (node.wasForgotten()) continue;

    if (
      node.isKind(SyntaxKind.ExpressionStatement) &&
      node.getText() === "ctx.renderNotFound();"
    ) {
      importState.httpError++;
      node.replaceWithText("throw new HttpError(404);");
      continue;
    }

    if (node.isKind(SyntaxKind.PropertyAccessExpression)) {
      rewriteCtxMemberName(node);
    } else if (node.isKind(SyntaxKind.ReturnStatement)) {
      if (node.getText() === "return ctx.renderNotFound();") {
        importState.httpError++;
        node.replaceWithText(`throw new HttpError(404)`);
        continue;
      } else {
        const expr = node.getExpression();
        if (expr !== undefined) {
          rewriteCtxMethods(importState, [expr]);
        }
      }
    } else if (node.isKind(SyntaxKind.VariableStatement)) {
      const decls = node.getDeclarations();
      for (let i = 0; i < decls.length; i++) {
        const decl = decls[i];
        const init = decl.getInitializer();
        if (init !== undefined) {
          rewriteCtxMethods(importState, [init]);
        }
      }
    } else if (
      node.isKind(SyntaxKind.ExpressionStatement) ||
      node.isKind(SyntaxKind.AwaitExpression) ||
      node.isKind(SyntaxKind.CallExpression)
    ) {
      const expr = node.getExpression();
      rewriteCtxMethods(importState, [expr]);
    } else if (node.isKind(SyntaxKind.BinaryExpression)) {
      rewriteCtxMethods(importState, [node.getLeft()]);
      rewriteCtxMethods(importState, [node.getRight()]);
    } else if (
      !node.isKind(SyntaxKind.ExpressionStatement) &&
      node.getKindName().endsWith("Statement")
    ) {
      const inner = node.getDescendantStatements();
      rewriteCtxMethods(importState, inner);
    }
  }
}

function rewriteCtxMemberName(
  node: tsmorph.PropertyAccessExpression,
) {
  const children = node.getChildren();
  if (children.length === 0) return;

  if (
    node.getExpression().getText() === "ctx" &&
    node.getName() === "remoteAddr"
  ) {
    node.getExpression().replaceWithText("ctx.info.remoteAddr");
  } else if (children[0].isKind(SyntaxKind.PropertyAccessExpression)) {
    rewriteCtxMemberName(children[0]);
  }
}
