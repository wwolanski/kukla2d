import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const pkg = JSON.parse(fs.readFileSync('./package.json', 'utf-8'));
const expectedVersion = pkg.version;

function collectVersionReferences(dir) {
  const refs = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules' && entry.name !== 'dist') {
      refs.push(...collectVersionReferences(fullPath));
    } else if (entry.isFile() && /\.(jsx|js|tsx|ts|html)$/.test(entry.name)) {
      const content = fs.readFileSync(fullPath, 'utf-8');
      const lines = content.split('\n');
      lines.forEach((line, i) => {
        if (/['"`]v?0\.0\.0['"`]/.test(line) && !line.includes('package.json') && !line.includes('node_modules')) {
          refs.push({ file: fullPath, line: i + 1, text: line.trim() });
        }
      });
    }
  }
  return refs;
}

describe('version consistency', () => {
  it('package-lock.json version matches package.json', () => {
    const lock = JSON.parse(fs.readFileSync('./package-lock.json', 'utf-8'));
    expect(lock.version).toBe(expectedVersion);
  });

  it('__APP_VERSION__ matches package.json', () => {
    expect(__APP_VERSION__).toBe(expectedVersion);
  });

  it('no stray 0.0.0 version strings in src files', () => {
    const refs = collectVersionReferences('./src');
    expect(refs).toHaveLength(0);
  });
});
