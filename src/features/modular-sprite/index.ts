export {
  DEFAULT_MODULAR_SPRITE_RECIPE,
} from './domain/contracts.js';
export {
  analyzeModularSpriteBackground,
  createDefaultExtractionFrame,
  extractModularSpriteParts,
  precomputeOklab,
  processModularSprite,
  processModularSpriteAsync,
} from './domain/processor.js';
export { matchRegionsToTemplate } from './domain/matching.js';
export { createModularSpriteWorkerClient } from './infrastructure/modularSpriteWorkerClient.js';
export {
  createPreviewImage,
  decodeModularSpriteFile,
  encodeRgbaPng,
  imageToCanvas,
} from './infrastructure/imageCodec.js';
export type {
  ModularSpriteDraftPart,
  ProcessedModularSprite,
  RgbaImageData,
} from './domain/contracts.js';
export type {
  ModularSpriteCommitRequest,
  ModularSpriteCommitResult,
} from './application/importContracts.js';
