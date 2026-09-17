import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

const assetsDir = resolve('dist/assets');
const javascriptAssets = readdirSync(assetsDir).filter(fileName => fileName.endsWith('.js'));
const javascriptSources = new Map(
  javascriptAssets.map(fileName => [fileName, readFileSync(resolve(assetsDir, fileName), 'utf8')]),
);

for (const [fileName, source] of javascriptSources) {
  if (source.includes('data:video/mp2t;base64,')) {
    throw new Error(`${fileName} embeds raw TypeScript as a video/mp2t data URL`);
  }
}

const meshWorkerAssets = [...javascriptSources]
  .filter(([, source]) => source.includes('MESH_GENERATION_FAILED')
    && source.includes('generateMesh dependency is required'))
  .map(([fileName]) => fileName);

if (meshWorkerAssets.length === 0) {
  throw new Error('Production build is missing the compiled mesh worker asset');
}

const referencedWorkers = meshWorkerAssets.filter(workerFileName =>
  [...javascriptSources.entries()].some(([fileName, source]) =>
    fileName !== workerFileName && source.includes(workerFileName),
  ),
);

if (referencedWorkers.length === 0) {
  throw new Error('Compiled mesh worker asset is not referenced by the application bundle');
}

const modularSpriteWorkerAssets = [...javascriptSources]
  .filter(([, source]) => source.includes('modular-sprite.process')
    && source.includes('Invalid RGBA image data'))
  .map(([fileName]) => fileName);

if (modularSpriteWorkerAssets.length === 0) {
  throw new Error('Production build is missing the compiled modular sprite worker asset');
}

const referencedModularSpriteWorkers = modularSpriteWorkerAssets.filter(workerFileName =>
  [...javascriptSources.entries()].some(([fileName, source]) =>
    fileName !== workerFileName && source.includes(workerFileName),
  ),
);

if (referencedModularSpriteWorkers.length === 0) {
  throw new Error('Compiled modular sprite worker asset is not referenced by the application bundle');
}

console.log(`Production worker check passed: ${[...referencedWorkers, ...referencedModularSpriteWorkers].join(', ')}`);
