import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { ESLint, RuleTester } from 'eslint'
import tseslint from 'typescript-eslint'
import { describe, expect, it } from 'vitest'

import rule from '../../eslint-rules/no-application-pass-through-public-api.js'

RuleTester.describe = describe
RuleTester.it = it
RuleTester.itOnly = it.only

const fixtureRoot = fileURLToPath(new URL('../fixtures/eslint-arch014', import.meta.url))
const projectRoot = fileURLToPath(new URL('../..', import.meta.url))
const featureIndex = feature => path.join(fixtureRoot, 'src', 'features', feature, 'index.ts')

const ruleTester = new RuleTester({
  languageOptions: {
    ecmaVersion: 'latest',
    parser: tseslint.parser,
    sourceType: 'module',
  },
})

ruleTester.run('no-application-pass-through-public-api', rule, {
  valid: [
    {
      name: 'allows a direct Domain public API export',
      code: "export { foo } from './domain/foo.js'\n",
      filename: featureIndex('direct'),
    },
    {
      name: 'allows a real Application operation',
      code: "export { importFoo } from './application/importFoo.js'\n",
      filename: featureIndex('real-application'),
    },
    {
      name: 'does not lint an internal Application barrel by itself',
      code: "export { createFoo } from './createFoo.js'\n",
      filename: path.join(fixtureRoot, 'src', 'features', 'internal-barrel', 'application', 'index.ts'),
    },
    {
      name: 'does not guess which conflicting export-star provides a symbol',
      code: "export { foo } from './application/index.js'\n",
      filename: featureIndex('ambiguous'),
    },
  ],
  invalid: [
    {
      name: 'reports a direct Application-to-Domain pass-through',
      code: "export { foo } from './application/foo.js'\n",
      filename: featureIndex('direct'),
      errors: [{
        messageId: 'passThrough',
        data: {
          symbol: 'foo',
          applicationFile: 'application/foo.ts',
          domainFile: 'domain/foo.ts',
        },
      }],
    },
    {
      name: 'tracks renamed exports',
      code: "export { publicFoo } from './application/foo.js'\n",
      filename: featureIndex('alias'),
      errors: [{
        messageId: 'passThrough',
        data: {
          symbol: 'publicFoo',
          applicationFile: 'application/foo.ts',
          domainFile: 'domain/foo.ts',
        },
      }],
    },
    {
      name: 'tracks a multi-level Application barrel',
      code: "export { foo } from './application/index.js'\n",
      filename: featureIndex('barrel'),
      errors: [{
        messageId: 'passThrough',
        data: {
          symbol: 'foo',
          applicationFile: 'application/foo.ts',
          domainFile: 'domain/foo.ts',
        },
      }],
    },
    {
      name: 'reports a deterministic export-star pass-through',
      code: "export * from './application/foo.js'\n",
      filename: featureIndex('export-all'),
      errors: [{
        messageId: 'passThrough',
        data: {
          symbol: '*',
          applicationFile: 'application/foo.ts',
          domainFile: 'domain/foo.ts',
        },
      }],
    },
  ],
})

describe('ARCH-014 flat config integration', () => {
  it('enables the local rule as an error only on feature root public APIs', async () => {
    const eslint = new ESLint({ cwd: projectRoot })
    const rootConfig = await eslint.calculateConfigForFile(path.join(projectRoot, 'src/features/canvas/index.ts'))
    const applicationConfig = await eslint.calculateConfigForFile(
      path.join(projectRoot, 'src/features/canvas/application/useCanvasController.ts'),
    )

    expect(rootConfig.rules['local/no-application-pass-through-public-api']).toEqual([2])
    expect(applicationConfig.rules['local/no-application-pass-through-public-api']).toBeUndefined()
  })
})
