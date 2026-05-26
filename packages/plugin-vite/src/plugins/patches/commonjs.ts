import type { NodePath, PluginObj, types } from "@babel/core";
import { builtinModules } from "node:module";

const BUILTINS = new Set(builtinModules);

export function cjsPlugin(
  { types: t }: { types: typeof types },
): PluginObj {
  const HAS_ES_MODULE = "esModule";
  const REQUIRE_CALLS = "requireCalls";
  const ROOT_SCOPE = "rootScope";
  const EXPORTED = "exported";
  const EXPORTED_NAMESPACES = "exported_namespaces";
  const ALIASED = "aliased";
  const REEXPORT = "re-export";
  const NEEDS_REQUIRE_IMPORT = "needsRequireImport";
  const NEEDS_DIRNAME_IMPORT = "needsDirnameImport";
  const IS_ESM = "isESM";

  return {
    name: "fresh-cjs-esm",
    pre(file) {
      const filename = file.opts.filename;
      if (filename) {
        if (filename.endsWith(".mjs") || filename.endsWith(".mts")) {
          this.set(IS_ESM, true);
        } else if (filename.endsWith(".cjs") || filename.endsWith(".cts")) {
          this.set(IS_ESM, false);
        }
      }
    },
    visitor: {
      Program: {
        enter(path, state) {
          state.set(ROOT_SCOPE, path.scope);
          state.set(EXPORTED, new Set<string>());
          state.set(EXPORTED_NAMESPACES, new Set<string>());
          state.set(REEXPORT, null);

          path.traverse({
            Import(_path, state) {
              state.set(IS_ESM, true);
            },
            ImportDeclaration(_path, state) {
              state.set(IS_ESM, true);
            },
            ExportAllDeclaration(_path, state) {
              state.set(IS_ESM, true);
            },
            ExportDefaultDeclaration(_path, state) {
              state.set(IS_ESM, true);
            },
            ExportNamedDeclaration(_path, state) {
              state.set(IS_ESM, true);
            },
          }, state);
        },
        exit(path, state) {
          const isESM = state.get(IS_ESM);
          if (isESM) return;

          const body = path.get("body");
          const requires = state.get(REQUIRE_CALLS);
          if (requires !== undefined) {
            for (let i = 0; i < requires.length; i++) {
              const { specifier, id } = requires[i];
              path.unshiftContainer(
                "body",
                t.importDeclaration(
                  [t.importNamespaceSpecifier(id)],
                  specifier,
                ),
              );
            }
          }

          const reexport = state.get(REEXPORT);
          const exported = state.get(EXPORTED);
          const exportedNs = state.get(EXPORTED_NAMESPACES);
          const needsRequireImport = state.get(NEEDS_REQUIRE_IMPORT);
          const hasEsModule = state.get(HAS_ES_MODULE);

          if (needsRequireImport) {
            // Inject:
            // ```ts
            // import { createRequire } from "node:module";
            // const require = createRequire(import.meta.url);
            // ```
            const id = t.identifier("createRequire");
            path.unshiftContainer(
              "body",
              t.variableDeclaration("const", [
                t.variableDeclarator(
                  t.identifier("require"),
                  t.callExpression(t.identifier("createRequire"), [
                    t.memberExpression(
                      t.metaProperty(
                        t.identifier("import"),
                        t.identifier("meta"),
                      ),
                      t.identifier("url"),
                    ),
                  ]),
                ),
              ]),
            );
            path.unshiftContainer(
              "body",
              t.importDeclaration(
                [t.importSpecifier(id, id)],
                t.stringLiteral("node:module"),
              ),
            );
          }

          const needsDirnameImport = state.get(NEEDS_DIRNAME_IMPORT);
          if (needsDirnameImport) {
            // Inject:
            // ```ts
            // import { fileURLToPath as __cjs_fileURLToPath } from "node:url";
            // import { dirname as __cjs_dirname } from "node:path";
            // const __filename = __cjs_fileURLToPath(import.meta.url);
            // const __dirname = __cjs_dirname(__filename);
            // ```
            const fileURLToPathId = t.identifier("__cjs_fileURLToPath");
            const dirnameId = t.identifier("__cjs_dirname");
            const importMetaUrl = t.memberExpression(
              t.metaProperty(
                t.identifier("import"),
                t.identifier("meta"),
              ),
              t.identifier("url"),
            );

            path.unshiftContainer(
              "body",
              t.variableDeclaration("var", [
                t.variableDeclarator(
                  t.identifier("__dirname"),
                  t.callExpression(dirnameId, [t.identifier("__filename")]),
                ),
              ]),
            );
            path.unshiftContainer(
              "body",
              t.variableDeclaration("var", [
                t.variableDeclarator(
                  t.identifier("__filename"),
                  t.callExpression(fileURLToPathId, [importMetaUrl]),
                ),
              ]),
            );
            path.unshiftContainer(
              "body",
              t.importDeclaration(
                [t.importSpecifier(dirnameId, t.identifier("dirname"))],
                t.stringLiteral("node:path"),
              ),
            );
            path.unshiftContainer(
              "body",
              t.importDeclaration(
                [
                  t.importSpecifier(
                    fileURLToPathId,
                    t.identifier("fileURLToPath"),
                  ),
                ],
                t.stringLiteral("node:url"),
              ),
            );
          }

          if (reexport !== null) {
            path.unshiftContainer(
              "body",
              t.exportAllDeclaration(t.cloneNode(reexport, true)),
            );
          }

          const mappedNs: string[] = [];

          for (const spec of exportedNs.values()) {
            const id = path.scope.generateUidIdentifier("__ns");
            mappedNs.push(id.name);

            path.unshiftContainer(
              "body",
              t.importDeclaration(
                [t.importNamespaceSpecifier(id)],
                t.stringLiteral(spec),
              ),
            );
          }

          if (exported.size > 0 || exportedNs.size > 0 || hasEsModule) {
            path.unshiftContainer(
              "body",
              t.expressionStatement(
                t.callExpression(
                  t.memberExpression(
                    t.identifier("Object"),
                    t.identifier("defineProperty"),
                  ),
                  [
                    t.identifier("exports"),
                    t.stringLiteral("__esModule"),
                    t.objectExpression([
                      t.objectProperty(
                        t.identifier("value"),
                        t.booleanLiteral(true),
                      ),
                    ]),
                  ],
                ),
              ),
            );
            path.unshiftContainer(
              "body",
              t.expressionStatement(
                t.callExpression(
                  t.memberExpression(
                    t.identifier("Object"),
                    t.identifier("defineProperty"),
                  ),
                  [
                    t.identifier("module"),
                    t.stringLiteral("exports"),
                    t.objectExpression([
                      t.objectMethod(
                        "method",
                        t.identifier("get"),
                        [],
                        t.blockStatement([
                          t.returnStatement(t.identifier("exports")),
                        ]),
                      ),
                      t.objectMethod(
                        "method",
                        t.identifier("set"),
                        [t.identifier("value")],
                        t.blockStatement([
                          t.expressionStatement(
                            t.assignmentExpression(
                              "=",
                              t.identifier("exports"),
                              t.identifier("value"),
                            ),
                          ),
                        ]),
                      ),
                    ]),
                  ],
                ),
              ),
            );
            path.unshiftContainer(
              "body",
              t.variableDeclaration("var", [
                t.variableDeclarator(
                  t.identifier("exports"),
                  t.objectExpression([]),
                ),
                t.variableDeclarator(
                  t.identifier("module"),
                  t.objectExpression([]),
                ),
              ]),
            );
          }

          const idExports: types.ExportSpecifier[] = [];
          for (const name of exported) {
            if (name === "default") {
              continue;
            }

            const id = path.scope.generateUidIdentifier(name);

            path.pushContainer(
              "body",
              t.variableDeclaration(
                "var",
                [t.variableDeclarator(
                  id,
                  t.memberExpression(
                    t.identifier("exports"),
                    t.identifier(name),
                  ),
                )],
              ),
            );
            idExports.push(
              t.exportSpecifier(id, t.identifier(name)),
            );
          }

          if (idExports.length > 0) {
            path.pushContainer(
              "body",
              t.exportNamedDeclaration(null, idExports),
            );
          }

          if (exported.size > 0 || exportedNs.size > 0 || hasEsModule) {
            const id = path.scope.generateUidIdentifier("__default");

            // Use `var` instead of `const` to avoid TDZ errors when
            // Rollup reorders declarations in the bundled output.
            path.pushContainer(
              "body",
              t.variableDeclaration("var", [
                t.variableDeclarator(
                  id,
                ),
              ]),
            );

            path.pushContainer(
              "body",
              t.ifStatement(
                t.logicalExpression(
                  "&&",
                  t.logicalExpression(
                    "&&",
                    t.binaryExpression(
                      "===",
                      t.unaryExpression("typeof", t.identifier("exports")),
                      t.stringLiteral("object"),
                    ),
                    t.binaryExpression(
                      "!==",
                      t.identifier("exports"),
                      t.nullLiteral(),
                    ),
                  ),
                  t.binaryExpression(
                    "in",
                    t.stringLiteral("default"),
                    t.identifier("exports"),
                  ),
                ),
                t.blockStatement([
                  t.expressionStatement(
                    t.assignmentExpression(
                      "=",
                      id,
                      t.memberExpression(
                        t.identifier("exports"),
                        t.identifier("default"),
                      ),
                    ),
                  ),
                ]),
                t.blockStatement([
                  t.expressionStatement(
                    t.assignmentExpression("=", id, t.identifier("exports")),
                  ),
                ]),
              ),
            );

            for (let i = 0; i < mappedNs.length; i++) {
              const mapped = mappedNs[i];

              const key = path.scope.generateUid("k");
              // Only spread namespace properties when the module has no
              // explicit default export (i.e. "default" not in exports).
              path.pushContainer(
                "body",
                t.ifStatement(
                  t.logicalExpression(
                    "&&",
                    t.logicalExpression(
                      "&&",
                      t.binaryExpression(
                        "===",
                        t.unaryExpression("typeof", t.identifier("exports")),
                        t.stringLiteral("object"),
                      ),
                      t.binaryExpression(
                        "!==",
                        t.identifier("exports"),
                        t.nullLiteral(),
                      ),
                    ),
                    t.unaryExpression(
                      "!",
                      t.binaryExpression(
                        "in",
                        t.stringLiteral("default"),
                        t.identifier("exports"),
                      ),
                    ),
                  ),
                  t.forInStatement(
                    t.variableDeclaration("var", [
                      t.variableDeclarator(t.identifier(key)),
                    ]),
                    t.identifier(mapped),
                    t.ifStatement(
                      t.logicalExpression(
                        "&&",
                        t.logicalExpression(
                          "&&",
                          t.binaryExpression(
                            "!==",
                            t.identifier(key),
                            t.stringLiteral("default"),
                          ),
                          t.binaryExpression(
                            "!==",
                            t.identifier(key),
                            t.stringLiteral("__esModule"),
                          ),
                        ),
                        t.callExpression(
                          t.memberExpression(
                            t.memberExpression(
                              t.memberExpression(
                                t.identifier("Object"),
                                t.identifier("prototype"),
                              ),
                              t.identifier("hasOwnProperty"),
                            ),
                            t.identifier("call"),
                          ),
                          [t.identifier(mapped), t.identifier(key)],
                        ),
                      ),
                      t.expressionStatement(
                        t.assignmentExpression(
                          "=",
                          t.memberExpression(
                            t.cloneNode(id, true),
                            t.identifier(key),
                            true,
                          ),
                          t.memberExpression(
                            t.identifier(mapped),
                            t.identifier(key),
                            true,
                          ),
                        ),
                      ),
                    ),
                  ),
                ),
              );
            }

            path.pushContainer("body", t.exportDefaultDeclaration(id));
            path.pushContainer(
              "body",
              t.exportNamedDeclaration(
                t.variableDeclaration("var", [
                  t.variableDeclarator(
                    t.identifier("__require"),
                    t.identifier("exports"),
                  ),
                ]),
              ),
            );
          }

          if (body.length === 0 && hasEsModule) {
            path.pushContainer("body", t.exportNamedDeclaration(null));
          } else if (hasEsModule) {
            path.pushContainer(
              "body",
              t.exportNamedDeclaration(
                t.variableDeclaration(
                  "var",
                  [t.variableDeclarator(
                    t.identifier("__esModule"),
                    t.memberExpression(
                      t.identifier("exports"),
                      t.identifier("__esModule"),
                    ),
                  )],
                ),
              ),
            );
          }
        },
      },
      CallExpression(path, state) {
        if (state.get(IS_ESM)) return;
        const exported = state.get(EXPORTED);

        if (isObjEsModuleFlag(t, path.node)) {
          state.set(HAS_ES_MODULE, true);
          return;
        }

        // Handle require.resolve() by injecting createRequire
        if (
          t.isMemberExpression(path.node.callee) &&
          t.isIdentifier(path.node.callee.object) &&
          path.node.callee.object.name === "require" &&
          t.isIdentifier(path.node.callee.property) &&
          path.node.callee.property.name === "resolve"
        ) {
          state.set(NEEDS_REQUIRE_IMPORT, true);
          return;
        }

        if (
          t.isIdentifier(path.node.callee) &&
          path.node.callee.name === "require"
        ) {
          const root = state.get(ROOT_SCOPE);
          const id = root.generateUidIdentifier("mod");

          const mods = state.get(REQUIRE_CALLS) ?? [];
          state.set(REQUIRE_CALLS, mods);

          const source = path.node.arguments[0];
          if (t.isStringLiteral(source)) {
            // Check if we can hoist it or if we need to keep it.
            let canImport = true;
            let parent: NodePath | null = path.parentPath;
            while (parent !== null) {
              if (
                t.isTryStatement(parent.node) || t.isIfStatement(parent.node) ||
                t.isConditionalExpression(parent.node)
              ) {
                canImport = false;
                break;
              }
              parent = parent.parentPath;
            }

            if (!canImport) {
              state.set(NEEDS_REQUIRE_IMPORT, true);
              return;
            }

            mods.push({
              id,
              specifier: t.cloneNode(path.node.arguments[0], true),
            });

            if (
              path.parentPath?.isVariableDeclarator() &&
                path.parentPath?.get("id").isIdentifier() ||
              path.parentPath?.isCallExpression()
            ) {
              // Vite json processing always adds a default property.
              if (source.value.endsWith(".json")) {
                path.replaceWith(
                  t.logicalExpression(
                    "??",
                    t.memberExpression(
                      t.cloneNode(id, true),
                      t.identifier("default"),
                    ),
                    t.cloneNode(id, true),
                  ),
                );
              } else if (
                path.parentPath?.isCallExpression() &&
                t.isIdentifier(path.parentPath.node.callee) &&
                path.parentPath.node.callee.name === "__importDefault"
              ) {
                if (isNodeBuiltin(source.value)) {
                  path.replaceWith(t.objectExpression([
                    t.objectProperty(
                      t.identifier("__esModule"),
                      t.booleanLiteral(true),
                    ),
                    t.objectProperty(
                      t.identifier("default"),
                      t.logicalExpression(
                        "??",
                        t.memberExpression(
                          t.cloneNode(id, true),
                          t.identifier("default"),
                        ),
                        t.cloneNode(id, true),
                      ),
                    ),
                  ]));
                } else {
                  path.replaceWith(t.cloneNode(id, true));
                }
              } else {
                path.replaceWith(
                  t.logicalExpression(
                    "??",
                    t.memberExpression(
                      t.cloneNode(id, true),
                      t.identifier("__require"),
                    ),
                    t.logicalExpression(
                      "??",
                      t.memberExpression(
                        t.cloneNode(id, true),
                        t.identifier("default"),
                      ),
                      t.cloneNode(id, true),
                    ),
                  ),
                );
              }
              return;
            }

            path.replaceWith(t.cloneNode(id, true));
          } else {
            state.set(NEEDS_REQUIRE_IMPORT, true);
          }
        } else if (
          t.isMemberExpression(path.node.callee) &&
          t.isIdentifier(path.node.callee.object) &&
          path.node.callee.object.name === "Object" &&
          t.isIdentifier(path.node.callee.property) &&
          path.node.callee.property.name === "defineProperty" &&
          path.node.arguments.length > 0 &&
          t.isIdentifier(path.node.arguments[0]) &&
          path.node.arguments[0].name === "exports" &&
          t.isStringLiteral(path.node.arguments[1])
        ) {
          const name = path.node.arguments[1].value;
          exported.add(name);
        }
      },
      EmptyStatement(path) {
        path.remove();
      },
      MemberExpression: {
        exit(path, state) {
          if (state.get(IS_ESM)) return;
          if (
            t.isIdentifier(path.node.property) &&
            path.node.property.name !== "__esModule"
          ) {
            // Track both `exports.X` and `module.exports.X`
            if (
              t.isIdentifier(path.node.object) &&
              path.node.object.name === "exports"
            ) {
              state.get(EXPORTED).add(path.node.property.name);
            } else if (
              t.isMemberExpression(path.node.object) &&
              isModuleExports(t, path.node.object)
            ) {
              state.get(EXPORTED).add(path.node.property.name);
            }
          }
        },
      },
      ExpressionStatement: {
        enter(path, state) {
          if (state.get(IS_ESM)) return;
          // Check: Object.defineProperty(module.exports) "__esModule" ...)
          // Check: Object.defineProperty(exports) "__esModule" ...)
          // Check: a({}, "__esModule", ...)
          if (
            t.isCallExpression(path.node.expression) &&
            path.node.expression.arguments.length === 3 &&
            t.isStringLiteral(path.node.expression.arguments[1]) &&
            path.node.expression.arguments[1].value === "__esModule"
          ) {
            state.set(HAS_ES_MODULE, true);
            return;
          }

          if (
            t.isExpressionStatement(path.node) &&
            t.isCallExpression(path.node.expression) &&
            t.isIdentifier(path.node.expression.callee) &&
            path.node.expression.callee.name === "__exportStar" &&
            path.node.expression.arguments.length > 0 &&
            t.isCallExpression(path.node.expression.arguments[0]) &&
            t.isIdentifier(path.node.expression.arguments[0].callee) &&
            path.node.expression.arguments[0].callee.name === "require" &&
            t.isStringLiteral(path.node.expression.arguments[0].arguments[0])
          ) {
            const spec = t.cloneNode(
              path.node.expression.arguments[0].arguments[0],
              true,
            );
            state.get(EXPORTED_NAMESPACES).add(spec.value);
            path.replaceWith(t.exportAllDeclaration(spec));
          } else if (
            t.isExpressionStatement(path.node) &&
            t.isCallExpression(path.node.expression) &&
            t.isFunctionExpression(path.node.expression.callee)
          ) {
            if (
              path.node.expression.callee.params.length > 0 &&
              t.isIdentifier(path.node.expression.callee.params[0])
            ) {
              const alias = path.node.expression.callee.params[0].name;
              state.set(ALIASED, alias);
            }
          } else if (
            // Check: Object.defineProperty(exports, "foo", { enumerable: true, get: function () { return foo; } });
            t.isCallExpression(path.node.expression) &&
            t.isMemberExpression(path.node.expression.callee) &&
            t.isIdentifier(path.node.expression.callee.object) &&
            path.node.expression.callee.object.name === "Object" &&
            t.isIdentifier(path.node.expression.callee.property) &&
            path.node.expression.callee.property.name === "defineProperty" &&
            path.node.expression.arguments.length >= 2 &&
            t.isIdentifier(path.node.expression.arguments[0]) &&
            path.node.expression.arguments[0].name === "exports" &&
            t.isStringLiteral(path.node.expression.arguments[1]) &&
            t.isObjectExpression(path.node.expression.arguments[2])
          ) {
            const exported = path.node.expression.arguments[1].value;
            const obj = path.node.expression.arguments[2];
            for (let i = 0; i < obj.properties.length; i++) {
              const prop = obj.properties[i];

              if (
                t.isObjectProperty(prop) && t.isIdentifier(prop.key) &&
                prop.key.name === "get" && t.isFunctionExpression(prop.value) &&
                t.isBlockStatement(prop.value.body) &&
                prop.value.body.body.length === 1 &&
                t.isReturnStatement(prop.value.body.body[0])
              ) {
                const expr = prop.value.body.body[0].argument;
                if (expr !== null && expr !== undefined) {
                  path.replaceWith(
                    t.assignmentExpression(
                      "=",
                      t.memberExpression(
                        t.identifier("exports"),
                        t.identifier(exported),
                      ),
                      t.cloneNode(expr, true),
                    ),
                  );
                }
              } else if (
                t.isObjectMethod(prop) && t.isIdentifier(prop.key) &&
                prop.key.name === "get" && t.isBlockStatement(prop.body) &&
                prop.body.body.length === 1 &&
                t.isReturnStatement(prop.body.body[0])
              ) {
                const expr = prop.body.body[0].argument;
                if (expr !== null && expr !== undefined) {
                  path.replaceWith(
                    t.assignmentExpression(
                      "=",
                      t.memberExpression(
                        t.identifier("exports"),
                        t.identifier(exported),
                      ),
                      t.cloneNode(expr, true),
                    ),
                  );
                }
              }
            }
          } else if (
            // Check: module.exports = require(...)
            t.isAssignmentExpression(path.node.expression) &&
            t.isMemberExpression(path.node.expression.left) &&
            t.isIdentifier(path.node.expression.left.object) &&
            t.isIdentifier(path.node.expression.left.property) &&
            path.node.expression.left.object.name === "module" &&
            path.node.expression.left.property.name === "exports" &&
            t.isCallExpression(path.node.expression.right) &&
            t.isIdentifier(path.node.expression.right.callee) &&
            path.node.expression.right.callee.name === "require" &&
            path.node.expression.right.arguments.length === 1 &&
            t.isStringLiteral(path.node.expression.right.arguments[0])
          ) {
            const source = path.node.expression.right.arguments[0];
            state.set(REEXPORT, source);
          } else {
            let depth = 0;
            let current = path.node.expression;

            while (
              t.isAssignmentExpression(current) &&
              t.isMemberExpression(current.left) &&
              t.isIdentifier(current.left.object) &&
              current.left.object.name === "exports"
            ) {
              if (
                t.isUnaryExpression(current.right) &&
                current.right.operator === "void" &&
                t.isNumericLiteral(current.right.argument) &&
                current.right.argument.value === 0
              ) {
                if (depth > 0) {
                  path.remove();
                }

                break;
              }

              depth++;
              current = current.right;
            }
          }
        },
        exit(path, state) {
          if (state.get(IS_ESM)) return;
          const exported = state.get(EXPORTED);
          const expr = path.get("expression");

          if (expr.isAssignmentExpression()) {
            const left = expr.get("left");

            if (isEsModuleFlag(t, expr.node)) {
              state.set(HAS_ES_MODULE, true);
            } else if (left.isMemberExpression()) {
              if (isModuleExports(t, left.node)) {
                // Should always try to create synthetic default export in this case.
                exported.add("default");

                if (t.isObjectExpression(expr.node.right)) {
                  const properties = expr.node.right.properties;
                  for (let i = 0; i < properties.length; i++) {
                    const prop = properties[i];
                    if (t.isObjectProperty(prop)) {
                      if (t.isIdentifier(prop.key)) {
                        if (prop.key.name === "__esModule") {
                          continue;
                        }

                        exported.add(prop.key.name);
                      }
                    }
                  }
                }
              } else {
                const named = getExportsAssignName(t, left.node);
                if (named === null) return;
                exported.add(named);
              }
            }
          } else if (expr.isCallExpression()) {
            if (isObjEsModuleFlag(t, expr.node)) {
              state.set(HAS_ES_MODULE, true);
            }
          }
        },
      },
      VariableDeclaration(path) {
        if (path.node.declarations.length === 0) {
          path.remove();
        }
      },
      ConditionalExpression(path, state) {
        if (state.get(IS_ESM)) return;

        if (
          t.isBinaryExpression(path.node.test) &&
          t.isUnaryExpression(path.node.test.left) &&
          path.node.test.left.operator === "typeof" &&
          t.isIdentifier(path.node.test.left.argument) &&
          path.node.test.left.argument.name === "exports" &&
          path.node.test.operator === "==="
        ) {
          path.replaceWith(t.cloneNode(path.node.alternate, true));
        }
      },
      Identifier(path, state) {
        if (state.get(IS_ESM)) return;

        const name = path.node.name;
        if (name !== "__dirname" && name !== "__filename") return;

        // Skip if this is already a declaration (e.g. our own polyfill)
        if (
          path.parentPath?.isVariableDeclarator() &&
          path.parentPath.get("id") === path
        ) return;

        state.set(NEEDS_DIRNAME_IMPORT, true);
      },
      AssignmentExpression(path, state) {
        if (state.get(IS_ESM)) return;

        const exported = state.get(EXPORTED);
        const aliased = state.get(ALIASED);
        if (aliased === undefined) return;

        if (
          path.node.operator === "=" && t.isMemberExpression(path.node.left) &&
          t.isIdentifier(path.node.left.object) &&
          path.node.left.object.name === aliased &&
          t.isIdentifier(path.node.left.property)
        ) {
          const name = path.node.left.property.name;
          exported.add(name);
        }
      },
    },
  };
}

function isModuleExports(
  t: typeof types,
  node: types.MemberExpression,
): boolean {
  return t.isIdentifier(node.object) && node.object.name === "module" &&
    t.isIdentifier(node.property) && node.property.name === "exports";
}

function getExportsAssignName(
  t: typeof types,
  node: types.MemberExpression,
): string | null {
  if (
    (t.isMemberExpression(node.object) &&
        isModuleExports(t, node.object) ||
      t.isIdentifier(node.object) && node.object.name === "exports") &&
    t.isIdentifier(node.property)
  ) {
    return node.property.name;
  }

  return null;
}

/**
 * Detect `exports.__esModule = true;`
 */
function isEsModuleFlag(
  t: typeof types,
  node: types.AssignmentExpression,
): boolean {
  if (!t.isMemberExpression(node.left)) return false;

  const { left, right } = node;
  return (t.isMemberExpression(left.object) &&
      isModuleExports(t, left.object) ||
    t.isIdentifier(left.object) && left.object.name === "exports") &&
    t.isIdentifier(left.property) && left.property.name === "__esModule" &&
    t.isBooleanLiteral(right);
}

/**
 * Check for `Object.defineProperty(exports, '__esModule', { value: true })`
 */
function isObjEsModuleFlag(
  t: typeof types,
  node: types.CallExpression,
): boolean {
  return node.arguments.length === 3 &&
    t.isStringLiteral(node.arguments[1]) &&
    node.arguments[1].value === "__esModule" &&
    t.isObjectExpression(node.arguments[2]);
}

function isNodeBuiltin(specifier: string): boolean {
  return BUILTINS.has(specifier) || (
    specifier.startsWith("node:")
      ? BUILTINS.has(specifier.slice("node:".length))
      : BUILTINS.has(`node:${specifier}`)
  );
}
