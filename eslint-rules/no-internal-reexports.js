import path from "node:path";

import { architectureMessages } from "./lint-registry.js";
import { isDesignatedPublicApi } from "./module-public-api.js";

function nodeName(node) {
  if (node?.type === "Identifier") return node.name;
  if (node?.type === "Literal") return String(node.value);
  return null;
}

function importedBindings(program) {
  const bindings = new Map();

  for (const statement of program.body) {
    if (statement.type !== "ImportDeclaration") continue;
    const source = String(statement.source.value);
    for (const specifier of statement.specifiers) {
      bindings.set(specifier.local.name, source);
    }
  }

  return bindings;
}

export default {
  meta: {
    type: "problem",
    docs: {
      description:
        "Reserve re-exports for designated feature and package public APIs.",
    },
    schema: [],
    messages: {
      internalReExport: architectureMessages.internalReExport.message,
    },
  },

  create(context) {
    const filename = context.physicalFilename ?? context.filename;
    const cwd = context.cwd ?? process.cwd();
    if (isDesignatedPublicApi(filename, cwd)) return {};

    let bindings = new Map();
    const report = (node, symbol, source) => {
      context.report({
        node,
        messageId: "internalReExport",
        data: {
          forwardingFile: pathForMessage(filename, cwd),
          source,
          symbol,
        },
      });
    };

    return {
      Program(node) {
        bindings = importedBindings(node);
      },

      ExportAllDeclaration(node) {
        const symbol = nodeName(node.exported) ?? "*";
        report(node, symbol, String(node.source.value));
      },

      ExportNamedDeclaration(node) {
        if (node.source) {
          const source = String(node.source.value);
          for (const specifier of node.specifiers) {
            const symbol =
              nodeName(specifier.exported) ?? nodeName(specifier.local) ?? "*";
            report(specifier, symbol, source);
          }
          return;
        }

        for (const specifier of node.specifiers) {
          const localName = nodeName(specifier.local);
          const source = localName ? bindings.get(localName) : undefined;
          if (!source) continue;
          report(specifier, nodeName(specifier.exported) ?? localName, source);
        }
      },

      ExportDefaultDeclaration(node) {
        if (node.declaration.type !== "Identifier") return;
        const source = bindings.get(node.declaration.name);
        if (source) report(node.declaration, "default", source);
      },
    };
  },
};

function pathForMessage(filename, cwd) {
  const relative = path.relative(cwd, filename).split(path.sep).join("/");
  return relative.startsWith("..") ? filename : relative;
}
