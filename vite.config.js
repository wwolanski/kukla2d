import fs from 'node:fs'
import path from 'node:path'

import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const pkg = JSON.parse(fs.readFileSync(new URL('./package.json', import.meta.url), 'utf8'))
const base = process.env.KUKLA2D_BASE_PATH ?? '/'

export default defineConfig({
  base,
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, 'src'),
    },
  },
  build: {
    // Raw chunk size is advisory; the CI gate measures initial transfer cost.
    chunkSizeWarningLimit: 1500,
    rolldownOptions: {
      input: [
        path.resolve(import.meta.dirname, 'index.html'),
        path.resolve(import.meta.dirname, 'e2e/tests/phaser-atlas-contract.html'),
        path.resolve(import.meta.dirname, 'e2e/tests/phaser-atlas-export.html'),
      ],
      output: {
        codeSplitting: {
          groups: [{
            name: 'pose-runtime',
            test: /[\\/]src[\\/]features[\\/]canvas[\\/]domain[\\/]poseModel\.js$/,
          }, {
            name: 'pixi-runtime',
            test: /[\\/]node_modules[\\/]pixi\.js[\\/]/,
          }],
        },
      },
    },
  },
})
