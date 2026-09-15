export { analyzeModularSpriteBackground } from "@/features/modular-sprite/domain/processing/backgroundAnalysis.js";
export { precomputeOklab } from "@/features/modular-sprite/domain/processing/chromaKey.js";
export {
  createDefaultExtractionFrame,
  extractModularSpriteParts,
} from "@/features/modular-sprite/domain/processing/extractParts.js";
export {
  processModularSprite,
  processModularSpriteAsync,
} from "@/features/modular-sprite/domain/processing/pipeline.js";
export { matchRegionsToTemplate } from "@/features/modular-sprite/domain/matching.js";
export { slugPartKey } from "@/features/modular-sprite/application/partDraftFactory.js";
export {
  createModularSpriteSchema,
  portableModularSpriteSchema,
} from "@/features/modular-sprite/application/schemaBinding.js";
export { createModularSpriteProcessingApi } from "@/features/modular-sprite/composition/createModularSpriteProcessingApi.js";
export {
  createInitialGrouping,
  createPartFromRegions,
  excludeRegions,
  moveRegionsToPart,
  reconcileGrouping,
  removePart,
  renamePart,
  validateGrouping,
} from "@/features/modular-sprite/domain/partGrouping.js";
export {
  mapRegions,
  reconcilePreviewToFullResolution,
  reconcileRegionGrouping,
} from "@/features/modular-sprite/domain/regionReconciliation.js";
export type {
  ModularSpriteDraftPart,
  ProcessedModularSprite,
  RgbaImageData,
} from "@/features/modular-sprite/domain/contracts.types.js";
export type {
  ModularSpriteCommitRequest,
  ModularSpriteCommitResult,
} from "@/features/modular-sprite/application/importContracts.types.js";
export type {
  GroupingValidation,
  PartFactory,
  RegionGrouping,
  RegionGroupingChange,
} from "@/features/modular-sprite/domain/partGrouping.types.js";
export type {
  RegionMapping,
  RegionReconciliationReport,
  RegionReconciliationResult,
} from "@/features/modular-sprite/domain/regionReconciliation.types.js";
export { ModularSpriteWizardComposition } from "@/features/modular-sprite/composition/ModularSpriteWizardComposition.js";
