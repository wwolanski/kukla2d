import { defineMessage } from "repoatlas/extension";

export const workspacePackageDependency = defineMessage({
  code: "ARCH-RS-3",
  summary: "Workspace package dependency is not allowed by the package matrix.",
  reason:
    "Low-level contracts, utilities, and adapters must not acquire undeclared inward or sideways workspace dependencies.",
  fix: "Remove the dependency or explicitly revise the documented package matrix; only engine and platform-browser may currently depend on @kukla2d/contracts.",
  executors: [
    {
      provider: "eslint-plugin-boundaries",
      integration: "eslint-plugin",
      rule: "boundaries/dependencies",
      file: "eslint.config.js",
    },
  ],
});
