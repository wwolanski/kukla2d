import js from "@eslint/js";
import boundaries from "eslint-plugin-boundaries";
import globals from "globals";
import react from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import { createTypeScriptImportResolver } from "eslint-import-resolver-typescript";
import { importX } from "eslint-plugin-import-x";
import tseslint from "typescript-eslint";

import noApplicationPassThroughPublicApi from "./eslint-rules/no-application-pass-through-public-api.js";
import noTypesTypesFile from "./eslint-rules/no-types-types-file.js";
import relativeImportExtensionRule from "./eslint-rules/relative-import-extension.js";
import typeDeclarationLocation from "./eslint-rules/type-declaration-location.js";
import typeFileRequiresExport from "./eslint-rules/type-file-requires-export.js";
import typeFilesOnly from "./eslint-rules/type-files-only.js";
import {
  architectureMessages,
  repositoryPolicyMessages,
  typescriptMessages,
} from "./eslint-rules/lint-registry.js";

const featureElementTypes = [
  "feature-domain",
  "feature-application",
  "feature-infrastructure",
  "feature-ui",
  "feature-composition",
  "feature-module",
];

const testOnlyFilePatterns = [
  "test/**/*.{js,jsx,ts,tsx}",
  "**/__tests__/**/*.{js,jsx,ts,tsx}",
  "**/{test,tests,fixtures,mocks,__mocks__,testing}/**/*.{js,jsx,ts,tsx}",
  "**/*.{test,spec}.{js,jsx,ts,tsx}",
];

const tsManifest = [
  "src/**/*.ts",
  "src/**/*.tsx",
  "packages/**/*.ts",
  "packages/**/*.tsx",
  "test/**/*.test.ts",
  "test/**/*.test.tsx",
  "test/types/**/*.ts",
  "test/fixtures/goldenProject.ts",
];
const localArchitectureRules = {
  rules: {
    "no-application-pass-through-public-api": noApplicationPassThroughPublicApi,
    "no-types-types-file": noTypesTypesFile,
    "type-declaration-location": typeDeclarationLocation,
    "type-file-requires-export": typeFileRequiresExport,
    "type-files-only": typeFilesOnly,
  },
};

export default [
  {
    ignores: [
      "coverage/**",
      "dist/**",
      "external_repos/**",
      "_context/**",
      "node_modules/**",
      "playwright-report/**",
      "test-results/**",
    ],
  },
  {
    files: ["src/**/*.{js,jsx,ts,tsx}", "packages/**/*.{js,jsx,ts,tsx}"],
    ignores: ["src/io/live2d/**", "packages/adapters/live2d/**"],
    settings: {
      "import-x/resolver-next": [
        createTypeScriptImportResolver({
          extensionAlias: { ".js": [".ts", ".tsx", ".js", ".jsx"] },
        }),
      ],
    },
    plugins: {
      "import-x": importX,
      "relative-import-extension": {
        rules: { "require-extension": relativeImportExtensionRule },
      },
    },
    rules: {
      "import-x/no-unresolved": "error",
      "import-x/order": [
        "error",
        {
          groups: [
            "builtin",
            "external",
            "internal",
            ["parent", "sibling", "index"],
            "type",
          ],
          pathGroups: [
            { pattern: "@kukla2d/**", group: "external", position: "after" },
            { pattern: "@/platform/**", group: "internal", position: "before" },
            { pattern: "@/store/**", group: "internal", position: "after" },
            {
              pattern: "@/{domain,runtime}/**",
              group: "internal",
              position: "after",
            },
            { pattern: "@/features/**", group: "internal", position: "after" },
            { pattern: "@/lib/**", group: "internal", position: "after" },
            {
              pattern: "@/components/ui/**",
              group: "internal",
              position: "after",
            },
          ],
          pathGroupsExcludedImportTypes: ["builtin"],
          alphabetize: { order: "asc", caseInsensitive: true },
          "newlines-between": "always",
        },
      ],
      "relative-import-extension/require-extension": "error",
      "id-denylist": ["error", "ed", "proj", "anim", "kfOv", "drOv"],
    },
  },
  {
    files: ["src/features/*/index.{ts,tsx,js,jsx}"],
    plugins: { local: localArchitectureRules },
    rules: {
      "local/no-application-pass-through-public-api": "error",
    },
  },
  {
    files: ["src/**/*.{js,jsx,ts,tsx}", "packages/**/*.{js,jsx,ts,tsx}"],
    ignores: testOnlyFilePatterns,
    plugins: { boundaries },
    settings: {
      "boundaries/root-path": import.meta.dirname,
      "boundaries/elements": [
        {
          type: "feature-domain",
          pattern: "src/features/*/domain",
          capture: ["feature"],
          partialMatch: false,
        },
        {
          type: "feature-application",
          pattern: "src/features/*/application",
          capture: ["feature"],
          partialMatch: false,
        },
        {
          type: "feature-infrastructure",
          pattern: "src/features/*/infrastructure",
          capture: ["feature"],
          partialMatch: false,
        },
        {
          type: "feature-ui",
          pattern: "src/features/*/components",
          capture: ["feature"],
          partialMatch: false,
        },
        {
          type: "feature-ui",
          pattern: "src/features/*/overlays",
          capture: ["feature"],
          partialMatch: false,
        },
        {
          // This is the feature-local composition root, not an Application/UI layer.
          type: "feature-composition",
          pattern: "src/features/*/composition",
          capture: ["feature"],
          partialMatch: false,
        },
        {
          type: "feature-module",
          pattern: "src/features/*",
          capture: ["feature"],
          partialMatch: false,
        },
        {
          type: "shared-domain",
          pattern: "src/domain",
          partialMatch: false,
        },
        {
          type: "app-composition",
          pattern: "src/app",
          partialMatch: false,
        },
        {
          type: "shared-ui",
          pattern: "src/components/ui",
          partialMatch: false,
        },
        {
          type: "src-support",
          pattern: "src",
          partialMatch: false,
        },
        {
          type: "workspace-package-contract-consumer",
          pattern: ["packages/engine/src", "packages/platform-browser/src"],
          partialMatch: false,
        },
        {
          type: "workspace-package-isolated",
          pattern: [
            "packages/application/src",
            "packages/contracts/src",
            "packages/document/src",
            "packages/math2d/src",
            "packages/modular-sprite-schema/src",
            "packages/adapters/*/src",
          ],
          partialMatch: false,
        },
      ],
      "boundaries/files": testOnlyFilePatterns.map((pattern) => ({
        category: "test-only",
        pattern,
      })),
      "import/resolver": {
        typescript: {
          extensionAlias: { ".js": [".ts", ".tsx", ".js", ".jsx"] },
        },
      },
    },
    rules: {
      "boundaries/dependencies": [
        "error",
        {
          default: "allow",
          checkAllOrigins: true,
          checkInternals: true,
          checkUnknownLocals: true,
          policies: [
            {
              from: { element: { type: "feature-domain" } },
              disallow: { to: { element: { type: "feature-application" } } },
              message: architectureMessages.domainToApplication.message,
            },
            {
              from: { element: { type: "feature-domain" } },
              disallow: { to: { element: { type: "feature-infrastructure" } } },
              message: architectureMessages.domainToInfrastructure.message,
            },
            {
              from: { element: { type: "feature-domain" } },
              disallow: { to: { element: { type: "feature-ui" } } },
              message: architectureMessages.domainToUi.message,
            },
            {
              from: { element: { type: "feature-application" } },
              disallow: { to: { element: { type: "feature-infrastructure" } } },
              message: architectureMessages.applicationToInfrastructure.message,
            },
            {
              from: { element: { type: "feature-application" } },
              disallow: { to: { element: { type: "feature-ui" } } },
              message: architectureMessages.applicationToUi.message,
            },
            {
              from: { element: { type: "feature-ui" } },
              disallow: { to: { element: { type: "feature-infrastructure" } } },
              message: architectureMessages.uiToInfrastructure.message,
            },
            {
              from: { element: { type: "feature-infrastructure" } },
              disallow: { to: { element: { type: "feature-ui" } } },
              message: architectureMessages.infrastructureToUi.message,
            },
            {
              from: { element: { type: featureElementTypes } },
              disallow: {
                to: {
                  element: {
                    type: [
                      "feature-domain",
                      "feature-application",
                      "feature-infrastructure",
                      "feature-ui",
                      "feature-composition",
                    ],
                    captured: { feature: "!{{from.element.captured.feature}}" },
                  },
                },
              },
              message: architectureMessages.crossModuleDeepImport.message,
            },
            {
              from: { element: { type: featureElementTypes } },
              disallow: {
                to: {
                  element: {
                    type: "feature-module",
                    captured: { feature: "!{{from.element.captured.feature}}" },
                    fileInternalPath: "!index.ts",
                  },
                },
              },
              message: architectureMessages.crossModuleDeepImport.message,
            },
            {
              from: {
                element: {
                  type: ["src-support", "shared-domain", "shared-ui"],
                },
              },
              disallow: {
                to: {
                  element: {
                    type: [
                      "feature-domain",
                      "feature-application",
                      "feature-infrastructure",
                      "feature-ui",
                      "feature-composition",
                    ],
                  },
                },
              },
              message: architectureMessages.crossModuleDeepImport.message,
            },
            {
              from: {
                element: {
                  type: ["src-support", "shared-domain", "shared-ui"],
                },
              },
              disallow: {
                to: {
                  element: {
                    type: "feature-module",
                    fileInternalPath: "!index.ts",
                  },
                },
              },
              message: architectureMessages.crossModuleDeepImport.message,
            },
            {
              from: { element: { type: "app-composition" } },
              disallow: {
                to: {
                  element: {
                    type: [
                      "feature-domain",
                      "feature-application",
                      "feature-ui",
                      "feature-composition",
                    ],
                  },
                },
              },
              message: architectureMessages.crossModuleDeepImport.message,
            },
            {
              from: { element: { type: "app-composition" } },
              disallow: {
                to: {
                  element: {
                    type: "feature-module",
                    fileInternalPath: "!index.ts",
                  },
                },
              },
              message: architectureMessages.crossModuleDeepImport.message,
            },
            {
              from: {
                file: { path: "src/app/layout/components/EditorModals.jsx" },
              },
              allow: {
                dependency: {
                  source: [
                    "@/features/export/components/ExportModal",
                    "@/features/modular-sprite/wizard",
                    "@/features/preferences/components/PreferencesModal",
                    "@/features/projects/components/LoadModal",
                    "@/features/projects/components/SaveModal",
                  ],
                },
              },
            },
            {
              from: {
                element: {
                  type: "feature-module",
                  fileInternalPath: "index.ts",
                },
              },
              dependency: { nodeKind: "export" },
              disallow: { to: { element: { type: "feature-infrastructure" } } },
              message: architectureMessages.publicInfrastructureExport.message,
            },
            {
              from: { element: { type: featureElementTypes } },
              disallow: {
                to: {
                  element: {
                    type: "feature-infrastructure",
                    captured: { feature: "!{{from.element.captured.feature}}" },
                  },
                },
              },
              message: architectureMessages.privateInfrastructure.message,
            },
            {
              from: {
                element: {
                  type: ["src-support", "shared-domain", "shared-ui"],
                },
              },
              disallow: { to: { element: { type: "feature-infrastructure" } } },
              message: architectureMessages.privateInfrastructure.message,
            },
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
              message: architectureMessages.domainToUiFramework.message,
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
              message:
                architectureMessages.domainToInfrastructureFramework.message,
            },
            {
              from: { element: { type: ["feature-domain", "shared-domain"] } },
              disallow: {
                dependency: {
                  source: [
                    "zustand",
                    "zustand/**",
                    "xstate",
                    "xstate/**",
                    "@xstate/**",
                    "@/store/**",
                  ],
                },
              },
              message: architectureMessages.domainToStateFramework.message,
            },
            {
              from: { element: { type: ["feature-domain", "shared-domain"] } },
              disallow: {
                dependency: {
                  source: ["@/components/**", "@/hooks/**"],
                },
              },
              message: architectureMessages.domainToUi.message,
            },
            {
              from: {
                element: {
                  type: "feature-domain",
                  captured: { feature: "canvas" },
                },
              },
              disallow: { dependency: { source: "@/contexts/**" } },
              message: architectureMessages.domainToUi.message,
            },
            {
              from: {
                element: {
                  type: "feature-domain",
                  captured: { feature: "canvas" },
                },
              },
              disallow: { dependency: { source: "@/io/**" } },
              message:
                architectureMessages.domainToInfrastructureFramework.message,
            },
            {
              from: {
                element: {
                  type: [
                    "feature-domain",
                    "feature-application",
                    "feature-infrastructure",
                    "feature-ui",
                  ],
                },
              },
              disallow: {
                to: {
                  element: {
                    type: "feature-composition",
                    captured: { feature: "{{from.element.captured.feature}}" },
                  },
                },
              },
              message: architectureMessages.innerLayerToComposition.message,
            },
            {
              from: {
                file: {
                  path: "src/features/modular-sprite/components/ModularSpriteWizard.tsx",
                },
              },
              allow: { to: { element: { type: "feature-composition" } } },
            },
            {
              from: {
                element: {
                  type: [
                    "feature-application",
                    "feature-infrastructure",
                    "feature-ui",
                  ],
                  captured: { feature: "modular-sprite" },
                },
              },
              disallow: { dependency: { source: "@/store/**" } },
              message:
                repositoryPolicyMessages.modularSpriteToGlobalStore.message,
            },
            {
              from: { element: { type: "workspace-package-isolated" } },
              disallow: { dependency: { source: "@kukla2d/**" } },
              message:
                repositoryPolicyMessages.workspacePackageDependency.message,
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
              message:
                repositoryPolicyMessages.workspacePackageDependency.message,
            },
            {
              from: { element: { type: ["app-composition", "feature-ui"] } },
              disallow: {
                dependency: {
                  source: ["@/components/!(ui)", "@/components/!(ui)/**"],
                },
              },
              message: repositoryPolicyMessages.legacyFeatureComponent.message,
            },
            {
              from: {
                element: {
                  type: "feature-ui",
                  captured: { feature: "canvas" },
                },
              },
              disallow: {
                dependency: {
                  source: [
                    "@/io/psd",
                    "@/io/psd/**",
                    "@/io/projectFile",
                    "@/io/projectFile/**",
                  ],
                },
              },
              message: repositoryPolicyMessages.canvasUiToLegacyIo.message,
            },
            {
              disallow: { to: { file: { categories: "test-only" } } },
              message: architectureMessages.productionToTests.message,
            },
          ],
        },
      ],
    },
  },
  {
    files: [
      "src/domain/**/*.{js,jsx,ts,tsx}",
      "src/features/*/domain/**/*.{js,jsx,ts,tsx}",
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
  },
  {
    files: ["src/features/canvas/**/*.{js,jsx,ts,tsx}"],
    rules: {
      "max-lines": [
        "error",
        {
          max: 400,
          skipBlankLines: false,
          skipComments: false,
        },
      ],
    },
  },
  {
    // TYPE-001/002/006/007 describe production module boundaries. The
    // executable TypeScript contract fixtures under test/types are kept out
    // of this production-only policy block.
    files: ["src/**/*.{ts,tsx}", "packages/**/*.{ts,tsx}"],
    ignores: ["src/io/live2d/**", "packages/adapters/live2d/**"],
    plugins: {
      "@typescript-eslint": tseslint.plugin,
      local: localArchitectureRules,
    },
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "TSAsExpression > TSAsExpression",
          message: typescriptMessages.doubleAssertion.message,
        },
      ],
      "@typescript-eslint/explicit-module-boundary-types": "error",
      "local/no-types-types-file": "error",
      "local/type-declaration-location": "error",
      "local/type-file-requires-export": "error",
      "local/type-files-only": "error",
    },
  },
  {
    files: ["**/*.{js,jsx}"],
    languageOptions: {
      ecmaVersion: "latest",
      globals: { ...globals.browser, __APP_VERSION__: "readonly" },
      parserOptions: {
        ecmaVersion: "latest",
        ecmaFeatures: { jsx: true },
        sourceType: "module",
      },
    },
    settings: { react: { version: "detect" } },
    plugins: {
      react,
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...js.configs.recommended.rules,
      ...react.configs.recommended.rules,
      ...react.configs["jsx-runtime"].rules,
      ...reactHooks.configs.recommended.rules,
      "react/jsx-no-target-blank": "off",
      "react-refresh/only-export-components": [
        "error",
        { allowConstantExport: true },
      ],
      "no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
    },
  },
  {
    files: [
      "src/components/**/*.{js,jsx}",
      "src/app/providers/**/*.{js,jsx}",
      "src/features/canvas/**/*.{js,jsx}",
      "src/features/*/components/**/*.{js,jsx}",
    ],
    rules: {
      "react/prop-types": "off",
    },
  },
  {
    files: ["scripts/**/*.{js,mjs}", "eslint-rules/**/*.js", "*.config.js"],
    languageOptions: {
      globals: globals.node,
    },
  },
  ...tseslint.config({
    files: tsManifest,
    extends: [...tseslint.configs.recommendedTypeChecked],
    languageOptions: {
      parserOptions: {
        projectService: {
          allowDefaultProject: [
            "test/projectSchema.test.ts",
            "test/migrateProject.test.ts",
            "test/projectDocumentContract.test.ts",
            "test/trackBinding.test.ts",
            "test/typescriptMigrationScope.test.ts",
            "test/fixtures/goldenProject.ts",
            "test/domain/animationTransport.test.ts",
            "test/export/exportAreaPresets.test.ts",
            "test/domain/animationTargets.test.ts",
            "test/domain/editorModeFeedback.test.ts",
            "test/layers/buildLibraryTree.test.ts",
            "test/modularSpriteProcessor.test.ts",
            "test/modularSpriteGrouping.test.ts",
            "test/modularSpriteWizardState.test.ts",
            "test/modularSpriteFinalize.test.ts",
            "test/modularSpriteProjectSchema.test.ts",
            "test/modularSpriteSchema.test.ts",
            "test/runtime/pathConstraint.test.ts",
            "test/runtime/physicsRig.test.ts",
            "test/runtime/skin.test.ts",
            "test/timeline/timelineTime.test.ts",
          ],
          maximumDefaultProjectFileMatchCount_THIS_WILL_SLOW_DOWN_LINTING: 21,
        },
      },
    },
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/consistent-type-imports": [
        "error",
        {
          prefer: "type-imports",
          fixStyle: "separate-type-imports",
        },
      ],
      "@typescript-eslint/consistent-type-exports": "error",
      "@typescript-eslint/no-unnecessary-type-assertion": "error",
      "@typescript-eslint/no-floating-promises": "error",
    },
  }),
];
