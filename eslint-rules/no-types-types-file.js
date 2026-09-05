import path from "node:path";

import {
  isInsideTypesDirectory,
  isTypeScriptImplementationFile,
} from "./type-file-utils.js";

export default {
  meta: {
    type: "problem",
    docs: {
      description: "Disallow types.ts inside a types directory tree.",
    },
    schema: [],
    messages: {
      genericTypesFileName:
        'TYPE-006: A file inside a types/ tree must not be named types.ts.\nReason: The types/ directory already communicates the category, so "types.ts" provides no meaningful grouping information.\nFix: Rename the file to describe the contained contract group, for example contracts.ts, api.ts, processing.ts, or another domain-specific name.',
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
