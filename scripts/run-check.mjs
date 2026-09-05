import { execSync } from 'child_process';

const steps = [
  { name: 'typecheck', cmd: 'npm run typecheck' },
  { name: 'ts-graph', cmd: 'npm run check:ts-graph' },
  { name: 'typescript-migration', cmd: 'npm run check:typescript-migration' },
  { name: 'lint', cmd: 'npm run lint' },
  { name: 'deadcode', cmd: 'npm run check:deadcode' },
  { name: 'test:unit', cmd: 'npm run test:unit' },
  { name: 'build', cmd: 'npm run build' },
  { name: 'bundle', cmd: 'node scripts/check-bundle-budget.mjs' },
];

let failed = false;

for (const step of steps) {
  console.log(`\n=== ${step.name} ===`);
  try {
    execSync(step.cmd, { stdio: 'inherit', cwd: process.cwd() });
    console.log(`✓ ${step.name} passed`);
  } catch {
    console.error(`✗ ${step.name} failed`);
    failed = true;
    break;
  }
}

if (failed) {
  console.error('\n❌ Check failed');
  process.exit(1);
} else {
  console.log('\n✅ All checks passed');
}
