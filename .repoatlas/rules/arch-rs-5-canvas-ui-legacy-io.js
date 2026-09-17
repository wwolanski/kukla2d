import { repositoryPolicyMessages } from "../registry/index.js";

export function createArchRs5Policy({ alias = "@" } = {}) {
  return {
    from: {
      element: {
        type: "feature-ui",
        captured: { feature: "canvas" },
      },
    },
    disallow: {
      dependency: {
        source: [
          `${alias}/io/psd`,
          `${alias}/io/psd/**`,
          `${alias}/io/projectFile`,
          `${alias}/io/projectFile/**`,
        ],
      },
    },
    message: repositoryPolicyMessages.canvasUiToLegacyIo.message,
  };
}
