import { repositoryPolicyMessages } from "../registry/index.js";

export function createArchRs2Policy({ alias = "@" } = {}) {
  return {
    from: {
      element: {
        type: ["feature-application", "feature-infrastructure", "feature-ui"],
        captured: { feature: "modular-sprite" },
      },
    },
    disallow: { dependency: { source: `${alias}/store/**` } },
    message: repositoryPolicyMessages.modularSpriteToGlobalStore.message,
  };
}
