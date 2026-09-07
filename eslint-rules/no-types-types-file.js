import path from "node:path";

import {
  isInsideTypesDirectory,
  isTypeScriptImplementationFile,
} from "./type-file-utils.js";
import { typesMessages } from "./lint-registry.js";

export default {
  meta: {
    type: "problem",
    docs: {
      description: "Disallow types.ts inside a types directory tree.",
    },
    schema: [],
    messages: {
      genericTypesFileName: typesMessages.genericTypesFileName.message,
    },
  },

  create(context) {
    const filename = context.physicalFilename ?? context.filename;
    if (
      !isTypeScriptImplementationFile(filename) ||
      path.basename(filename) !== "types.ts" ||
      !isInsideTypesDirectory(filename)
    )
      return {};

    return {
      Program(node) {
        context.report({
          node,
          messageId: "genericTypesFileName",
        });
      },
    };
  },
};
