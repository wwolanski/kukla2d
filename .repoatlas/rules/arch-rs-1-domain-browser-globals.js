import { repositoryPolicyMessages } from "../registry/index.js";

export function createArchRs1Block({ source, features } = {}) {
  return {
    files: [
      `${source}/domain/**/*.{js,jsx,ts,tsx}`,
      `${features}/*/domain/**/*.{js,jsx,ts,tsx}`,
    ],
    rules: {
      "no-restricted-globals": [
        "error",
        {
          globals: ["window", "document", "Worker", "Image"].map((name) => ({
            name,
            message: repositoryPolicyMessages.domainBrowserGlobal.message,
          })),
        },
      ],
    },
  };
}
