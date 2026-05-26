import type { NodePath, PluginObj, types } from "@babel/core";

export function inlineEnvVarsPlugin(mode: string, env: Record<string, string>) {
  const allowed = new Map<string, string>();
  for (const [name, value] of Object.entries(env)) {
    if (name.startsWith("FRESH_PUBLIC_")) {
      allowed.set(name, value);
    }
  }

  allowed.set("NODE_ENV", mode);

  return (
    { types: t }: { types: typeof types },
  ): PluginObj => {
    function replace(path: NodePath, name: string) {
      if (allowed.has(name)) {
        const value = allowed.get(name);

        if (value !== undefined) {
          path.replaceWith(t.stringLiteral(value));
        } else {
          path.replaceWith(t.identifier("undefined"));
        }
      }
    }

    return {
      name: "fresh-env-var",
      visitor: {
        MemberExpression(path) {
          // Check: process.env.*
          if (
            t.isMemberExpression(path.node.object) &&
            t.isIdentifier(path.node.object.object) &&
            path.node.object.object.name === "process" &&
            t.isIdentifier(path.node.object.property) &&
            path.node.object.property.name === "env" &&
            t.isIdentifier(path.node.property)
          ) {
            const name = path.node.property.name;
            replace(path, name);
          }

          // Check: import.meta.env.*
          if (
            t.isIdentifier(path.node.property) &&
            t.isMemberExpression(path.node.object) &&
            t.isIdentifier(path.node.object.property) &&
            path.node.object.property.name === "env" &&
            t.isMetaProperty(path.node.object.object)
          ) {
            const name = path.node.property.name;
            replace(path, name);
          }
        },
        CallExpression(path) {
          // Check: Deno.env.get("<string>")
          if (
            t.isMemberExpression(path.node.callee) &&
            t.isMemberExpression(path.node.callee.object) &&
            t.isIdentifier(path.node.callee.object.object) &&
            path.node.callee.object.object.name === "Deno" &&
            t.isIdentifier(path.node.callee.object.property) &&
            path.node.callee.object.property.name === "env" &&
            t.isIdentifier(path.node.callee.property) &&
            path.node.callee.property.name === "get" &&
            path.node.arguments.length > 0 &&
            t.isStringLiteral(path.node.arguments[0])
          ) {
            const name = path.node.arguments[0].value;
            replace(path, name);
          }
        },
      },
    };
  };
}
