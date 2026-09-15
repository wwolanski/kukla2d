import { describe, it, expect } from 'vitest';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

function runScript(name) {
  return execSync(`node --import tsx scripts/scripts_legacy/${name}`, {
    cwd: root,
    timeout: 30000,
  });
}

describe('verify scripts', () => {
  it('verify-arm-cascade passes', () => {
    expect(() => runScript('verify-arm-cascade.mjs')).not.toThrow();
  });
  it('verify-physics passes', () => {
    expect(() => runScript('verify-physics.mjs')).not.toThrow();
  });
  it('verify-param-groups passes', () => {
    expect(() => runScript('verify-param-groups.mjs')).not.toThrow();
  });
});
