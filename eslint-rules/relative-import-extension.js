import { relativeImportMessages } from "./lint-registry.js";

export default {
  meta: {
    type: "problem",
    docs: {
      description: "Require emitted file extensions in relative imports.",
    },
    schema: [],
    messages: {
      missingExtension: relativeImportMessages.missingExtension.message,
    },
  },

  create(context) {
    const check = (source) => {
      const specifier = source.value;
      if (typeof specifier !== "string" || !specifier.startsWith(".")) return;
      if (/\.[a-z0-9]+(?:[?#].*)?$/i.test(specifier)) return;
      context.report({
        node: source,
        messageId: "missingExtension",
      });
    };

    return {
      ImportDeclaration: (node) => check(node.source),
      ExportAllDeclaration: (node) => check(node.source),
      ExportNamedDeclaration: (node) => {
        if (node.source) check(node.source);
      },
      ImportExpression: (node) => {
        if (node.source.type === "Literal") check(node.source);
      },
    };
  },
};
