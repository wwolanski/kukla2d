import { repositoryPolicyMessages } from "../registry/index.js";

export function createArchRs3Policies() {
  const message = repositoryPolicyMessages.workspacePackageDependency.message;
  return [
    {
      from: { element: { type: "workspace-package-isolated" } },
      disallow: { dependency: { source: "@kukla2d/**" } },
      message,
    },
    {
      from: {
        element: { type: "workspace-package-contract-consumer" },
      },
      disallow: {
        dependency: {
          source: ["@kukla2d/!(contracts)", "@kukla2d/!(contracts)/**"],
        },
      },
      message,
    },
  ];
}
