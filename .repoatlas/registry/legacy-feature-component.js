import { defineMessage } from "repoatlas/extension";

export const legacyFeatureComponent = defineMessage({
  code: "ARCH-RS-4",
  summary: "Legacy feature component imports are forbidden.",
  reason:
    "Feature-owned UI belongs under src/features/<feature>, while src/components is reserved for shared UI primitives.",
  fix: "Import through the feature public API or move the component to its owning feature.",
  executors: [
    {
      provider: "eslint-plugin-boundaries",
      integration: "eslint-plugin",
      rule: "boundaries/dependencies",
      file: "eslint.config.js",
    },
  ],
});
