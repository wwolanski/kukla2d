import type {
  DetectedRegion,
  ModularSpriteDraftPart,
} from "./contracts.types.js";

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
