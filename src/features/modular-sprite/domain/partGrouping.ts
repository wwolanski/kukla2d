import type { NormalizedRect } from '@kukla2d/contracts';

import { clamp } from './imageMath.js';

import type {
  DetectedRegion,
  ModularSpriteDraftPart,
  ProcessedModularSprite,
} from './contracts.js';

/**
 * The complete assignment of detected regions.  A region is either owned by
 * exactly one part or is explicitly excluded.  Keeping exclusion in the
 * model is important: an unassigned region is not necessarily a deliberate
 * user decision.
 */
export interface RegionGrouping {
  parts: ModularSpriteDraftPart[];
  excludedRegionIds: number[];
}

export interface GroupingValidation {
  valid: boolean;
  errors: string[];
  duplicateRegionIds: number[];
  missingRegionIds: number[];
  unknownRegionIds: number[];
}

export type PartFactory = (
  region: DetectedRegion,
  index: number,
  existingParts: readonly ModularSpriteDraftPart[],
) => ModularSpriteDraftPart;

export interface RegionGroupingChange {
  grouping: RegionGrouping;
  affectedPartKeys: string[];
}

function asRegions(input: Pick<ProcessedModularSprite, 'regions'> | readonly DetectedRegion[]): readonly DetectedRegion[] {
  return 'regions' in input ? input.regions : input;
}

function defaultPartFactory(
  region: DetectedRegion,
  index: number,
  existingParts: readonly ModularSpriteDraftPart[],
): ModularSpriteDraftPart {
  const baseKey = (region.suggestedRole || `part-${index + 1}`).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || `part-${index + 1}`;
  const taken = new Set(existingParts.map(part => part.partKey));
  let partKey = baseKey;
  let suffix = 2;
  while (taken.has(partKey)) partKey = `${baseKey}-${suffix++}`;
  return {
    partKey,
    name: region.suggestedRole || `Part ${index + 1}`,
    role: region.suggestedRole || 'custom',
    side: 'none',
    required: true,
    order: index,
    extractionFrame: region.normalizedBounds,
    contentBounds: region.normalizedBounds,
    regionIds: [region.id],
  };
}

function cloneGrouping(grouping: RegionGrouping): RegionGrouping {
  return {
    parts: structuredClone(grouping.parts),
    excludedRegionIds: [...grouping.excludedRegionIds],
  };
}

function uniqueSorted(ids: Iterable<number>): number[] {
  return [...new Set(ids)].sort((left, right) => left - right);
}

function removeRegionIds(grouping: RegionGrouping, regionIds: ReadonlySet<number>): RegionGrouping {
  return {
    parts: grouping.parts
      .map(part => ({ ...part, regionIds: part.regionIds.filter(regionId => !regionIds.has(regionId)) }))
      .filter(part => part.regionIds.length > 0),
    excludedRegionIds: grouping.excludedRegionIds.filter(regionId => !regionIds.has(regionId)),
  };
}

function unionBounds(regions: readonly DetectedRegion[]): DetectedRegion {
  const first = regions[0];
  if (!first) throw new Error('Cannot create a part without a region');
  const x = Math.min(...regions.map(region => region.bounds.x));
  const y = Math.min(...regions.map(region => region.bounds.y));
  const right = Math.max(...regions.map(region => region.bounds.x + region.bounds.width));
  const bottom = Math.max(...regions.map(region => region.bounds.y + region.bounds.height));
  const width = Math.max(1, right - x);
  const height = Math.max(1, bottom - y);
  const normalizedX = Math.min(...regions.map(region => region.normalizedBounds.x));
  const normalizedY = Math.min(...regions.map(region => region.normalizedBounds.y));
  const normalizedRight = Math.max(...regions.map(region => region.normalizedBounds.x + region.normalizedBounds.width));
  const normalizedBottom = Math.max(...regions.map(region => region.normalizedBounds.y + region.normalizedBounds.height));
  const normalizedBounds: NormalizedRect = {
    x: clamp(normalizedX, 0, 1),
    y: clamp(normalizedY, 0, 1),
    width: clamp(normalizedRight - normalizedX, 0, 1),
    height: clamp(normalizedBottom - normalizedY, 0, 1),
  };
  return {
    ...first,
    bounds: { x, y, width, height },
    normalizedBounds,
    area: regions.reduce((sum, region) => sum + region.area, 0),
    centroid: {
      x: regions.reduce((sum, region) => sum + region.centroid.x * region.area, 0) / Math.max(1, regions.reduce((sum, region) => sum + region.area, 0)),
      y: regions.reduce((sum, region) => sum + region.centroid.y * region.area, 0) / Math.max(1, regions.reduce((sum, region) => sum + region.area, 0)),
    },
  };
}

function syntheticRegion(regions: readonly DetectedRegion[], width: number, height: number): DetectedRegion {
  const first = regions[0];
  if (!first) throw new Error('Cannot create a part without a region');
  const x = Math.min(...regions.map(region => region.bounds.x));
  const y = Math.min(...regions.map(region => region.bounds.y));
  const right = Math.max(...regions.map(region => region.bounds.x + region.bounds.width));
  const bottom = Math.max(...regions.map(region => region.bounds.y + region.bounds.height));
  const area = regions.reduce((sum, region) => sum + region.area, 0);
  return {
    ...first,
    bounds: { x, y, width: Math.max(1, right - x), height: Math.max(1, bottom - y) },
    normalizedBounds: { x: x / width, y: y / height, width: (right - x) / width, height: (bottom - y) / height },
    area,
    centroid: {
      x: regions.reduce((sum, region) => sum + region.centroid.x * region.area, 0) / Math.max(1, area),
      y: regions.reduce((sum, region) => sum + region.centroid.y * region.area, 0) / Math.max(1, area),
    },
  };
}

export function createInitialGrouping(
  input: Pick<ProcessedModularSprite, 'regions'> | readonly DetectedRegion[],
  createPart: PartFactory = defaultPartFactory,
): RegionGrouping {
  const regions = asRegions(input);
  const parts: ModularSpriteDraftPart[] = [];
  for (const [index, region] of regions.entries()) {
    const part = createPart(region, index, parts);
    parts.push({ ...part, regionIds: [region.id] });
  }
  // Force a validation pass at the boundary so a bad adapter cannot create a
  // partially assigned initial state.
  const grouping = { parts, excludedRegionIds: [] };
  const validation = validateGrouping(grouping, regions.map(region => region.id));
  if (!validation.valid) throw new Error(`Invalid initial region grouping: ${validation.errors.join('; ')}`);
  return grouping;
}

export function moveRegionsToPart(
  grouping: RegionGrouping,
  regionIds: readonly number[],
  targetPartKey: string,
): RegionGroupingChange {
  const selected = new Set(regionIds);
  if (selected.size === 0) return { grouping: cloneGrouping(grouping), affectedPartKeys: [] };
  if (!grouping.parts.some(part => part.partKey === targetPartKey)) throw new Error(`Unknown target part: ${targetPartKey}`);
  const affectedPartKeys = grouping.parts.filter(part => part.partKey === targetPartKey || part.regionIds.some(id => selected.has(id))).map(part => part.partKey);
  const next = removeRegionIds(grouping, selected);
  const target = next.parts.find(part => part.partKey === targetPartKey);
  if (!target) throw new Error(`Unknown target part: ${targetPartKey}`);
  target.regionIds = uniqueSorted([...target.regionIds, ...selected]);
  return { grouping: next, affectedPartKeys };
}

export function createPartFromRegions(
  grouping: RegionGrouping,
  regions: readonly DetectedRegion[],
  regionIds: readonly number[],
  createPart: PartFactory = defaultPartFactory,
  dimensions?: { width: number; height: number },
): RegionGroupingChange {
  const selected = new Set(regionIds);
  const selectedRegions = regions.filter(region => selected.has(region.id));
  if (selectedRegions.length === 0) return { grouping: cloneGrouping(grouping), affectedPartKeys: [] };
  const affectedPartKeys = grouping.parts.filter(part => part.regionIds.some(id => selected.has(id))).map(part => part.partKey);
  const next = removeRegionIds(grouping, selected);
  const synthetic = dimensions ? syntheticRegion(selectedRegions, dimensions.width, dimensions.height) : unionBounds(selectedRegions);
  const part = createPart(synthetic, next.parts.length, next.parts);
  next.parts.push({ ...part, regionIds: selectedRegions.map(region => region.id) });
  return { grouping: next, affectedPartKeys: [...affectedPartKeys, part.partKey] };
}

export function excludeRegions(grouping: RegionGrouping, regionIds: readonly number[]): RegionGroupingChange {
  const selected = new Set(regionIds);
  if (selected.size === 0) return { grouping: cloneGrouping(grouping), affectedPartKeys: [] };
  const affectedPartKeys = grouping.parts.filter(part => part.regionIds.some(id => selected.has(id))).map(part => part.partKey);
  const next = removeRegionIds(grouping, selected);
  next.excludedRegionIds = uniqueSorted([...next.excludedRegionIds, ...selected]);
  return { grouping: next, affectedPartKeys };
}

export function renamePart(grouping: RegionGrouping, partKey: string, name: string): RegionGroupingChange {
  const next = cloneGrouping(grouping);
  const part = next.parts.find(candidate => candidate.partKey === partKey);
  if (!part) return { grouping: next, affectedPartKeys: [] };
  part.name = name;
  return { grouping: next, affectedPartKeys: [partKey] };
}

export function removePart(grouping: RegionGrouping, partKey: string): RegionGroupingChange {
  const target = grouping.parts.find(part => part.partKey === partKey);
  if (!target) return { grouping: cloneGrouping(grouping), affectedPartKeys: [] };
  const next = cloneGrouping(grouping);
  next.parts = next.parts.filter(part => part.partKey !== partKey);
  next.excludedRegionIds = uniqueSorted([...next.excludedRegionIds, ...target.regionIds]);
  return { grouping: next, affectedPartKeys: [partKey] };
}

export function reconcileGrouping(
  grouping: RegionGrouping,
  regionMapping: ReadonlyMap<number, readonly number[]>,
  nextRegionIds: readonly number[],
): RegionGrouping {
  const mapIds = (ids: readonly number[]): number[] => uniqueSorted(ids.flatMap(id => regionMapping.get(id) ?? []));
  const parts = grouping.parts.map(part => ({ ...structuredClone(part), regionIds: mapIds(part.regionIds) }));
  const excludedRegionIds = mapIds(grouping.excludedRegionIds);
  const assigned = new Set([...parts.flatMap(part => part.regionIds), ...excludedRegionIds]);
  for (const regionId of nextRegionIds) if (!assigned.has(regionId)) excludedRegionIds.push(regionId);
  return { parts, excludedRegionIds: uniqueSorted(excludedRegionIds) };
}

export function validateGrouping(grouping: RegionGrouping, existingRegionIds: readonly number[]): GroupingValidation {
  const known = new Set(existingRegionIds);
  const locations = new Map<number, number>();
  const errors: string[] = [];
  const unknownRegionIds: number[] = [];
  const duplicateRegionIds: number[] = [];
  const record = (regionId: number): void => {
    if (!known.has(regionId)) unknownRegionIds.push(regionId);
    const count = (locations.get(regionId) ?? 0) + 1;
    locations.set(regionId, count);
    if (count > 1) duplicateRegionIds.push(regionId);
  };
  for (const part of grouping.parts) {
    if (!part.partKey.trim()) errors.push('Every part needs a non-empty partKey');
    for (const regionId of part.regionIds) record(regionId);
  }
  for (const regionId of grouping.excludedRegionIds) record(regionId);
  const missingRegionIds = existingRegionIds.filter(regionId => !locations.has(regionId));
  if (duplicateRegionIds.length) errors.push(`Region IDs are assigned more than once: ${uniqueSorted(duplicateRegionIds).join(', ')}`);
  if (unknownRegionIds.length) errors.push(`Unknown region IDs: ${uniqueSorted(unknownRegionIds).join(', ')}`);
  if (missingRegionIds.length) errors.push(`Unassigned region IDs: ${uniqueSorted(missingRegionIds).join(', ')}`);
  const keys = new Set<string>();
  for (const part of grouping.parts) {
    if (keys.has(part.partKey)) errors.push(`Duplicate partKey: ${part.partKey}`);
    keys.add(part.partKey);
  }
  return {
    valid: errors.length === 0,
    errors,
    duplicateRegionIds: uniqueSorted(duplicateRegionIds),
    missingRegionIds: uniqueSorted(missingRegionIds),
    unknownRegionIds: uniqueSorted(unknownRegionIds),
  };
}
