import { defineMessage } from "repoatlas/extension";

export const canvasUiToLegacyIo = defineMessage({
  code: "ARCH-RS-5",
  summary: "Canvas UI must not depend directly on legacy I/O modules.",
  reason:
    "Presentation code must reach PSD/project-file operations through Application instead of bypassing the feature boundary.",
  fix: "Call a Canvas Application operation or introduce an Application port implemented by the I/O adapter.",
  executors: [
    {
      provider: "eslint-plugin-boundaries",
      integration: "eslint-plugin",
      rule: "boundaries/dependencies",
      file: "eslint.config.js",
    },
  ],
});
