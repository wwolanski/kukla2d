/**
 * Compatibility barrel for the public processing API.
 *
 * The implementation lives in domain/processing/* so synchronous and worker
 * pipelines share the same algorithm stages without making this module a
 * second orchestration layer.
 */
export {
  analyzeModularSpriteBackground,
} from './processing/backgroundAnalysis.js';
export {
  precomputeOklab,
  precomputeOklabAsync,
} from './processing/chromaKey.js';
export {
  createDefaultExtractionFrame,
  extractModularSpriteParts,
  unionNormalizedBounds,
} from './processing/extractParts.js';
export {
  processModularSprite,
  processModularSpriteAsync,
} from './processing/pipeline.js';
export type { ProcessingHooks } from './processing/types.js';

