import { defineMessage } from "repoatlas/extension";

export const domainBrowserGlobal = defineMessage({
  code: "ARCH-RS-1",
  summary: "Domain must not use browser runtime globals.",
  reason:
    "Domain code must be executable without DOM, Worker, or browser APIs.",
  fix: "Move browser access to Infrastructure and pass framework-independent data or a port into Domain.",
  executors: [
    {
      provider: "eslint",
      integration: "core-rule",
      rule: "no-restricted-globals",
      file: "eslint.config.js",
    },
  ],
});
