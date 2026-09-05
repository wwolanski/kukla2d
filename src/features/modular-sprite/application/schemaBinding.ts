import {
  buildSchema,
  portableSnapshot,
  semanticRoleIdForLegacyRole,
  type ModularSpriteSchema,
  type PortableSchemaSnapshot,
  type SchemaAssetRef,
  type SchemaComparisonResult,
  type SchemaSlot,
  type SemanticCatalog,
} from '@kukla2d/modular-sprite-schema';

import type { DetectedRegion, ModularSpriteDraftPart, ProcessedModularSprite } from '../domain/contracts.js';
import type { RegionGrouping } from '../domain/partGrouping.js';

export interface ModularSpriteSchemaMetadata {
  name: string;
  description: string;
  characterTypeIds: string[];
  characterClassIds: string[];
  tags: string[];
}

export interface SchemaPartFactory {
  (region: DetectedRegion, index: number, existingParts: readonly ModularSpriteDraftPart[]): ModularSpriteDraftPart;
}

export function slotsFromModularSpriteParts(parts: readonly ModularSpriteDraftPart[], observation: ProcessedModularSprite['observation']): SchemaSlot[] {
  const byId = new Map(observation.components.map(item => [item.componentId, item]));
  return parts.map(part => {
    const semanticRoleId = part.semanticRoleId ?? semanticRoleIdForLegacyRole(part.role);
    return {
      slotKey: part.partKey,
      label: part.name,
      ...(semanticRoleId ? { semanticRoleId } : {}),
      qualifiers: { ...(part.qualifiers ?? {}), ...(part.side === 'none' ? {} : { side: part.side }) },
      required: part.required,
      drawOrder: part.order,
      components: part.regionIds
        .map(id => byId.get(id))
        .filter((item): item is NonNullable<typeof item> => Boolean(item))
        .map((item, index) => ({ ...item, componentKey: `${part.partKey}-${index + 1}` })),
    };
  });
}

export function createModularSpriteSchema(input: {
  metadata: ModularSpriteSchemaMetadata;
  parts: readonly ModularSpriteDraftPart[];
  observation: ProcessedModularSprite['observation'];
  referenceAsset: SchemaAssetRef;
  schemaId?: string;
  revision?: number;
}): ModularSpriteSchema {
  return buildSchema({
    schemaId: input.schemaId ?? crypto.randomUUID(),
    ...(input.revision ? { revision: input.revision } : {}),
    name: input.metadata.name,
    description: input.metadata.description,
    characterTypeIds: input.metadata.characterTypeIds,
    characterClassIds: input.metadata.characterClassIds,
    tags: input.metadata.tags,
    observation: input.observation,
    slots: slotsFromModularSpriteParts(input.parts, input.observation),
    referenceAsset: input.referenceAsset,
    origin: { kind: 'user' },
  });
}

function syntheticRegion(regions: readonly DetectedRegion[], width: number, height: number): DetectedRegion {
  const first = regions[0];
  if (!first) throw new Error('Cannot build a schema part without a region');
  const x = Math.min(...regions.map(region => region.bounds.x));
  const y = Math.min(...regions.map(region => region.bounds.y));
  const right = Math.max(...regions.map(region => region.bounds.x + region.bounds.width));
  const bottom = Math.max(...regions.map(region => region.bounds.y + region.bounds.height));
  const area = regions.reduce((sum, region) => sum + region.area, 0);
  return {
    ...first,
    area,
    bounds: { x, y, width: right - x, height: bottom - y },
    normalizedBounds: { x: x / width, y: y / height, width: (right - x) / width, height: (bottom - y) / height },
    centroid: {
      x: regions.reduce((sum, region) => sum + region.centroid.x * region.area, 0) / Math.max(1, area),
      y: regions.reduce((sum, region) => sum + region.centroid.y * region.area, 0) / Math.max(1, area),
    },
  };
}

export function groupingFromSchemaMatch(
  result: ProcessedModularSprite,
  schema: ModularSpriteSchema,
  match: SchemaComparisonResult,
  createPart: SchemaPartFactory,
  semantics?: SemanticCatalog,
): RegionGrouping {
  const parts: ModularSpriteDraftPart[] = [];
  const used = new Set<number>();
  for (const [index, slot] of schema.slots.entries()) {
    const assignment = match.assignments.find(item => item.slotKey === slot.slotKey);
    const regions = result.regions.filter(region => assignment?.componentIds.includes(region.id));
    if (regions.length === 0) continue;
    const semantic = slot.semanticRoleId ? semantics?.get(slot.semanticRoleId) : undefined;
    const side = slot.qualifiers.side;
    const base = createPart(syntheticRegion(regions, result.width, result.height), index, parts);
    parts.push({
      ...base,
      partKey: slot.slotKey,
      name: slot.label,
      role: semantic?.key ?? base.role ?? 'custom',
      ...(slot.semanticRoleId ? { semanticRoleId: slot.semanticRoleId } : {}),
      qualifiers: structuredClone(slot.qualifiers),
      side: side === 'left' || side === 'right' || side === 'center' ? side : 'none',
      required: slot.required,
      order: slot.drawOrder,
      regionIds: regions.map(region => region.id),
    });
    for (const region of regions) used.add(region.id);
  }
  for (const region of result.regions) {
    if (used.has(region.id)) continue;
    parts.push({ ...createPart(region, parts.length, parts), regionIds: [region.id] });
  }
  return { parts, excludedRegionIds: [] };
}

export function portableModularSpriteSchema(schema: ModularSpriteSchema): PortableSchemaSnapshot {
  return portableSnapshot(schema);
}
