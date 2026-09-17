import { defineMessage } from "repoatlas/extension";

export const modularSpriteToGlobalStore = defineMessage({
  code: "ARCH-RS-2",
  summary:
    "Modular Sprite inner layers must not depend on the app-global store.",
  reason:
    "This module has an explicit ports-based composition boundary and must remain independently composable.",
  fix: "Pass the required capability through a Domain/Application port and connect it in modular-sprite/composition.",
  executors: [
    {
      provider: "eslint-plugin-boundaries",
      integration: "eslint-plugin",
      rule: "boundaries/dependencies",
      file: "eslint.config.js",
    },
  ],
});
