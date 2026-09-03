export {
  DEFAULT_MODULAR_SPRITE_RECIPE,
} from './domain/contracts.js';
export {
  analyzeModularSpriteBackground,
  createDefaultExtractionFrame,
  extractModularSpriteParts,
  processModularSprite,
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
  BackgroundAnalysis,
  DetectedRegion,
  ExtractedPart,
  ModularSpriteDraftPart,
  ModularSpriteTemplatePart,
  ProcessedModularSprite,
  ProcessModularSpriteRequest,
  RegionMatch,
  RgbaImageData,
} from './domain/contracts.js';
export type { ModularSpriteWorkerClient } from './infrastructure/modularSpriteWorkerClient.js';
export type {
  ModularSpriteCommitPart,
  ModularSpriteCommitRequest,
  ModularSpriteCommitResult,
} from './application/importContracts.js';
