import { defineMessage } from "repoatlas/extension";

export const canvasMaxLines = defineMessage({
  code: "ARCH-RS-6",
  summary: "Canvas feature files must remain below the configured size limit.",
  reason:
    "Large Canvas modules become difficult to reason about and usually indicate that presentation, application, and domain responsibilities have been mixed.",
  fix: "Split the module into focused components or move non-UI behavior behind an application/domain boundary.",
  executors: [
    {
      provider: "eslint",
      integration: "core-rule",
      rule: "max-lines",
      file: "eslint.config.js",
    },
  ],
});
