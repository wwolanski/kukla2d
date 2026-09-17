import { describe, expect, it, vi } from "vitest";

import type {
  ModularSpriteProcessingRecipe,
  ProjectDocument,
} from "@kukla2d/contracts";
import type { ModularSpriteSchema } from "@kukla2d/modular-sprite-schema";

import { createEmptyProject } from "@/core/createEmptyProject";
import {
  createModularSpriteSchema,
  portableModularSpriteSchema,
} from "@/features/modular-sprite";
import type {
  ProcessedModularSprite,
  RgbaImageData,
} from "@/features/modular-sprite";
import {
  analyzeProjectSchemaEligibility,
  publishProjectSchemas,
} from "@/features/projects/application/projectSchemaPublication.js";

type ProjectSchemaPublicationPorts = Parameters<typeof publishProjectSchemas>[1];

const recipe: ModularSpriteProcessingRecipe = {
  background: {
    mode: "alpha",
    color: { r: 0, g: 0, b: 0 },
    tolerance: 0,
    softness: 0.1,
    despill: 0,
  },
  detection: {
    alphaThreshold: 1,
    minimumRegionAreaRatio: 0,
    openingRadius: 0,
    closingRadius: 0,
    connectivity: 8,
  },
  strokes: [],
};

const image: RgbaImageData = {
  width: 16,
  height: 16,
  data: new Uint8ClampedArray(16 * 16 * 4),
};

const region = {
  id: 1,
  area: 16,
  bounds: { x: 2, y: 2, width: 4, height: 4 },
  normalizedBounds: { x: 0.125, y: 0.125, width: 0.25, height: 0.25 },
  centroid: { x: 0.25, y: 0.25 },
  suggestedRole: "head",
  contour: [],
};

const processed: ProcessedModularSprite = {
  width: image.width,
  height: image.height,
  rgba: image.data,
  matte: new Uint8ClampedArray(image.width * image.height),
  protectedInteriorMask: new Uint8Array(image.width * image.height),
  enclosedChromaMask: new Uint8Array(image.width * image.height),
  labels: new Int32Array(image.width * image.height),
  regions: [region],
  background: {
    mode: "alpha",
    color: { r: 0, g: 0, b: 0 },
    confidence: 1,
  },
  warnings: [],
  observation: {
    observationVersion: 1,
    processorVersion: 1,
    canvas: { width: 16, height: 16, aspectRatio: 1 },
    foregroundBounds: { x: 0.125, y: 0.125, width: 0.25, height: 0.25 },
    components: [
      {
        componentId: 1,
        bounds: { x: 0.125, y: 0.125, width: 0.25, height: 0.25 },
        centroid: { x: 0.25, y: 0.25 },
        foregroundAreaRatio: 0.0625,
        boundingBoxAreaRatio: 0.0625,
        aspectRatio: 1,
        shapeMask: { width: 1, height: 1, data: new Uint8Array([1]) },
      },
    ],
    segmentationQualityBp: 10000,
  },
};

function projectWithSprite(): ProjectDocument {
  const project = createEmptyProject();
  project.textures.push(
    { id: "source", source: "blob:source", name: "Source" },
    { id: "part-1", source: "blob:part", name: "Part" },
  );
  project.modularSprites.push({
    id: "sprite-1",
    schemaVersion: 1,
    name: "Hero",
    sourceAssetId: "source",
    source: { width: 16, height: 16 },
    processorVersion: 1,
    recipe: structuredClone(recipe),
    parts: [
      {
        partKey: "head",
        assetId: "part-1",
        name: "Head",
        role: "head",
        side: "center",
        required: true,
        order: 0,
        extractionFrame: { x: 0, y: 0, width: 0.5, height: 0.5 },
        contentBounds: { x: 0.125, y: 0.125, width: 0.25, height: 0.25 },
        componentSeeds: [{ x: 0.25, y: 0.25 }],
      },
    ],
  });
  return project;
}

function portsFor(
  schemas: readonly ModularSpriteSchema[] = [],
  processedResult: ProcessedModularSprite = processed,
): ProjectSchemaPublicationPorts & {
  saved: ModularSpriteSchema[];
  savedAssets: Array<{ assetId: string; blob: Blob }>;
} {
  const sourceBlob = new Blob(["source"], { type: "image/png" });
  const saved: ModularSpriteSchema[] = [];
  const savedAssets: Array<{ assetId: string; blob: Blob }> = [];
  return {
    decode: vi.fn(async () => image),
    process: vi.fn(async () => processedResult),
    resolveSourceBlob: vi.fn(async () => sourceBlob),
    schema: {
      initialize: vi.fn(async () => undefined),
      list: vi.fn(() => schemas),
      create: createModularSpriteSchema,
      save: vi.fn(async (schema) => {
        saved.push(schema);
      }),
      saveAsset: vi.fn(async (asset) => {
        savedAssets.push({ assetId: asset.assetId, blob: asset.blob });
      }),
      portableSnapshot: portableModularSpriteSchema,
    },
    saved,
    savedAssets,
  };
}

describe("project schema publication", () => {
  it("disables publication for a missing source, empty parts, and duplicate partKeys", () => {
    const missingSource = projectWithSprite();
    missingSource.textures = [];
    expect(analyzeProjectSchemaEligibility(missingSource)).toMatchObject({
      enabled: false,
    });
    expect(analyzeProjectSchemaEligibility(missingSource).reason).toMatch(
      /source texture is missing/i,
    );

    const missingPartTexture = projectWithSprite();
    missingPartTexture.textures = missingPartTexture.textures.filter(
      (texture) => texture.id !== "part-1",
    );
    expect(analyzeProjectSchemaEligibility(missingPartTexture)).toMatchObject({
      enabled: false,
    });
    expect(analyzeProjectSchemaEligibility(missingPartTexture).reason).toMatch(
      /texture for part "head" is missing/i,
    );

    const emptyParts = projectWithSprite();
    emptyParts.modularSprites[0]!.parts = [];
    expect(analyzeProjectSchemaEligibility(emptyParts).reason).toMatch(
      /no parts/i,
    );

    const duplicateKeys = projectWithSprite();
    duplicateKeys.modularSprites[0]!.parts.push(
      structuredClone(duplicateKeys.modularSprites[0]!.parts[0]!),
    );
    expect(analyzeProjectSchemaEligibility(duplicateKeys).reason).toMatch(
      /duplicated/i,
    );
  });

  it("publishes a new schema and binds slots to partKeys", async () => {
    const project = projectWithSprite();
    const ports = portsFor();

    const result = await publishProjectSchemas(project, ports);
    const schema = ports.saved[0]!;

    expect(result.publishedCount).toBe(1);
    expect(result.project).not.toBe(project);
    expect(result.project.modularSprites[0]!.schemaBinding).toMatchObject({
      schemaId: schema.schemaId,
      schemaRevision: 1,
      slotToPartKey: { head: "head" },
    });
    expect(schema.name).toBe("Hero schema");
    expect(schema.description).toMatch(/generated from saved project/i);
    expect(schema.characterTypeIds).toEqual([]);
    expect(schema.characterClassIds).toEqual([]);
    expect(schema.tags).toEqual([]);
    expect(schema.thumbnailAsset).toEqual(schema.referenceAsset);
    expect(ports.savedAssets).toHaveLength(1);
    expect(ports.savedAssets[0]!.assetId).toBe(schema.referenceAsset.assetId);
    expect(ports.savedAssets[0]!.blob).toBeInstanceOf(Blob);
    expect(schema.slots[0]!.components[0]!.componentId).toBe(1);
  });

  it("creates the next revision for an existing user schema", async () => {
    const project = projectWithSprite();
    project.modularSprites[0]!.schemaBinding = {
      schemaId: "user-schema",
      schemaRevision: 3,
      compositionId: "old-composition",
      relationship: "managed",
      syncState: "dirty",
      slotToPartKey: { head: "head" },
      snapshot: {
        formatVersion: 1,
        schemaId: "user-schema",
        revision: 3,
        compositionId: "old-composition",
        name: "Old",
        slots: [],
      },
    };
    const existing: ModularSpriteSchema = {
      ...portsFor().saved[0],
      formatVersion: 1,
      schemaId: "user-schema",
      revision: 3,
      compositionId: "old-composition",
      name: "Old",
      description: "Old",
      characterTypeIds: [],
      characterClassIds: [],
      tags: [],
      slots: [],
      fingerprint: processed.observation as never,
      matcherProfile: {} as never,
      referenceAsset: { assetId: "old-asset", mimeType: "image/png", width: 16, height: 16 },
      origin: { kind: "local" },
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    const ports = portsFor([existing]);

    const result = await publishProjectSchemas(project, ports);

    expect(ports.saved[0]!.schemaId).toBe("user-schema");
    expect(ports.saved[0]!.revision).toBe(4);
    expect(ports.saved[0]!.name).toBe("Old");
    expect(result.project.modularSprites[0]!.schemaBinding?.schemaRevision).toBe(4);
  });

  it("does not create redundant revisions for a current managed binding", async () => {
    const project = projectWithSprite();
    const initial = await publishProjectSchemas(project, portsFor());
    const ports = portsFor();

    const result = await publishProjectSchemas(initial.project, ports, {
      publishUnmanaged: false,
      updateManaged: true,
    });

    expect(result.publishedCount).toBe(0);
    expect(ports.saved).toHaveLength(0);
    expect(ports.savedAssets).toHaveLength(0);
  });

  it("forks a referenced schema instead of revising the original", async () => {
    const project = projectWithSprite();
    project.modularSprites[0]!.schemaBinding = {
      schemaId: "borrowed-schema",
      schemaRevision: 7,
      compositionId: "borrowed-composition",
      relationship: "reference",
      syncState: "current",
      slotToPartKey: { head: "head" },
      snapshot: {
        formatVersion: 1,
        schemaId: "borrowed-schema",
        revision: 7,
        compositionId: "borrowed-composition",
        name: "Borrowed",
        slots: [],
      },
    };
    const borrowed = createModularSpriteSchema({
      metadata: {
        name: "Borrowed",
        description: "External reference",
        characterTypeIds: [],
        characterClassIds: [],
        tags: ["borrowed"],
      },
      parts: [
        {
          ...project.modularSprites[0]!.parts[0]!,
          regionIds: [1],
        },
      ],
      observation: processed.observation,
      referenceAsset: {
        assetId: "borrowed-asset",
        mimeType: "image/png",
        width: 16,
        height: 16,
      },
      schemaId: "borrowed-schema",
      revision: 7,
    });
    const ports = portsFor([borrowed]);

    const result = await publishProjectSchemas(project, ports);

    expect(ports.saved[0]!.schemaId).not.toBe("borrowed-schema");
    expect(ports.saved[0]!.revision).toBe(1);
    expect(result.project.modularSprites[0]!.schemaBinding).toMatchObject({
      relationship: "managed",
      syncState: "current",
    });
  });

  it("does not save a schema or asset when region mapping fails", async () => {
    const ports = portsFor([], { ...processed, regions: [], observation: { ...processed.observation, components: [] } });

    await expect(publishProjectSchemas(projectWithSprite(), ports)).rejects.toThrow(
      /could not map any processed region/i,
    );
    expect(ports.saved).toHaveLength(0);
    expect(ports.savedAssets).toHaveLength(0);
  });
});
