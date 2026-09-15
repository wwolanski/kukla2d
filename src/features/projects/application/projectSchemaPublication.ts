import type {
  ModularSpriteDocument,
  ModularSpriteProcessingRecipe,
  ProjectDocument,
  Texture,
} from "@kukla2d/contracts";
import type {
  ModularSpriteSchema,
  PortableSchemaSnapshot,
  SchemaAssetRef,
} from "@kukla2d/modular-sprite-schema";

import {
  createModularSpriteSchema,
  matchRegionsToTemplate,
  portableModularSpriteSchema,
  type ModularSpriteDraftPart,
  type ProcessedModularSprite,
  type RgbaImageData,
} from "@/features/modular-sprite/index.js";

const REGION_DISTANCE_THRESHOLD = 0.2;

export interface ProjectSchemaEligibility {
  enabled: boolean;
  reason: string;
}

export interface ProjectSchemaPublicationPorts {
  decode(source: Blob | File): Promise<RgbaImageData>;
  process(input: {
    image: RgbaImageData;
    recipe: ModularSpriteProcessingRecipe;
  }): Promise<ProcessedModularSprite>;
  resolveSourceBlob(texture: Texture): Promise<Blob>;
  schema: {
    initialize(): Promise<void>;
    list(): readonly ModularSpriteSchema[];
    create: typeof createModularSpriteSchema;
    save(schema: ModularSpriteSchema): Promise<void>;
    saveAsset(
      asset: SchemaAssetRef & { blob: Blob },
    ): Promise<void>;
    portableSnapshot: typeof portableModularSpriteSchema;
  };
}

export interface ProjectSchemaPublicationResult {
  project: ProjectDocument;
  publishedCount: number;
}

interface PendingPublication {
  schema: ModularSpriteSchema;
  sourceBlob: Blob;
}

type DetectedRegion = ProcessedModularSprite["regions"][number];

function spriteLabel(sprite: ModularSpriteDocument, index: number): string {
  return sprite.name.trim() || `#${index + 1}`;
}

export function analyzeProjectSchemaEligibility(
  project: ProjectDocument,
): ProjectSchemaEligibility {
  if (!Array.isArray(project.modularSprites) || project.modularSprites.length === 0) {
    return {
      enabled: false,
      reason: "Project has no modular sprites.",
    };
  }

  for (const [index, sprite] of project.modularSprites.entries()) {
    const label = spriteLabel(sprite, index);
    const sourceTexture = project.textures.find(
      (texture) => texture.id === sprite.sourceAssetId,
    );
    if (!sourceTexture?.source) {
      return {
        enabled: false,
        reason: `Modular sprite "${label}" is incomplete: its source texture is missing.`,
      };
    }
    if (!Array.isArray(sprite.parts) || sprite.parts.length === 0) {
      return {
        enabled: false,
        reason: `Modular sprite "${label}" is incomplete: it has no parts.`,
      };
    }

    const partKeys = new Set<string>();
    for (const part of sprite.parts) {
      const partTexture = project.textures.find(
        (texture) => texture.id === part.assetId,
      );
      if (!partTexture?.source) {
        return {
          enabled: false,
          reason: `Modular sprite "${label}" is incomplete: the texture for part "${part.partKey}" is missing.`,
        };
      }
      if (typeof part.partKey !== "string" || part.partKey.trim() === "") {
        return {
          enabled: false,
          reason: `Modular sprite "${label}" is incomplete: a part has no partKey.`,
        };
      }
      const normalizedPartKey = part.partKey.trim().toLowerCase();
      if (partKeys.has(normalizedPartKey)) {
        return {
          enabled: false,
          reason: `Modular sprite "${label}" is incomplete: partKey "${part.partKey}" is duplicated.`,
        };
      }
      partKeys.add(normalizedPartKey);
    }
  }

  return {
    enabled: true,
    reason: `Project is eligible to publish ${project.modularSprites.length} modular sprite schema${project.modularSprites.length === 1 ? "" : "s"}.`,
  };
}

function nearestUnusedRegionId(
  point: { x: number; y: number },
  regions: readonly DetectedRegion[],
  used: ReadonlySet<number>,
): number | null {
  let nearest: DetectedRegion | null = null;
  let nearestDistance = Number.POSITIVE_INFINITY;
  for (const region of regions) {
    if (used.has(region.id)) continue;
    const distance = Math.hypot(
      point.x - region.centroid.x,
      point.y - region.centroid.y,
    );
    if (distance < nearestDistance) {
      nearest = region;
      nearestDistance = distance;
    }
  }
  if (!nearest || nearestDistance > REGION_DISTANCE_THRESHOLD) return null;
  return nearest.id;
}

function mapPartsToRegions(
  sprite: ModularSpriteDocument,
  result: ProcessedModularSprite,
): ModularSpriteDraftPart[] {
  const used = new Set<number>();
  const fallback = matchRegionsToTemplate(
    sprite.parts.map((part) => ({
      partKey: part.partKey,
      required: part.required,
      contentBounds: part.contentBounds,
    })),
    result.regions,
  );

  return sprite.parts.map((part) => {
    const regionIds: number[] = [];
    for (const seed of part.componentSeeds) {
      const regionId = nearestUnusedRegionId(seed, result.regions, used);
      if (regionId === null) continue;
      used.add(regionId);
      regionIds.push(regionId);
    }

    if (regionIds.length === 0) {
      const candidate = fallback.find((item) => item.partKey === part.partKey);
      if (
        candidate &&
        candidate.regionId !== null &&
        candidate.confidence >= REGION_DISTANCE_THRESHOLD &&
        !used.has(candidate.regionId)
      ) {
        used.add(candidate.regionId);
        regionIds.push(candidate.regionId);
      }
    }

    if (regionIds.length === 0) {
      throw new Error(
        `Could not map any processed region to modular sprite part "${part.partKey}".`,
      );
    }

    return {
      ...structuredClone(part),
      regionIds: [...new Set(regionIds)],
    };
  });
}

function schemaBindingFor(
  schema: ModularSpriteSchema,
  parts: readonly ModularSpriteDraftPart[],
  snapshot: PortableSchemaSnapshot,
): NonNullable<ModularSpriteDocument["schemaBinding"]> {
  const partKeys = new Set(parts.map((part) => part.partKey));
  const slotToPartKey: Record<string, string> = {};
  for (const slot of schema.slots) {
    if (!partKeys.has(slot.slotKey)) {
      throw new Error(
        `Could not map generated schema slot "${slot.slotKey}" to a modular sprite part.`,
      );
    }
    slotToPartKey[slot.slotKey] = slot.slotKey;
  }

  return {
    schemaId: schema.schemaId,
    schemaRevision: schema.revision,
    compositionId: schema.compositionId,
    slotToPartKey,
    snapshot,
  };
}

function schemaInputFor(
  sprite: ModularSpriteDocument,
  parts: readonly ModularSpriteDraftPart[],
  result: ProcessedModularSprite,
  referenceAsset: SchemaAssetRef,
  previous?: ModularSpriteSchema,
) {
  return {
    metadata: {
      name: `${sprite.name} schema`,
      description: "Generated from saved project",
      characterTypeIds: [],
      characterClassIds: [],
      tags: [],
    },
    parts,
    observation: result.observation,
    referenceAsset,
    ...(previous?.origin.kind === "user"
      ? {
          schemaId: previous.schemaId,
          revision: previous.revision + 1,
        }
      : {}),
  };
}

export async function publishProjectSchemas(
  project: ProjectDocument,
  ports: ProjectSchemaPublicationPorts,
): Promise<ProjectSchemaPublicationResult> {
  const clonedProject = structuredClone(project);
  const eligibility = analyzeProjectSchemaEligibility(project);
  if (!eligibility.enabled) {
    return { project: clonedProject, publishedCount: 0 };
  }

  await ports.schema.initialize();
  const existingSchemas = ports.schema.list();
  const pending: PendingPublication[] = [];
  const pendingBindings: Array<{
    spriteId: ModularSpriteDocument["id"];
    binding: NonNullable<ModularSpriteDocument["schemaBinding"]>;
  }> = [];

  for (const [index, sprite] of project.modularSprites.entries()) {
    const texture = project.textures.find(
      (candidate) => candidate.id === sprite.sourceAssetId,
    );
    if (!texture) {
      throw new Error(
        `Modular sprite "${spriteLabel(sprite, index)}" source texture is missing.`,
      );
    }
    const sourceBlob = await ports.resolveSourceBlob(texture);
    const image = await ports.decode(sourceBlob);
    const result = await ports.process({
      image,
      recipe: structuredClone(sprite.recipe),
    });
    const parts = mapPartsToRegions(sprite, result);
    const previous = sprite.schemaBinding
      ? existingSchemas.find(
          (schema) => schema.schemaId === sprite.schemaBinding?.schemaId,
        )
      : undefined;
    const referenceAsset: SchemaAssetRef = {
      assetId: crypto.randomUUID(),
      mimeType: sourceBlob.type || "image/png",
      width: image.width,
      height: image.height,
    };
    const create = ports.schema.create ?? createModularSpriteSchema;
    const createdSchema = create(
      schemaInputFor(sprite, parts, result, referenceAsset, previous),
    );
    const schema: ModularSpriteSchema = {
      ...createdSchema,
      thumbnailAsset: structuredClone(referenceAsset),
    };
    const portableSnapshot =
      ports.schema.portableSnapshot ?? portableModularSpriteSchema;
    const snapshot: PortableSchemaSnapshot = portableSnapshot(schema);
    pending.push({ schema, sourceBlob });
    pendingBindings.push({
      spriteId: sprite.id,
      binding: schemaBindingFor(schema, parts, snapshot),
    });
  }

  for (const [index, item] of pending.entries()) {
    await ports.schema.saveAsset({
      ...item.schema.referenceAsset,
      blob: item.sourceBlob,
    });
    await ports.schema.save(item.schema);
    const binding = pendingBindings[index];
    const sprite = clonedProject.modularSprites.find(
      (candidate) => candidate.id === binding?.spriteId,
    );
    if (sprite && binding) sprite.schemaBinding = binding.binding;
  }

  return {
    project: clonedProject,
    publishedCount: pending.length,
  };
}
