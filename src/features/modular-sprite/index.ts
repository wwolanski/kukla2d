export { DEFAULT_MODULAR_SPRITE_RECIPE } from "./domain/contracts.js";
export { analyzeModularSpriteBackground } from "./domain/processing/backgroundAnalysis.js";
export { precomputeOklab } from "./domain/processing/chromaKey.js";
export {
  createDefaultExtractionFrame,
  extractModularSpriteParts,
} from "./domain/processing/extractParts.js";
export {
  processModularSprite,
  processModularSpriteAsync,
} from "./domain/processing/pipeline.js";
export { matchRegionsToTemplate } from "./domain/matching.js";
export {
  createInitialGrouping,
  createPartFromRegions,
  excludeRegions,
  moveRegionsToPart,
  reconcileGrouping,
  removePart,
  renamePart,
  validateGrouping,
} from "./domain/partGrouping.js";
export {
  mapRegions,
  reconcilePreviewToFullResolution,
  reconcileRegionGrouping,
} from "./domain/regionReconciliation.js";
export type {
  ModularSpriteDraftPart,
  ProcessedModularSprite,
  RgbaImageData,
} from "./domain/contracts.types.js";
export type {
  ModularSpriteCommitRequest,
  ModularSpriteCommitResult,
} from "./application/importContracts.types.js";
export type {
  GroupingValidation,
  PartFactory,
  RegionGrouping,
  RegionGroupingChange,
} from "./domain/partGrouping.types.js";
export type {
  RegionMapping,
  RegionReconciliationReport,
  RegionReconciliationResult,
} from "./domain/regionReconciliation.types.js";
export { ModularSpriteWizardComposition } from "./composition/ModularSpriteWizardComposition.js";
