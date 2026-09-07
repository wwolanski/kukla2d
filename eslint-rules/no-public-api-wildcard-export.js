import { architectureMessages } from "./lint-registry.js";
import { moduleRootForPublicApi } from "./module-public-api.js";

export default {
  meta: {
    type: "problem",
    docs: {
      description:
        "Disallow wildcard re-exports from a module root public API.",
    },
    schema: [],
    messages: {
      wildcardExport: architectureMessages.publicApiWildcardExport.message,
    },
  },

  create(context) {
    const filename = context.physicalFilename ?? context.filename;
    if (!moduleRootForPublicApi(filename)) return {};

    return {
      ExportAllDeclaration(node) {
        context.report({ node, messageId: "wildcardExport" });
      },
    };
  },
};
