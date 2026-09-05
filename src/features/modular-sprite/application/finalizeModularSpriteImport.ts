import type { ModularSpriteId, ModularSpriteProcessingRecipe } from '@kukla2d/contracts';
import type { ModularSpriteSchema, SchemaAssetRef, SchemaComparisonResult, PortableSchemaSnapshot } from '@kukla2d/modular-sprite-schema';

import { reconcilePreviewToFullResolution, type RegionReconciliationReport } from '../domain/regionReconciliation.js';

import type { ModularSpriteCommitPart, ModularSpriteCommitRequest } from './importContracts.js';
import type { ModularSpriteSchemaMetadata } from './schemaBinding.js';
import type { AppliedSchema, WizardSource } from './wizardState.js';
import type { ExtractedPart, ModularSpriteDraftPart, ProcessedModularSprite, RgbaImageData } from '../domain/contracts.js';
import type { RegionGrouping } from '../domain/partGrouping.js';

export interface ModularSpriteProcessingPort {
  process(input: { image?: RgbaImageData; recipe: ModularSpriteProcessingRecipe }): Promise<ProcessedModularSprite>;
  extract(input: { image: RgbaImageData; recipe: ModularSpriteProcessingRecipe }, parts: readonly ModularSpriteDraftPart[]): Promise<ExtractedPart[]>;
}

export interface ModularSpriteImagePort {
  encode(image: RgbaImageData): Promise<Blob>;
}

export interface StoredSchemaAsset extends SchemaAssetRef {
  blob: Blob;
}

export interface ModularSpriteSchemaPort {
  createSchema(input: {
    metadata: ModularSpriteSchemaMetadata;
    parts: readonly ModularSpriteDraftPart[];
    observation: ProcessedModularSprite['observation'];
    referenceAsset: SchemaAssetRef;
    schemaId?: string;
    revision?: number;
  }): ModularSpriteSchema;
  saveAsset(asset: StoredSchemaAsset): Promise<void>;
  save(schema: ModularSpriteSchema): Promise<void>;
  portableSnapshot(schema: ModularSpriteSchema): PortableSchemaSnapshot;
}

export interface FinalizeModularSpriteImportInput {
  existingId?: ModularSpriteId | null;
  source: WizardSource;
  recipe: ModularSpriteProcessingRecipe;
  previewResult: ProcessedModularSprite;
  grouping: RegionGrouping;
  confirmedPartKeys: readonly string[];
  name: string;
  addToCanvas: boolean;
  schema: {
    applied: AppliedSchema | null;
    addSchema: boolean;
    saveMode: 'new' | 'revision';
    metadata: ModularSpriteSchemaMetadata;
  };
}

export interface FinalizeModularSpriteImportResult {
  request: ModularSpriteCommitRequest;
  fullResult: ProcessedModularSprite;
  fullGrouping: RegionGrouping;
  reconciliation: RegionReconciliationReport;
  schema: ModularSpriteSchema | null;
}

function validationErrors(input: FinalizeModularSpriteImportInput): string[] {
  const errors: string[] = [];
  const keys = input.grouping.parts.map(part => part.partKey);
  if (input.grouping.parts.length === 0) errors.push('Assign at least one modular sprite part');
  if (keys.some(key => !key.trim()) || new Set(keys).size !== keys.length) errors.push('Every part needs a unique, non-empty key');
  if (input.grouping.parts.some(part => !part.name.trim() || !part.role.trim() || part.regionIds.length === 0)) errors.push('Every part needs a name, role, and assigned region');
  const confirmed = new Set(input.confirmedPartKeys);
  if (input.grouping.parts.some(part => !confirmed.has(part.partKey))) errors.push('Confirm every semantic part assignment before importing');
  return errors;
}

export function validateFinalization(input: FinalizeModularSpriteImportInput): void {
  const errors = validationErrors(input);
  if (errors.length > 0) throw new Error(errors[0]);
}

function previewPartForSlot(grouping: RegionGrouping, match: SchemaComparisonResult | undefined, slotKey: string): ModularSpriteDraftPart | undefined {
  const assignment = match?.assignments.find(item => item.slotKey === slotKey);
  if (!assignment) return grouping.parts.find(part => part.partKey === slotKey);
  return grouping.parts.find(part => part.regionIds.some(regionId => assignment.componentIds.includes(regionId)));
}

function createSchemaBinding(
  input: FinalizeModularSpriteImportInput,
  fullResult: ProcessedModularSprite,
  fullGrouping: RegionGrouping,
  sourceBlob: Blob,
  schemaPort: ModularSpriteSchemaPort,
): Promise<{ schema: ModularSpriteSchema; slotToPartKey: Record<string, string> }> {
  let schema = input.schema.applied?.schema ?? null;
  if (input.schema.addSchema) {
    const revisionTarget = input.schema.saveMode === 'revision' && input.schema.applied?.schema.origin.kind === 'user' ? input.schema.applied.schema : undefined;
    const referenceAsset: SchemaAssetRef = { assetId: `schema-asset-${crypto.randomUUID()}`, mimeType: 'image/png', width: input.source.image.width, height: input.source.image.height };
    schema = schemaPort.createSchema({
      metadata: { ...input.schema.metadata, name: input.schema.metadata.name.trim() || `${input.name} schema` },
      parts: fullGrouping.parts,
      observation: fullResult.observation,
      referenceAsset,
      ...(revisionTarget ? { schemaId: revisionTarget.schemaId, revision: revisionTarget.revision + 1 } : {}),
    });
    schema = { ...schema, thumbnailAsset: schema.referenceAsset };
  }
  if (!schema) return Promise.reject(new Error('Schema binding was requested without a schema'));
  const saveSchema = input.schema.addSchema
    ? Promise.all([
      schemaPort.saveAsset({ ...schema.referenceAsset, blob: sourceBlob }),
      schemaPort.save(schema),
    ]).then(() => undefined)
    : Promise.resolve();
  const slotToPartKey: Record<string, string> = {};
  for (const slot of schema.slots) {
    const previewPart = previewPartForSlot(input.grouping, input.schema.applied?.match, slot.slotKey);
    const part = fullGrouping.parts.find(candidate => candidate.partKey === previewPart?.partKey || candidate.partKey === slot.slotKey);
    if (part) slotToPartKey[slot.slotKey] = part.partKey;
  }
  return saveSchema.then(() => ({ schema, slotToPartKey }));
}

function commitParts(extracted: readonly ExtractedPart[], parts: readonly ModularSpriteDraftPart[], imagePort: ModularSpriteImagePort): Promise<ModularSpriteCommitPart[]> {
  return Promise.all(extracted.map(async extractedPart => ({
    draft: parts.find(part => part.partKey === extractedPart.partKey)!,
    image: extractedPart.image,
    blob: await imagePort.encode(extractedPart.image),
    contentBounds: extractedPart.contentBounds,
    componentSeeds: extractedPart.componentSeeds,
  })));
}

export async function finalizeModularSpriteImport(
  input: FinalizeModularSpriteImportInput,
  ports: { processing: ModularSpriteProcessingPort; image: ModularSpriteImagePort; schema: ModularSpriteSchemaPort },
): Promise<FinalizeModularSpriteImportResult> {
  validateFinalization(input);
  const fullResult = await ports.processing.process({ image: input.source.image, recipe: input.recipe });
  const reconciled = reconcilePreviewToFullResolution(input.grouping, input.previewResult.regions, fullResult.regions);
  const fullParts = reconciled.grouping.parts;
  if (fullParts.some(part => part.regionIds.length === 0)) throw new Error('A confirmed part could not be matched at full resolution');
  const extracted = await ports.processing.extract({ image: input.source.image, recipe: input.recipe }, fullParts);
  const overflow = extracted.find(part => part.overflow);
  if (overflow) throw new Error(`Content for "${overflow.partKey}" extends outside its stable extraction frame. Save as a new set instead.`);
  const sourceBlob = await ports.image.encode(input.source.image);
  const parts = await commitParts(extracted, fullParts, ports.image);
  let boundSchema: ModularSpriteSchema | null = null;
  let schemaBinding: ModularSpriteCommitRequest['schemaBinding'];
  if (input.schema.addSchema || input.schema.applied) {
    const binding = await createSchemaBinding(input, fullResult, reconciled.grouping, sourceBlob, ports.schema);
    boundSchema = binding.schema;
    schemaBinding = {
      schemaId: boundSchema.schemaId,
      schemaRevision: boundSchema.revision,
      compositionId: boundSchema.compositionId,
      slotToPartKey: binding.slotToPartKey,
      snapshot: ports.schema.portableSnapshot(boundSchema),
    };
  }
  return {
    request: {
      ...(input.existingId ? { existingId: input.existingId } : {}),
      name: input.name.trim() || 'Modular Sprite',
      sourceFileName: input.source.file.name,
      sourceImage: input.source.image,
      sourceBlob,
      recipe: structuredClone(input.recipe),
      parts,
      addToCanvas: input.addToCanvas,
      ...(schemaBinding ? { schemaBinding } : {}),
    },
    fullResult,
    fullGrouping: reconciled.grouping,
    reconciliation: reconciled.report,
    schema: boundSchema,
  };
}
