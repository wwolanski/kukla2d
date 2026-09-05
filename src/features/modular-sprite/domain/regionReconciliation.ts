import { clamp, rectIntersectionOverUnion } from './imageMath.js';
import { reconcileGrouping, type RegionGrouping } from './partGrouping.js';

import type { DetectedRegion } from './contracts.js';

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

function centerDistance(left: DetectedRegion, right: DetectedRegion): number {
  return Math.hypot(left.centroid.x - right.centroid.x, left.centroid.y - right.centroid.y);
}

function pairConfidence(previous: DetectedRegion, next: DetectedRegion): number {
  const iou = rectIntersectionOverUnion(previous.normalizedBounds, next.normalizedBounds);
  const distance = clamp(centerDistance(previous, next) / Math.SQRT2, 0, 1);
  const centerScore = 1 - distance;
  const previousArea = Math.max(Number.EPSILON, previous.normalizedBounds.width * previous.normalizedBounds.height);
  const nextArea = Math.max(Number.EPSILON, next.normalizedBounds.width * next.normalizedBounds.height);
  const areaScore = Math.exp(-Math.abs(Math.log(nextArea / previousArea)));
  return clamp(iou * 0.55 + centerScore * 0.3 + areaScore * 0.15, 0, 1);
}

function candidateThreshold(previous: DetectedRegion, next: DetectedRegion): number {
  const iou = rectIntersectionOverUnion(previous.normalizedBounds, next.normalizedBounds);
  const distance = centerDistance(previous, next);
  // A split component has no one-to-one IoU with the original component, so
  // centroid/containment evidence is enough to keep both children.  Far-away
  // components still need a meaningful overlap or a close centroid.
  return iou > 0 ? 0.12 : distance <= 0.08 ? 0.18 : 0.42;
}

export function mapRegions(
  previousRegions: readonly DetectedRegion[],
  nextRegions: readonly DetectedRegion[],
): RegionReconciliationReport {
  const scores = new Map<number, Array<{ region: DetectedRegion; score: number }>>();
  for (const previous of previousRegions) {
    const candidates = nextRegions
      .map(region => ({ region, score: pairConfidence(previous, region) }))
      .filter(candidate => candidate.score >= candidateThreshold(previous, candidate.region))
      .sort((left, right) => right.score - left.score || left.region.id - right.region.id);
    scores.set(previous.id, candidates);
  }

  // A new component may be considered by several old components after a
  // merge. Assign it to the strongest claimant so a physical region cannot
  // end up in two different parts. A single old component may still retain
  // several children after a split.
  const winners = new Map<number, { previousId: number; score: number }>();
  for (const [previousId, candidates] of scores) {
    for (const candidate of candidates) {
      const current = winners.get(candidate.region.id);
      if (!current || candidate.score > current.score || (candidate.score === current.score && previousId < current.previousId)) {
        winners.set(candidate.region.id, { previousId, score: candidate.score });
      }
    }
  }

  const mappings: RegionMapping[] = previousRegions.map(previous => {
    const candidates = (scores.get(previous.id) ?? [])
      .filter(candidate => winners.get(candidate.region.id)?.previousId === previous.id)
      .filter((candidate, index, all) => index === 0 || candidate.score >= Math.max(0.2, (all[0]?.score ?? 0) * 0.55))
      .map(candidate => candidate.region.id)
      .sort((left, right) => left - right);
    const confidence = candidates.length > 0
      ? Math.max(...(scores.get(previous.id) ?? []).filter(candidate => candidates.includes(candidate.region.id)).map(candidate => candidate.score))
      : 0;
    return { previousRegionId: previous.id, nextRegionIds: candidates, confidence };
  });
  const mappedNext = new Set(mappings.flatMap(mapping => mapping.nextRegionIds));
  return {
    mappings,
    lostPreviousRegionIds: mappings.filter(mapping => mapping.nextRegionIds.length === 0).map(mapping => mapping.previousRegionId),
    uncertainPreviousRegionIds: mappings.filter(mapping => mapping.nextRegionIds.length > 1 || (mapping.nextRegionIds.length > 0 && mapping.confidence < 0.55)).map(mapping => mapping.previousRegionId),
    unmatchedNextRegionIds: nextRegions.map(region => region.id).filter(id => !mappedNext.has(id)),
  };
}

export function reconcileRegionGrouping(
  grouping: RegionGrouping,
  previousRegions: readonly DetectedRegion[],
  nextRegions: readonly DetectedRegion[],
): RegionReconciliationResult {
  const report = mapRegions(previousRegions, nextRegions);
  const mapping = new Map(report.mappings.map(item => [item.previousRegionId, item.nextRegionIds]));
  return {
    grouping: reconcileGrouping(grouping, mapping, nextRegions.map(region => region.id)),
    report,
  };
}

/**
 * Maps a preview grouping to a full-resolution processing result. Both
 * results use normalized geometry, so this is deliberately the same global
 * reconciliation algorithm used after recipe changes.
 */
export function reconcilePreviewToFullResolution(
  grouping: RegionGrouping,
  previewRegions: readonly DetectedRegion[],
  fullRegions: readonly DetectedRegion[],
): RegionReconciliationResult {
  return reconcileRegionGrouping(grouping, previewRegions, fullRegions);
}

