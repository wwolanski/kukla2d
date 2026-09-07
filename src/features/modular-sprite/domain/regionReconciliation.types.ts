import type { RegionGrouping } from "./partGrouping.types.js";

export interface RegionMapping {
  previousRegionId: number;
  nextRegionIds: number[];
  confidence: number;
}

export interface RegionReconciliationReport {
  mappings: RegionMapping[];
  lostPreviousRegionIds: number[];
  uncertainPreviousRegionIds: number[];
  unmatchedNextRegionIds: number[];
}

export interface RegionReconciliationResult {
  grouping: RegionGrouping;
  report: RegionReconciliationReport;
}
