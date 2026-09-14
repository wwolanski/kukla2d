import { architectureMessage } from "./helpers.js";

export function createDomainDependencyPolicies({ alias = "@", registry } = {}) {
  const aliasPath = (suffix) => `${alias}/${suffix}`;

  return [
    {
      from: { element: { type: ["feature-domain", "shared-domain"] } },
      disallow: {
        to: {
          module: {
            origin: "external",
            source: [
              "react",
              "react/**",
              "react-dom",
              "react-dom/**",
              "@radix-ui/**",
              "@xstate/react",
              "lucide-react",
              "react-resizable-panels",
            ],
          },
        },
      },
      message: architectureMessage(
        registry,
        "domainToUiFramework",
        "Domain must not depend on UI framework modules.",
      ),
    },
    {
      from: { element: { type: ["feature-domain", "shared-domain"] } },
      disallow: {
        to: {
          module: {
            origin: "external",
            source: [
              "@kukla2d/adapter-*",
              "@kukla2d/platform-browser",
              "ag-psd",
              "gifenc",
              "jszip",
              "phaser",
              "phaser/**",
              "pixi-viewport",
              "pixi.js",
              "pixi.js/**",
            ],
          },
        },
      },
      message: architectureMessage(
        registry,
        "domainToInfrastructureFramework",
        "Domain must not depend on infrastructure framework modules.",
      ),
    },
    {
      from: {
        element: {
          type: "feature-domain",
          captured: { feature: "canvas" },
        },
      },
      disallow: { dependency: { source: aliasPath("contexts/**") } },
      message: architectureMessage(
        registry,
        "domainToUi",
        "Domain must not depend on UI modules.",
      ),
    },
    {
      from: {
        element: {
          type: "feature-domain",
          captured: { feature: "canvas" },
        },
      },
      disallow: { dependency: { source: aliasPath("io/**") } },
      message: architectureMessage(
        registry,
        "domainToInfrastructureFramework",
        "Domain must not depend on infrastructure framework modules.",
      ),
    },
  ];
}
