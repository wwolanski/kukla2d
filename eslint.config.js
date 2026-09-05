import js from '@eslint/js'
import globals from 'globals'
import react from 'eslint-plugin-react'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { createTypeScriptImportResolver } from 'eslint-import-resolver-typescript'
import { importX } from 'eslint-plugin-import-x'
import tseslint from 'typescript-eslint'
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
    files: ['scripts/**/*.{js,mjs}', '*.config.js'],
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
