import { clamp, rectIntersectionOverUnion } from './imageMath.js';

import type {
  DetectedRegion,
  ModularSpriteTemplatePart,
  RegionMatch,
} from './contracts.js';

function matchConfidence(template: ModularSpriteTemplatePart, region: DetectedRegion): number {
  const expected = template.contentBounds;
  const actual = region.normalizedBounds;
  const expectedCenterX = expected.x + expected.width / 2;
  const expectedCenterY = expected.y + expected.height / 2;
  const actualCenterX = actual.x + actual.width / 2;
  const actualCenterY = actual.y + actual.height / 2;
  const centerScore = 1 - clamp(Math.hypot(expectedCenterX - actualCenterX, expectedCenterY - actualCenterY) / Math.SQRT2, 0, 1);
  const intersectionScore = rectIntersectionOverUnion(expected, actual);
  const expectedArea = Math.max(Number.EPSILON, expected.width * expected.height);
  const actualArea = Math.max(Number.EPSILON, actual.width * actual.height);
  const areaScore = Math.exp(-Math.abs(Math.log(actualArea / expectedArea)));
  const expectedAspect = expected.width / expected.height;
  const actualAspect = actual.width / actual.height;
  const aspectScore = Math.exp(-Math.abs(Math.log(actualAspect / expectedAspect)));
  return clamp(centerScore * 0.35 + intersectionScore * 0.35 + areaScore * 0.2 + aspectScore * 0.1, 0, 1);
}

function hungarian(cost: readonly (readonly number[])[]): number[] {
  const rowCount = cost.length;
  const columnCount = cost[0]?.length ?? 0;
  if (rowCount === 0) return [];
  if (columnCount < rowCount) throw new Error('Hungarian matrix must have at least as many columns as rows');
  const u = new Float64Array(rowCount + 1);
  const v = new Float64Array(columnCount + 1);
  const p = new Int32Array(columnCount + 1);
  const way = new Int32Array(columnCount + 1);

  for (let row = 1; row <= rowCount; row += 1) {
    p[0] = row;
    let column0 = 0;
    const minValues = new Float64Array(columnCount + 1);
    minValues.fill(Number.POSITIVE_INFINITY);
    const used = new Uint8Array(columnCount + 1);
    do {
      used[column0] = 1;
      const currentRow = p[column0] ?? 0;
      let delta = Number.POSITIVE_INFINITY;
      let nextColumn = 0;
      for (let column = 1; column <= columnCount; column += 1) {
        if (used[column]) continue;
        const current = (cost[currentRow - 1]?.[column - 1] ?? 1) - (u[currentRow] ?? 0) - (v[column] ?? 0);
        if (current < (minValues[column] ?? Number.POSITIVE_INFINITY)) {
          minValues[column] = current;
          way[column] = column0;
        }
        if ((minValues[column] ?? Number.POSITIVE_INFINITY) < delta) {
          delta = minValues[column] ?? Number.POSITIVE_INFINITY;
          nextColumn = column;
        }
      }
      for (let column = 0; column <= columnCount; column += 1) {
        if (used[column]) {
          const matchedRow = p[column] ?? 0;
          u[matchedRow] = (u[matchedRow] ?? 0) + delta;
          v[column] = (v[column] ?? 0) - delta;
        } else {
          minValues[column] = (minValues[column] ?? 0) - delta;
        }
      }
      column0 = nextColumn;
    } while ((p[column0] ?? 0) !== 0);

    do {
      const previousColumn = way[column0] ?? 0;
      p[column0] = p[previousColumn] ?? 0;
      column0 = previousColumn;
    } while (column0 !== 0);
  }

  const assignment = new Array<number>(rowCount).fill(-1);
  for (let column = 1; column <= columnCount; column += 1) {
    const row = p[column] ?? 0;
    if (row > 0) assignment[row - 1] = column - 1;
  }
  return assignment;
}

export function matchRegionsToTemplate(
  templateParts: readonly ModularSpriteTemplatePart[],
  regions: readonly DetectedRegion[],
): RegionMatch[] {
  if (templateParts.length === 0) return [];
  const columnCount = Math.max(templateParts.length, regions.length);
  const confidences: number[][] = templateParts.map(template => [
    ...regions.map(region => matchConfidence(template, region)),
    ...Array<number>(Math.max(0, columnCount - regions.length)).fill(0),
  ]);
  const assignment = hungarian(confidences.map(row => row.map(confidence => 1 - confidence)));
  return templateParts.map((template, index) => {
    const regionIndex = assignment[index] ?? -1;
    const region = regions[regionIndex];
    const confidence = region ? (confidences[index]?.[regionIndex] ?? 0) : 0;
    return {
      partKey: template.partKey,
      regionId: region?.id ?? null,
      confidence,
    };
  });
}
