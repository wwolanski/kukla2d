import type {
  ModularSpriteProcessingRecipe,
  NormalizedPoint,
} from "@kukla2d/contracts";
import type {
  ModularSpriteSchema,
  SchemaComparisonResult,
} from "@kukla2d/modular-sprite-schema";

import {
  limitFileName,
  limitName,
} from "@/domain/nameConstraints.js";

import type {
  ModularSpriteProcessingPort,
  ModularSpriteSchemaPort,
} from "@/features/modular-sprite/application/finalizeModularSpriteImport.types.js";
import type { ModularSpriteCommitRequest } from "@/features/modular-sprite/application/importContracts.types.js";
import type {
  ExtractedPart,
  ModularSpriteDraftPart,
  ProcessedModularSprite,
  RgbaImageData,
} from "@/features/modular-sprite/domain/contracts.types.js";
import type { RegionGrouping } from "@/features/modular-sprite/domain/partGrouping.types.js";
import { reconcilePreviewToFullResolution } from "@/features/modular-sprite/domain/regionReconciliation.js";
import type { RegionReconciliationReport } from "@/features/modular-sprite/domain/regionReconciliation.types.js";

interface ModularSpriteImagePort {
  encode(image: RgbaImageData): Promise<Blob>;
}

interface WizardSource {
  file: File;
  image: RgbaImageData;
  preview: RgbaImageData;
}

interface AppliedSchema {
  schema: ModularSpriteSchema;
  match: SchemaComparisonResult;
  modified: boolean;
}

interface ModularSpriteCommitPart {
  draft: ModularSpriteDraftPart;
  image: RgbaImageData;
  blob: Blob;
  contentBounds: ModularSpriteDraftPart["contentBounds"];
  componentSeeds: NormalizedPoint[];
}

interface FinalizeModularSpriteImportInput {
  source: WizardSource;
  recipe: ModularSpriteProcessingRecipe;
  previewResult: ProcessedModularSprite;
  grouping: RegionGrouping;
  name: string;
  addToCanvas: boolean;
  schema: {
    applied: AppliedSchema | null;
  };
}

interface FinalizeModularSpriteImportResult {
  request: ModularSpriteCommitRequest;
  fullResult: ProcessedModularSprite;
  fullGrouping: RegionGrouping;
  reconciliation: RegionReconciliationReport;
  schema: ModularSpriteSchema | null;
}

function validationErrors(input: FinalizeModularSpriteImportInput): string[] {
  const errors: string[] = [];
  const keys = input.grouping.parts.map((part) => part.partKey);
  const normalizedKeys = keys.map((key) => key.toLowerCase());
  if (input.grouping.parts.length === 0)
    errors.push("Assign at least one modular sprite part");
  if (
    keys.some((key) => !/^[a-z][a-z0-9-]*$/.test(key)) ||
    new Set(normalizedKeys).size !== normalizedKeys.length
  )
    errors.push("Every part needs a unique, non-empty key");
  if (
    input.grouping.parts.some(
      (part) =>
        !part.name.trim() || !part.role.trim() || part.regionIds.length === 0,
    )
  )
    errors.push("Every part needs a name, role, and assigned region");
  return errors;
}

export function validateFinalization(
  input: FinalizeModularSpriteImportInput,
): void {
  const errors = validationErrors(input);
  if (errors.length > 0) throw new Error(errors[0]);
}

function previewPartForSlot(
  grouping: RegionGrouping,
  match: SchemaComparisonResult | undefined,
  slotKey: string,
): ModularSpriteDraftPart | undefined {
  const assignment = match?.assignments.find(
    (item) => item.slotKey === slotKey,
  );
  if (!assignment)
    return grouping.parts.find((part) => part.partKey === slotKey);
  return grouping.parts.find((part) =>
    part.regionIds.some((regionId) =>
      assignment.componentIds.includes(regionId),
    ),
  );
}

function createSchemaBinding(
  input: FinalizeModularSpriteImportInput,
  fullGrouping: RegionGrouping,
): {
  schema: ModularSpriteSchema;
  slotToPartKey: Record<string, string>;
} {
  const schema = input.schema.applied?.schema;
  if (!schema) throw new Error("Schema binding was requested without a schema");
  const slotToPartKey: Record<string, string> = {};
  for (const slot of schema.slots) {
    const previewPart = previewPartForSlot(
      input.grouping,
      input.schema.applied?.match,
      slot.slotKey,
    );
    const part = fullGrouping.parts.find(
      (candidate) =>
        candidate.partKey === previewPart?.partKey ||
        candidate.partKey === slot.slotKey,
    );
    if (part) slotToPartKey[slot.slotKey] = part.partKey;
  }
  return { schema, slotToPartKey };
}

function commitParts(
  extracted: readonly ExtractedPart[],
  parts: readonly ModularSpriteDraftPart[],
  imagePort: ModularSpriteImagePort,
): Promise<ModularSpriteCommitPart[]> {
  return Promise.all(
    extracted.map(async (extractedPart) => ({
      draft: parts.find((part) => part.partKey === extractedPart.partKey)!,
      image: extractedPart.image,
      blob: await imagePort.encode(extractedPart.image),
      contentBounds: extractedPart.contentBounds,
      componentSeeds: extractedPart.componentSeeds,
    })),
  );
}

export async function finalizeModularSpriteImport(
  input: FinalizeModularSpriteImportInput,
  ports: {
    processing: ModularSpriteProcessingPort;
    image: ModularSpriteImagePort;
    schema: ModularSpriteSchemaPort;
  },
): Promise<FinalizeModularSpriteImportResult> {
  validateFinalization(input);
  const fullResult = await ports.processing.process({
    image: input.source.image,
    recipe: input.recipe,
  });
  const reconciled = reconcilePreviewToFullResolution(
    input.grouping,
    input.previewResult.regions,
    fullResult.regions,
  );
  const fullParts = reconciled.grouping.parts;
  if (fullParts.some((part) => part.regionIds.length === 0))
    throw new Error("An imported part could not be matched at full resolution");
  const extracted = await ports.processing.extract(
    { image: input.source.image, recipe: input.recipe },
    fullParts,
  );
  const overflow = extracted.find((part) => part.overflow);
  if (overflow)
    throw new Error(
      `Content for "${overflow.partKey}" extends outside its stable extraction frame. Save as a new set instead.`,
    );
  const sourceBlob = await ports.image.encode(input.source.image);
  const parts = await commitParts(extracted, fullParts, ports.image);
  let boundSchema: ModularSpriteSchema | null = null;
  let schemaBinding: ModularSpriteCommitRequest["schemaBinding"];
  if (input.schema.applied) {
    const binding = createSchemaBinding(input, reconciled.grouping);
    boundSchema = binding.schema;
    schemaBinding = {
      schemaId: boundSchema.schemaId,
      schemaRevision: boundSchema.revision,
      compositionId: boundSchema.compositionId,
      relationship: "reference",
      syncState: "current",
      slotToPartKey: binding.slotToPartKey,
      snapshot: ports.schema.portableSnapshot(boundSchema),
    };
  }
  return {
    request: {
      name: limitName(input.name.trim() || "Modular Sprite"),
      sourceFileName: limitFileName(input.source.file.name),
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
