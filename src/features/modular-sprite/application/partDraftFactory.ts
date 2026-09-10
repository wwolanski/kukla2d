import { semanticRoleIdForLegacyRole } from "@kukla2d/modular-sprite-schema";

import { createDefaultExtractionFrame } from "../domain/processing/extractParts.js";

import type {
  DetectedRegion,
  ModularSpriteDraftPart,
} from "../domain/contracts.types.js";

export function slugPartKey(value: string): string {
  return (
    value
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "part"
  );
}

export function partKeyForName(
  name: string,
  parts: readonly ModularSpriteDraftPart[],
  currentPartKey?: string,
): string {
  const base = slugPartKey(name);
  const current = currentPartKey?.toLowerCase();
  const taken = new Set(
    parts
      .filter((part) => part.partKey.toLowerCase() !== current)
      .map((part) => part.partKey.toLowerCase()),
  );
  if (!taken.has(base)) return base;
  let suffix = 2;
  while (taken.has(`${base}-${suffix}`)) suffix += 1;
  return `${base}-${suffix}`;
}

export function uniquePartKey(
  base: string,
  parts: readonly ModularSpriteDraftPart[],
): string {
  const taken = new Set(parts.map((part) => part.partKey));
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
  const suggested = region.suggestedRole || "custom";
  const semanticRoleId = semanticRoleIdForLegacyRole(suggested);
  const name =
    suggested === "custom"
      ? `Part ${index + 1}`
      : suggested.replaceAll("-", " ");
  return {
    partKey: uniquePartKey(slugPartKey(name), existingParts),
    name,
    role: suggested,
    ...(semanticRoleId ? { semanticRoleId } : {}),
    side: "none",
    qualifiers: {},
    required: true,
    order: index,
    extractionFrame: createDefaultExtractionFrame(
      region,
      sourceWidth,
      sourceHeight,
    ),
    contentBounds: region.normalizedBounds,
    regionIds: [region.id],
  };
}

export function createEmptyDraftPart(
  index: number,
  existingParts: readonly ModularSpriteDraftPart[],
): ModularSpriteDraftPart {
  const name = `Part ${index + 1}`;
  const semanticRoleId = semanticRoleIdForLegacyRole("custom");
  return {
    partKey: uniquePartKey(slugPartKey(name), existingParts),
    name,
    role: "custom",
    ...(semanticRoleId ? { semanticRoleId } : {}),
    side: "none",
    qualifiers: {},
    required: true,
    order: index,
    extractionFrame: { x: 0, y: 0, width: 1, height: 1 },
    contentBounds: { x: 0, y: 0, width: 0, height: 0 },
    regionIds: [],
  };
}
