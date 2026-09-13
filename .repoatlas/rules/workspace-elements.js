export function createWorkspaceElements({ packages = "packages" } = {}) {
  return [
    {
      type: "workspace-package-contract-consumer",
      pattern: [`${packages}/engine/src`, `${packages}/platform-browser/src`],
      partialMatch: false,
    },
    {
      type: "workspace-package-isolated",
      pattern: [
        `${packages}/application/src`,
        `${packages}/contracts/src`,
        `${packages}/document/src`,
        `${packages}/math2d/src`,
        `${packages}/modular-sprite-schema/src`,
        `${packages}/adapters/*/src`,
      ],
      partialMatch: false,
    },
  ];
}
