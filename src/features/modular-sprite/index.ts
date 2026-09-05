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
export { createInitialGrouping, createPartFromRegions, excludeRegions, moveRegionsToPart, reconcileGrouping, removePart, renamePart, validateGrouping } from './domain/partGrouping.js';
export { mapRegions, reconcilePreviewToFullResolution, reconcileRegionGrouping } from './domain/regionReconciliation.js';
export type {
  ModularSpriteDraftPart,
  ProcessedModularSprite,
  RgbaImageData,
} from './domain/contracts.js';
export type {
  ModularSpriteCommitRequest,
  ModularSpriteCommitResult,
} from './application/importContracts.js';
export type {
  GroupingValidation,
  PartFactory,
  RegionGrouping,
  RegionGroupingChange,
} from './domain/partGrouping.js';
export type {
  RegionMapping,
  RegionReconciliationReport,
  RegionReconciliationResult,
} from './domain/regionReconciliation.js';
