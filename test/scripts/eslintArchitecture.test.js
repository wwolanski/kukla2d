import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { ESLint } from 'eslint'
import { describe, expect, it } from 'vitest'

const testDir = dirname(fileURLToPath(import.meta.url))
const rootDir = resolve(testDir, '../..')
const eslint = new ESLint({ cwd: rootDir })

async function lintFixture(filePath, code) {
  const [result] = await eslint.lintText(code, {
    filePath: resolve(rootDir, filePath),
  })
  return result.messages
}

function architectureMessages(messages) {
  return messages.filter(message => message.message.includes('ARCH-'))
}

describe('ESLint feature boundaries', () => {
  it('fails a cross-feature internal import with an actionable ARCH-007 message', async () => {
    const messages = await lintFixture(
      'src/features/layers/components/__eslintArchitectureFixture.jsx',
      "import '@/features/canvas/domain/canvasFrame'\n",
    )

    expect(architectureMessages(messages).map(message => message.message)).toContainEqual(
      expect.stringContaining('ARCH-007: Cross-module deep import is forbidden.'),
    )
  })

  it('fails an internal feature import from outside a feature', async () => {
    const messages = await lintFixture(
      'src/store/__eslintArchitectureFixture.js',
      "import '@/features/canvas/domain/canvasFrame'\n",
    )

    expect(architectureMessages(messages).map(message => message.message)).toContainEqual(
      expect.stringContaining('ARCH-007: Cross-module deep import is forbidden.'),
    )
  })

  it('allows same-feature internals and public feature entry points', async () => {
    const sameFeature = await lintFixture(
      'src/features/canvas/components/__eslintArchitectureFixture.jsx',
      "import '@/features/canvas/domain/canvasFrame'\n",
    )
    const publicEntryPoint = await lintFixture(
      'src/features/layers/components/__eslintArchitectureFixture.jsx',
      "import '@/features/canvas'\n",
    )

    expect(architectureMessages(sameFeature)).toEqual([])
    expect(architectureMessages(publicEntryPoint)).toEqual([])
  })

  it('allows the exact app modal React.lazy import exception', async () => {
    const messages = await lintFixture(
      'src/app/layout/components/EditorModals.jsx',
      [
        "import React from 'react'",
        "const ExportModal = React.lazy(() => import('@/features/export/components/ExportModal'))",
        'export default ExportModal',
      ].join('\n'),
    )

    expect(architectureMessages(messages)).toEqual([])
  })
})

describe('ESLint domain purity', () => {
  const domainFixture = 'src/features/layers/domain/__eslintArchitectureFixture.js'

  it('rejects presentation frameworks with ARCH-012', async () => {
    const messages = await lintFixture(domainFixture, "import 'react'\n")

    expect(architectureMessages(messages).map(message => message.message)).toContainEqual(
      expect.stringContaining('ARCH-012: Domain must not depend on presentation frameworks.'),
    )
  })

  it('rejects application state frameworks with ARCH-016', async () => {
    const messages = await lintFixture(domainFixture, "import 'xstate'\n")

    expect(architectureMessages(messages).map(message => message.message)).toContainEqual(
      expect.stringContaining('ARCH-016: Domain must not depend on application state frameworks or stores.'),
    )
  })

  it('rejects browser globals with ARCH-017', async () => {
    const messages = await lintFixture(domainFixture, 'export const browserDocument = document\n')

    expect(architectureMessages(messages).map(message => message.message)).toContainEqual(
      expect.stringContaining('ARCH-017: Domain must not use browser runtime globals.'),
    )
  })

  it('allows framework-independent domain code', async () => {
    const messages = await lintFixture(domainFixture, 'export const add = (left, right) => left + right\n')

    expect(architectureMessages(messages)).toEqual([])
  })
})
