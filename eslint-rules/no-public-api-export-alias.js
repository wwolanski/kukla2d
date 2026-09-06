import { architectureMessages } from "./lint-registry.js";
import { moduleRootForPublicApi } from "./module-public-api.js";

function nodeName(node) {
  if (node?.type === "Identifier") return node.name;
  if (node?.type === "Literal") return String(node.value);
  return null;
}

export default {
  meta: {
    type: "problem",
    docs: {
      description: "Disallow renamed exports from a module root public API.",
    },
    schema: [],
    messages: {
      exportAlias: architectureMessages.publicApiExportAlias.message,
    },
  },

  create(context) {
    const filename = context.physicalFilename ?? context.filename;
    if (!moduleRootForPublicApi(filename)) return {};

    return {
      ExportNamedDeclaration(node) {
        for (const specifier of node.specifiers) {
          if (specifier.type !== "ExportSpecifier") continue;
          const localName = nodeName(specifier.local);
          const exportedName = nodeName(specifier.exported);
          if (!localName || !exportedName || localName === exportedName)
            continue;

          context.report({
            node: specifier,
            messageId: "exportAlias",
            data: { exportedName, localName },
          });
        }
      },
    };
  },
};
