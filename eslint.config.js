import js from '@eslint/js'
import boundaries from 'eslint-plugin-boundaries'
import globals from 'globals'
import react from 'eslint-plugin-react'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { createTypeScriptImportResolver } from 'eslint-import-resolver-typescript'
import { importX } from 'eslint-plugin-import-x'
import tseslint from 'typescript-eslint'

import noApplicationPassThroughPublicApi from './eslint-rules/no-application-pass-through-public-api.js'

const architectureMessages = {
  domainToApplication: 'ARCH-001: Domain must not depend on Application. Reason: Domain is the innermost layer and must remain independent of application workflows. Fix: Move the required abstraction or domain concept into Domain, or invert the dependency so Application depends on Domain.',
  domainToInfrastructure: 'ARCH-002: Domain must not depend on Infrastructure. Reason: Infrastructure is an implementation detail and dependencies must point inward. Fix: Define the required contract/port in Domain or Application and implement it in Infrastructure.',
  domainToUi: 'ARCH-003: Domain must not depend on UI. Reason: Domain logic must remain independent of presentation frameworks and components. Fix: Move shared domain concepts into Domain and let UI depend on them, not the other way around.',
  applicationToInfrastructure: 'ARCH-004: Application must not depend on Infrastructure. Reason: Application should orchestrate use cases through abstractions, not concrete technical implementations. Fix: Depend on a port/interface defined in Application or Domain and provide its implementation from Infrastructure.',
  applicationToUi: 'ARCH-005: Application must not depend on UI. Reason: Application use cases must remain independent of presentation code. Fix: Move the required contract to Application/Domain or make UI call Application instead.',
  uiToInfrastructure: 'ARCH-006: UI must not depend directly on Infrastructure. Reason: Presentation code should use application/domain APIs instead of concrete technical implementations. Fix: Call an Application use case/service or depend on a public contract instead of importing Infrastructure directly.',
  crossModuleDeepImport: 'ARCH-007: Cross-module deep import is forbidden. Reason: Other modules may access this module only through its public API. Fix: Import the required symbol from the target module root entry point (index.ts). If it is not exported there, decide whether it should become part of the module\'s public API.',
  publicInfrastructureExport: 'ARCH-008: Module public API must not expose Infrastructure. Reason: Infrastructure is a private implementation detail of the module. Fix: Export an Application/Domain contract or a higher-level module operation instead. Keep the Infrastructure implementation private.',
  privateInfrastructure: 'ARCH-009: Infrastructure is private to its owning module. Reason: Other modules must not depend on another module\'s technical implementation. Fix: Use the target module\'s public API. If a capability is missing, expose an appropriate Application/Domain contract through that public API.',
  productionToTests: 'ARCH-011: Production code must not depend on test-only code. Reason: Tests, fixtures and mocks are not part of the production dependency graph. Fix: Move reusable production logic/data into a production module and let the tests import it from there.',
  domainToUiFramework: 'ARCH-012: Domain must not depend on presentation frameworks. Reason: Domain must remain framework-independent. Fix: Move presentation-specific code to UI and keep only framework-agnostic domain logic/types in Domain.',
  domainToInfrastructureFramework: 'ARCH-013: Domain must not depend on infrastructure frameworks or concrete adapters. Reason: Domain should express business rules without depending on storage, transport or persistence technology. Fix: Introduce a framework-independent contract/port and move the concrete integration to Infrastructure.',
  infrastructureToUi: 'ARCH-010: Infrastructure must not depend on UI. Reason: Technical adapters must remain independent of presentation code so dependencies continue to point inward. Fix: Move presentation behavior to UI or expose an Infrastructure capability through an Application/Domain contract.',
}

const repositoryPolicyMessages = {
  innerLayerToComposition: 'ARCH-015: Inner feature layers must not depend on Composition. Reason: Composition is the outermost wiring layer and may depend inward; reversing that direction couples business code to bootstrap details. Fix: Move the wiring to Composition and make the inner layer depend on an Application/Domain contract.',
  domainToStateFramework: 'ARCH-016: Domain must not depend on application state frameworks or stores. Reason: Domain logic must remain independent of application state management and workflow runtimes. Fix: Pass framework-independent values or ports into Domain and keep Zustand/XState/store access in Application or Composition.',
  domainBrowserGlobal: 'ARCH-017: Domain must not use browser runtime globals. Reason: Domain code must be executable without DOM, Worker, or browser APIs. Fix: Move browser access to Infrastructure and pass framework-independent data or a port into Domain.',
  modularSpriteToGlobalStore: 'ARCH-018: Modular Sprite inner layers must not depend on the app-global store. Reason: This module has an explicit ports-based composition boundary and must remain independently composable. Fix: Pass the required capability through a Domain/Application port and connect it in modular-sprite/composition.',
  workspacePackageDependency: 'ARCH-019: Workspace package dependency is not allowed by the package matrix. Reason: Low-level contracts, utilities, and adapters must not acquire undeclared inward or sideways workspace dependencies. Fix: Remove the dependency or explicitly revise the documented package matrix; only engine and platform-browser may currently depend on @kukla2d/contracts.',
  legacyFeatureComponent: 'ARCH-020: Legacy feature component imports are forbidden. Reason: Feature-owned UI belongs under src/features/<feature>, while src/components is reserved for shared UI primitives. Fix: Import through the feature public API or move the component to its owning feature.',
  canvasUiToLegacyIo: 'ARCH-021: Canvas UI must not depend directly on legacy I/O modules. Reason: Presentation code must reach PSD/project-file operations through Application instead of bypassing the feature boundary. Fix: Call a Canvas Application operation or introduce an Application port implemented by the I/O adapter.',
}

const featureElementTypes = [
  'feature-domain',
  'feature-application',
  'feature-infrastructure',
  'feature-ui',
  'feature-composition',
  'feature-module',
]

const testOnlyFilePatterns = [
  'test/**/*.{js,jsx,ts,tsx}',
  '**/__tests__/**/*.{js,jsx,ts,tsx}',
  '**/{test,tests,fixtures,mocks,__mocks__,testing}/**/*.{js,jsx,ts,tsx}',
  '**/*.{test,spec}.{js,jsx,ts,tsx}',
]

const tsManifest = [
  'src/**/*.ts',
  'src/**/*.tsx',
  'packages/**/*.ts',
  'packages/**/*.tsx',
  'test/**/*.test.ts',
  'test/**/*.test.tsx',
  'test/types/**/*.ts',
  'test/fixtures/goldenProject.ts',
]
const relativeImportExtension = {
  rules: {
    'require-extension': {
      create(context) {
        const check = (source) => {
          const specifier = source.value
          if (typeof specifier !== 'string' || !specifier.startsWith('.')) return
          if (/\.[a-z0-9]+(?:[?#].*)?$/i.test(specifier)) return
          context.report({
            node: source,
            message: 'Relative import must include its emitted file extension.',
          })
        }
        return {
          ImportDeclaration: node => check(node.source),
          ExportAllDeclaration: node => check(node.source),
          ExportNamedDeclaration: node => { if (node.source) check(node.source) },
          ImportExpression: node => {
            if (node.source.type === 'Literal') check(node.source)
          },
        }
      },
    },
  },
}

const localArchitectureRules = {
  rules: {
    'no-application-pass-through-public-api': noApplicationPassThroughPublicApi,
  },
}

export default [
  {
    ignores: [
      'coverage/**',
      'dist/**',
      'external_repos/**',
      '_context/**',
      'node_modules/**',
      'playwright-report/**',
      'test-results/**',
    ],
  },
  {
    files: ['src/**/*.{js,jsx,ts,tsx}', 'packages/**/*.{js,jsx,ts,tsx}'],
    ignores: ['src/io/live2d/**', 'packages/adapters/live2d/**'],
    settings: {
      'import-x/resolver-next': [
        createTypeScriptImportResolver({
          extensionAlias: { '.js': ['.ts', '.tsx', '.js', '.jsx'] },
        }),
      ],
    },
    plugins: {
      'import-x': importX,
      'relative-import-extension': relativeImportExtension,
    },
    rules: {
      'import-x/no-unresolved': 'error',
      'import-x/order': ['error', {
        groups: [
          'builtin',
          'external',
          'internal',
          ['parent', 'sibling', 'index'],
          'type',
        ],
        pathGroups: [
          { pattern: '@kukla2d/**', group: 'external', position: 'after' },
          { pattern: '@/platform/**', group: 'internal', position: 'before' },
          { pattern: '@/store/**', group: 'internal', position: 'after' },
          { pattern: '@/{domain,runtime}/**', group: 'internal', position: 'after' },
          { pattern: '@/features/**', group: 'internal', position: 'after' },
          { pattern: '@/lib/**', group: 'internal', position: 'after' },
          { pattern: '@/components/ui/**', group: 'internal', position: 'after' },
        ],
        pathGroupsExcludedImportTypes: ['builtin'],
        alphabetize: { order: 'asc', caseInsensitive: true },
        'newlines-between': 'always',
      }],
      'relative-import-extension/require-extension': 'error',
      'id-denylist': ['error', 'ed', 'proj', 'anim', 'kfOv', 'drOv'],
    },
  },
  {
    files: ['src/features/*/index.{ts,tsx,js,jsx}'],
    plugins: { local: localArchitectureRules },
    rules: {
      'local/no-application-pass-through-public-api': 'error',
    },
  },
  {
    files: ['src/**/*.{js,jsx,ts,tsx}', 'packages/**/*.{js,jsx,ts,tsx}'],
    ignores: testOnlyFilePatterns,
    plugins: { boundaries },
    settings: {
      'boundaries/root-path': import.meta.dirname,
      'boundaries/elements': [
        {
          type: 'feature-domain',
          pattern: 'src/features/*/domain',
          capture: ['feature'],
          partialMatch: false,
        },
        {
          type: 'feature-application',
          pattern: 'src/features/*/application',
          capture: ['feature'],
          partialMatch: false,
        },
        {
          type: 'feature-infrastructure',
          pattern: 'src/features/*/infrastructure',
          capture: ['feature'],
          partialMatch: false,
        },
        {
          type: 'feature-ui',
          pattern: 'src/features/*/components',
          capture: ['feature'],
          partialMatch: false,
        },
        {
          type: 'feature-ui',
          pattern: 'src/features/*/overlays',
          capture: ['feature'],
          partialMatch: false,
        },
        {
          // This is the feature-local composition root, not an Application/UI layer.
          type: 'feature-composition',
          pattern: 'src/features/*/composition',
          capture: ['feature'],
          partialMatch: false,
        },
        {
          type: 'feature-module',
          pattern: 'src/features/*',
          capture: ['feature'],
          partialMatch: false,
        },
        {
          type: 'shared-domain',
          pattern: 'src/domain',
          partialMatch: false,
        },
        {
          type: 'app-composition',
          pattern: 'src/app',
          partialMatch: false,
        },
        {
          type: 'shared-ui',
          pattern: 'src/components/ui',
          partialMatch: false,
        },
        {
          type: 'src-support',
          pattern: 'src',
          partialMatch: false,
        },
        {
          type: 'workspace-package-contract-consumer',
          pattern: [
            'packages/engine/src',
            'packages/platform-browser/src',
          ],
          partialMatch: false,
        },
        {
          type: 'workspace-package-isolated',
          pattern: [
            'packages/application/src',
            'packages/contracts/src',
            'packages/document/src',
            'packages/math2d/src',
            'packages/modular-sprite-schema/src',
            'packages/adapters/*/src',
          ],
          partialMatch: false,
        },
      ],
      'boundaries/files': testOnlyFilePatterns.map(pattern => ({
        category: 'test-only',
        pattern,
      })),
      'import/resolver': {
        typescript: {
          extensionAlias: { '.js': ['.ts', '.tsx', '.js', '.jsx'] },
        },
      },
    },
    rules: {
      'boundaries/dependencies': ['error', {
        default: 'allow',
        checkAllOrigins: true,
        checkInternals: true,
        checkUnknownLocals: true,
        policies: [
          {
            from: { element: { type: 'feature-domain' } },
            disallow: { to: { element: { type: 'feature-application' } } },
            message: architectureMessages.domainToApplication,
          },
          {
            from: { element: { type: 'feature-domain' } },
            disallow: { to: { element: { type: 'feature-infrastructure' } } },
            message: architectureMessages.domainToInfrastructure,
          },
          {
            from: { element: { type: 'feature-domain' } },
            disallow: { to: { element: { type: 'feature-ui' } } },
            message: architectureMessages.domainToUi,
          },
          {
            from: { element: { type: 'feature-application' } },
            disallow: { to: { element: { type: 'feature-infrastructure' } } },
            message: architectureMessages.applicationToInfrastructure,
          },
          {
            from: { element: { type: 'feature-application' } },
            disallow: { to: { element: { type: 'feature-ui' } } },
            message: architectureMessages.applicationToUi,
          },
          {
            from: { element: { type: 'feature-ui' } },
            disallow: { to: { element: { type: 'feature-infrastructure' } } },
            message: architectureMessages.uiToInfrastructure,
          },
          {
            from: { element: { type: 'feature-infrastructure' } },
            disallow: { to: { element: { type: 'feature-ui' } } },
            message: architectureMessages.infrastructureToUi,
          },
          {
            from: { element: { type: featureElementTypes } },
            disallow: {
              to: {
                element: {
                  type: [
                    'feature-domain',
                    'feature-application',
                    'feature-infrastructure',
                    'feature-ui',
                    'feature-composition',
                  ],
                  captured: { feature: '!{{from.element.captured.feature}}' },
                },
              },
            },
            message: architectureMessages.crossModuleDeepImport,
          },
          {
            from: { element: { type: featureElementTypes } },
            disallow: {
              to: {
                element: {
                  type: 'feature-module',
                  captured: { feature: '!{{from.element.captured.feature}}' },
                  fileInternalPath: '!index.ts',
                },
              },
            },
            message: architectureMessages.crossModuleDeepImport,
          },
          {
            from: { element: { type: ['src-support', 'shared-domain', 'shared-ui'] } },
            disallow: {
              to: {
                element: {
                  type: [
                    'feature-domain',
                    'feature-application',
                    'feature-infrastructure',
                    'feature-ui',
                    'feature-composition',
                  ],
                },
              },
            },
            message: architectureMessages.crossModuleDeepImport,
          },
          {
            from: { element: { type: ['src-support', 'shared-domain', 'shared-ui'] } },
            disallow: {
              to: {
                element: {
                  type: 'feature-module',
                  fileInternalPath: '!index.ts',
                },
              },
            },
            message: architectureMessages.crossModuleDeepImport,
          },
          {
            from: { element: { type: 'app-composition' } },
            disallow: {
              to: {
                element: {
                  type: [
                    'feature-domain',
                    'feature-application',
                    'feature-ui',
                    'feature-composition',
                  ],
                },
              },
            },
            message: architectureMessages.crossModuleDeepImport,
          },
          {
            from: { element: { type: 'app-composition' } },
            disallow: {
              to: {
                element: {
                  type: 'feature-module',
                  fileInternalPath: '!index.ts',
                },
              },
            },
            message: architectureMessages.crossModuleDeepImport,
          },
          {
            from: {
              file: { path: 'src/app/layout/components/EditorModals.jsx' },
            },
            allow: {
              dependency: {
                source: [
                  '@/features/export/components/ExportModal',
                  '@/features/modular-sprite/wizard',
                  '@/features/preferences/components/PreferencesModal',
                  '@/features/projects/components/LoadModal',
                  '@/features/projects/components/SaveModal',
                ],
              },
            },
          },
          {
            from: { element: { type: 'feature-module', fileInternalPath: 'index.ts' } },
            dependency: { nodeKind: 'export' },
            disallow: { to: { element: { type: 'feature-infrastructure' } } },
            message: architectureMessages.publicInfrastructureExport,
          },
          {
            from: { element: { type: featureElementTypes } },
            disallow: {
              to: {
                element: {
                  type: 'feature-infrastructure',
                  captured: { feature: '!{{from.element.captured.feature}}' },
                },
              },
            },
            message: architectureMessages.privateInfrastructure,
          },
          {
            from: { element: { type: ['src-support', 'shared-domain', 'shared-ui'] } },
            disallow: { to: { element: { type: 'feature-infrastructure' } } },
            message: architectureMessages.privateInfrastructure,
          },
          {
            from: { element: { type: ['feature-domain', 'shared-domain'] } },
            disallow: {
              to: {
                module: {
                  origin: 'external',
                  source: [
                    'react',
                    'react/**',
                    'react-dom',
                    'react-dom/**',
                    '@radix-ui/**',
                    '@xstate/react',
                    'lucide-react',
                    'react-resizable-panels',
                  ],
                },
              },
            },
            message: architectureMessages.domainToUiFramework,
          },
          {
            from: { element: { type: ['feature-domain', 'shared-domain'] } },
            disallow: {
              to: {
                module: {
                  origin: 'external',
                  source: [
                    '@kukla2d/adapter-*',
                    '@kukla2d/platform-browser',
                    'ag-psd',
                    'gifenc',
                    'jszip',
                    'phaser',
                    'phaser/**',
                    'pixi-viewport',
                    'pixi.js',
                    'pixi.js/**',
                  ],
                },
              },
            },
            message: architectureMessages.domainToInfrastructureFramework,
          },
          {
            from: { element: { type: ['feature-domain', 'shared-domain'] } },
            disallow: {
              dependency: {
                source: [
                  'zustand',
                  'zustand/**',
                  'xstate',
                  'xstate/**',
                  '@xstate/**',
                  '@/store/**',
                ],
              },
            },
            message: repositoryPolicyMessages.domainToStateFramework,
          },
          {
            from: { element: { type: ['feature-domain', 'shared-domain'] } },
            disallow: {
              dependency: {
                source: [
                  '@/components/**',
                  '@/hooks/**',
                ],
              },
            },
            message: architectureMessages.domainToUi,
          },
          {
            from: {
              element: {
                type: 'feature-domain',
                captured: { feature: 'canvas' },
              },
            },
            disallow: { dependency: { source: '@/contexts/**' } },
            message: architectureMessages.domainToUi,
          },
          {
            from: {
              element: {
                type: 'feature-domain',
                captured: { feature: 'canvas' },
              },
            },
            disallow: { dependency: { source: '@/io/**' } },
            message: architectureMessages.domainToInfrastructureFramework,
          },
          {
            from: {
              element: {
                type: [
                  'feature-domain',
                  'feature-application',
                  'feature-infrastructure',
                  'feature-ui',
                ],
              },
            },
            disallow: {
              to: {
                element: {
                  type: 'feature-composition',
                  captured: { feature: '{{from.element.captured.feature}}' },
                },
              },
            },
            message: repositoryPolicyMessages.innerLayerToComposition,
          },
          {
            from: {
              file: { path: 'src/features/modular-sprite/components/ModularSpriteWizard.tsx' },
            },
            allow: { to: { element: { type: 'feature-composition' } } },
          },
          {
            from: {
              element: {
                type: [
                  'feature-application',
                  'feature-infrastructure',
                  'feature-ui',
                ],
                captured: { feature: 'modular-sprite' },
              },
            },
            disallow: { dependency: { source: '@/store/**' } },
            message: repositoryPolicyMessages.modularSpriteToGlobalStore,
          },
          {
            from: { element: { type: 'workspace-package-isolated' } },
            disallow: { dependency: { source: '@kukla2d/**' } },
            message: repositoryPolicyMessages.workspacePackageDependency,
          },
          {
            from: { element: { type: 'workspace-package-contract-consumer' } },
            disallow: {
              dependency: {
                source: [
                  '@kukla2d/!(contracts)',
                  '@kukla2d/!(contracts)/**',
                ],
              },
            },
            message: repositoryPolicyMessages.workspacePackageDependency,
          },
          {
            from: { element: { type: ['app-composition', 'feature-ui'] } },
            disallow: {
              dependency: {
                source: [
                  '@/components/!(ui)',
                  '@/components/!(ui)/**',
                ],
              },
            },
            message: repositoryPolicyMessages.legacyFeatureComponent,
          },
          {
            from: {
              element: {
                type: 'feature-ui',
                captured: { feature: 'canvas' },
              },
            },
            disallow: {
              dependency: {
                source: [
                  '@/io/psd',
                  '@/io/psd/**',
                  '@/io/projectFile',
                  '@/io/projectFile/**',
                ],
              },
            },
            message: repositoryPolicyMessages.canvasUiToLegacyIo,
          },
          {
            disallow: { to: { file: { categories: 'test-only' } } },
            message: architectureMessages.productionToTests,
          },
        ],
      }],
    },
  },
  {
    files: [
      'src/domain/**/*.{js,jsx,ts,tsx}',
      'src/features/*/domain/**/*.{js,jsx,ts,tsx}',
    ],
    rules: {
      'no-restricted-globals': ['error', {
        globals: ['window', 'document', 'Worker', 'Image'].map(name => ({
          name,
          message: repositoryPolicyMessages.domainBrowserGlobal,
        })),
      }],
    },
  },
  {
    files: ['src/features/canvas/**/*.{js,jsx,ts,tsx}'],
    rules: {
      'max-lines': ['error', {
        max: 400,
        skipBlankLines: false,
        skipComments: false,
      }],
    },
  },
  {
    files: ['src/**/*.{ts,tsx}', 'packages/**/*.{ts,tsx}'],
    ignores: ['src/io/live2d/**', 'packages/adapters/live2d/**'],
    plugins: { '@typescript-eslint': tseslint.plugin },
    rules: {
      'no-restricted-syntax': ['error', {
        selector: 'TSAsExpression > TSAsExpression',
        message: 'Double TypeScript assertions bypass validated boundaries.',
      }],
      '@typescript-eslint/explicit-module-boundary-types': 'error',
    },
  },
  {
    files: ['**/*.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 'latest',
      globals: { ...globals.browser, __APP_VERSION__: 'readonly' },
      parserOptions: {
        ecmaVersion: 'latest',
        ecmaFeatures: { jsx: true },
        sourceType: 'module',
      },
    },
    settings: { react: { version: 'detect' } },
    plugins: {
      react,
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...js.configs.recommended.rules,
      ...react.configs.recommended.rules,
      ...react.configs['jsx-runtime'].rules,
      ...reactHooks.configs.recommended.rules,
      'react/jsx-no-target-blank': 'off',
      'react-refresh/only-export-components': [
        'error',
        { allowConstantExport: true },
      ],
      'no-unused-vars': ['error', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_',
      }],
    },
  },
  {
    files: ['src/components/**/*.{js,jsx}', 'src/app/providers/**/*.{js,jsx}', 'src/features/canvas/**/*.{js,jsx}', 'src/features/*/components/**/*.{js,jsx}'],
    rules: {
      'react/prop-types': 'off',
    },
  },
  {
    files: ['scripts/**/*.{js,mjs}', 'eslint-rules/**/*.js', '*.config.js'],
    languageOptions: {
      globals: globals.node,
    },
  },
  ...tseslint.config({
    files: tsManifest,
    extends: [
      ...tseslint.configs.recommendedTypeChecked,
    ],
    languageOptions: {
      parserOptions: {
        projectService: {
          allowDefaultProject: [
            'test/projectSchema.test.ts',
            'test/migrateProject.test.ts',
            'test/projectDocumentContract.test.ts',
            'test/trackBinding.test.ts',
            'test/typescriptMigrationScope.test.ts',
            'test/fixtures/goldenProject.ts',
            'test/domain/animationTransport.test.ts',
            'test/export/exportAreaPresets.test.ts',
            'test/domain/animationTargets.test.ts',
            'test/domain/editorModeFeedback.test.ts',
            'test/layers/buildLibraryTree.test.ts',
            'test/modularSpriteProcessor.test.ts',
            'test/modularSpriteGrouping.test.ts',
            'test/modularSpriteWizardState.test.ts',
            'test/modularSpriteFinalize.test.ts',
            'test/modularSpriteProjectSchema.test.ts',
            'test/modularSpriteSchema.test.ts',
            'test/runtime/pathConstraint.test.ts',
            'test/runtime/physicsRig.test.ts',
            'test/runtime/skin.test.ts',
            'test/timeline/timelineTime.test.ts',
          ],
          maximumDefaultProjectFileMatchCount_THIS_WILL_SLOW_DOWN_LINTING: 21,
        },
      },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-unnecessary-type-assertion': 'error',
      '@typescript-eslint/no-floating-promises': 'error',
    },
  }),
]
