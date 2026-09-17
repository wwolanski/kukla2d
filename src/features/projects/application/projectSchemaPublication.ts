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
import { semanticRoleIdForLegacyRole } from "@kukla2d/modular-sprite-schema";

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
  createCount: number;
  updateCount: number;
}

export interface ProjectSchemaPublicationOptions {
  spriteIds?: readonly ModularSpriteDocument["id"][];
  publishUnmanaged?: boolean;
  updateManaged?: boolean;
}

interface ProjectSchemaPublicationPorts {
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

interface ProjectSchemaPublicationResult {
  project: ProjectDocument;
  publishedCount: number;
  createdCount: number;
  updatedCount: number;
}

interface PendingPublication {
  schema: ModularSpriteSchema;
  sourceBlob: Blob;
}

type DetectedRegion = ProcessedModularSprite["regions"][number];

function spriteLabel(sprite: ModularSpriteDocument, index: number): string {
  return sprite.name.trim() || `#${index + 1}`;
}

function isManaged(
  sprite: ModularSpriteDocument,
): sprite is ModularSpriteDocument & {
  schemaBinding: NonNullable<ModularSpriteDocument["schemaBinding"]>;
} {
  return sprite.schemaBinding?.relationship === "managed";
}

function snapshotSlot(value: unknown): {
  slotKey?: string;
  label?: string;
  semanticRoleId?: string;
  qualifiers?: Record<string, string>;
  required?: boolean;
  drawOrder?: number;
  components?: unknown[];
} | null {
  return typeof value === "object" && value !== null ? value : null;
}

export function isProjectSchemaBindingDirty(
  sprite: ModularSpriteDocument,
): boolean {
  const binding = sprite.schemaBinding;
  if (!binding) return false;
  if (binding.syncState === "dirty") return true;
  const mappedPartKeys = new Set(Object.values(binding.slotToPartKey));
  if (mappedPartKeys.size !== sprite.parts.length) return true;
  for (const part of sprite.parts) {
    if (!mappedPartKeys.has(part.partKey)) return true;
    const slotEntry = binding.snapshot.slots.find((candidate) => {
      const slot = snapshotSlot(candidate);
      return (
        slot?.slotKey !== undefined &&
        binding.slotToPartKey[slot.slotKey] === part.partKey
      );
    });
    const slot = snapshotSlot(slotEntry);
    const semanticRoleId =
      part.semanticRoleId ?? semanticRoleIdForLegacyRole(part.role);
    const qualifiers = {
      ...(part.qualifiers ?? {}),
      ...(part.side === "none" ? {} : { side: part.side }),
    };
    if (
      !slot ||
      slot.label !== part.name ||
      slot.semanticRoleId !== semanticRoleId ||
      JSON.stringify(slot.qualifiers ?? {}) !==
        JSON.stringify(qualifiers) ||
      slot.required !== part.required ||
      slot.drawOrder !== part.order ||
      slot.components?.length !== part.componentSeeds.length
    )
      return true;
  }
  return false;
}

function selectedSprites(
  project: ProjectDocument,
  options: ProjectSchemaPublicationOptions,
): ModularSpriteDocument[] {
  const selectedIds = options.spriteIds
    ? new Set(options.spriteIds)
    : null;
  return project.modularSprites.filter(
    (sprite) => !selectedIds || selectedIds.has(sprite.id),
  );
}

function shouldPublish(
  sprite: ModularSpriteDocument,
  options: ProjectSchemaPublicationOptions,
): boolean {
  if (isManaged(sprite))
    return (options.updateManaged ?? true) &&
      isProjectSchemaBindingDirty(sprite);
  return options.publishUnmanaged ?? true;
}

export function analyzeProjectSchemaEligibility(
  project: ProjectDocument,
  options: ProjectSchemaPublicationOptions = {},
): ProjectSchemaEligibility {
  const sprites = selectedSprites(project, options).filter((sprite) =>
    shouldPublish(sprite, options),
  );
  const createCount = sprites.filter((sprite) => !isManaged(sprite)).length;
  const updateCount = sprites.length - createCount;
  const managedOwners = new Map<string, string>();
  for (const sprite of sprites) {
    if (!isManaged(sprite)) continue;
    const owner = managedOwners.get(sprite.schemaBinding.schemaId);
    if (owner && owner !== sprite.id)
      return {
        enabled: false,
        reason: `Managed schema "${sprite.schemaBinding.schemaId}" is linked to more than one modular sprite. Publish one package as a new schema first.`,
        createCount,
        updateCount,
      };
    managedOwners.set(sprite.schemaBinding.schemaId, sprite.id);
  }
  if (sprites.length === 0) {
    return {
      enabled: false,
      reason: "No modular sprite schemas need to be published or updated.",
      createCount,
      updateCount,
    };
  }

  for (const [index, sprite] of sprites.entries()) {
    const label = spriteLabel(sprite, index);
    const sourceTexture = project.textures.find(
      (texture) => texture.id === sprite.sourceAssetId,
    );
    if (!sourceTexture?.source) {
      return {
        enabled: false,
        reason: `Modular sprite "${label}" is incomplete: its source texture is missing.`,
        createCount,
        updateCount,
      };
    }
    if (!Array.isArray(sprite.parts) || sprite.parts.length === 0) {
      return {
        enabled: false,
        reason: `Modular sprite "${label}" is incomplete: it has no parts.`,
        createCount,
        updateCount,
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
          createCount,
          updateCount,
        };
      }
      if (typeof part.partKey !== "string" || part.partKey.trim() === "") {
        return {
          enabled: false,
          reason: `Modular sprite "${label}" is incomplete: a part has no partKey.`,
          createCount,
          updateCount,
        };
      }
      const normalizedPartKey = part.partKey.trim().toLowerCase();
      if (partKeys.has(normalizedPartKey)) {
        return {
          enabled: false,
          reason: `Modular sprite "${label}" is incomplete: partKey "${part.partKey}" is duplicated.`,
          createCount,
          updateCount,
        };
      }
      partKeys.add(normalizedPartKey);
    }
  }

  return {
    enabled: true,
    reason: `${createCount ? `${createCount} new` : "No new"} schema${createCount === 1 ? "" : "s"}; ${updateCount ? `${updateCount} update${updateCount === 1 ? "" : "s"}` : "no updates"}.`,
    createCount,
    updateCount,
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
    relationship: "managed",
    syncState: "current",
    slotToPartKey,
    snapshot,
  };
}

function schemaInputFor(
  sprite: ModularSpriteDocument,
  parts: readonly ModularSpriteDraftPart[],
  result: ProcessedModularSprite,
  referenceAsset: SchemaAssetRef,
  metadataSource?: ModularSpriteSchema,
  identity?: { schemaId: string; revision: number },
) {
  return {
    metadata: {
      name: identity && metadataSource?.name
        ? metadataSource.name
        : `${sprite.name} schema`,
      description:
        metadataSource?.description || "Generated from saved project",
      characterTypeIds: structuredClone(
        metadataSource?.characterTypeIds ?? [],
      ),
      characterClassIds: structuredClone(
        metadataSource?.characterClassIds ?? [],
      ),
      tags: structuredClone(metadataSource?.tags ?? []),
    },
    parts,
    observation: result.observation,
    referenceAsset,
    ...(identity ?? {}),
  };
}

export async function publishProjectSchemas(
  project: ProjectDocument,
  ports: ProjectSchemaPublicationPorts,
  options: ProjectSchemaPublicationOptions = {},
): Promise<ProjectSchemaPublicationResult> {
  const clonedProject = structuredClone(project);
  const eligibility = analyzeProjectSchemaEligibility(project, options);
  if (!eligibility.enabled) {
    return {
      project: clonedProject,
      publishedCount: 0,
      createdCount: 0,
      updatedCount: 0,
    };
  }

  await ports.schema.initialize();
  const existingSchemas = ports.schema.list();
  const pending: PendingPublication[] = [];
  const pendingBindings: Array<{
    spriteId: ModularSpriteDocument["id"];
    binding: NonNullable<ModularSpriteDocument["schemaBinding"]>;
  }> = [];

  const sprites = selectedSprites(project, options).filter((sprite) =>
    shouldPublish(sprite, options),
  );
  let createdCount = 0;
  let updatedCount = 0;
  for (const [index, sprite] of sprites.entries()) {
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
    const referencedSchema = sprite.schemaBinding
      ? existingSchemas.find(
          (schema) => schema.schemaId === sprite.schemaBinding?.schemaId,
        )
      : undefined;
    const managed = isManaged(sprite);
    if (managed && referencedSchema && referencedSchema.origin.kind !== "local") {
      throw new Error(
        `Managed schema "${sprite.schemaBinding.schemaId}" collides with a non-local schema.`,
      );
    }
    const identity = managed
      ? {
          schemaId: sprite.schemaBinding.schemaId,
          revision:
            (referencedSchema?.revision ?? sprite.schemaBinding.schemaRevision) +
            1,
        }
      : undefined;
    const referenceAsset: SchemaAssetRef = {
      assetId: crypto.randomUUID(),
      mimeType: sourceBlob.type || "image/png",
      width: image.width,
      height: image.height,
    };
    const create = ports.schema.create ?? createModularSpriteSchema;
    const createdSchema = create(
      schemaInputFor(
        sprite,
        parts,
        result,
        referenceAsset,
        referencedSchema,
        identity,
      ),
    );
    const schema: ModularSpriteSchema = {
      ...createdSchema,
      ...(managed && referencedSchema
        ? {
            createdAt: referencedSchema.createdAt,
            matcherProfile: {
              ...structuredClone(referencedSchema.matcherProfile),
              sizeRatioRules: structuredClone(
                createdSchema.matcherProfile.sizeRatioRules,
              ),
            },
          }
        : {}),
      thumbnailAsset: structuredClone(referenceAsset),
    };
    const portableSnapshot =
      ports.schema.portableSnapshot ?? portableModularSpriteSchema;
    const snapshot: PortableSchemaSnapshot = portableSnapshot(schema);
    pending.push({ schema, sourceBlob });
    if (managed) updatedCount += 1;
    else createdCount += 1;
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
    createdCount,
    updatedCount,
  };
}
