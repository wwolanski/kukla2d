import { repositoryPolicyMessages } from "../registry/index.js";

export function createArchRs4Policy({ alias = "@" } = {}) {
  return {
    from: { element: { type: ["app-composition", "feature-ui"] } },
    disallow: {
      dependency: {
        source: [`${alias}/components/!(ui)`, `${alias}/components/!(ui)/**`],
      },
    },
    message: repositoryPolicyMessages.legacyFeatureComponent.message,
  };
}
