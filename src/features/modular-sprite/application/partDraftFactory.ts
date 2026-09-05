import { semanticRoleIdForLegacyRole } from '@kukla2d/modular-sprite-schema';

import { createDefaultExtractionFrame } from '../domain/processor.js';

import type { DetectedRegion, ModularSpriteDraftPart } from '../domain/contracts.js';

export function slugPartKey(value: string): string {
  return value.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'part';
}

export function uniquePartKey(base: string, parts: readonly ModularSpriteDraftPart[]): string {
  const taken = new Set(parts.map(part => part.partKey));
  if (!taken.has(base)) return base;
  let suffix = 2;
  while (taken.has(`${base}-${suffix}`)) suffix += 1;
  return `${base}-${suffix}`;
}

export function createDraftPart(
  region: DetectedRegion,
  sourceWidth: number,
  sourceHeight: number,
  index: number,
  existingParts: readonly ModularSpriteDraftPart[],
): ModularSpriteDraftPart {
  const suggested = region.suggestedRole || 'custom';
  const semanticRoleId = semanticRoleIdForLegacyRole(suggested);
  const name = suggested === 'custom' ? `Part ${index + 1}` : suggested.replaceAll('-', ' ');
  return {
    partKey: uniquePartKey(slugPartKey(name), existingParts),
    name,
    role: suggested,
    ...(semanticRoleId ? { semanticRoleId } : {}),
    side: 'none',
    qualifiers: {},
    required: true,
    order: index,
    extractionFrame: createDefaultExtractionFrame(region, sourceWidth, sourceHeight),
    contentBounds: region.normalizedBounds,
    regionIds: [region.id],
  };
}

