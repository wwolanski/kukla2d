/**
 * Interior point sampling — pure, no DOM.
 */

/**
 * Sample interior points using stratified random sampling (jittered grid).
 *
 * @param {Uint8ClampedArray} data
 * @param {number}            width
 * @param {number}            height
 * @param {number}            [alphaThreshold=5]
 * @param {number}            [gridSpacing=30]
 * @returns {Array<[number,number]>}
 */
import type { Point2D } from "./contour.types.js";

export function sampleInterior(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  alphaThreshold = 5,
  gridSpacing = 30,
): Point2D[] {
  const points: Point2D[] = [];
  const jitter = gridSpacing * 0.4;

  for (let y = gridSpacing; y < height - gridSpacing / 2; y += gridSpacing) {
    for (let x = gridSpacing; x < width - gridSpacing / 2; x += gridSpacing) {
      const jx = x + (Math.random() - 0.5) * jitter * 2;
      const jy = y + (Math.random() - 0.5) * jitter * 2;

      const cx = Math.max(0, Math.min(width - 1, Math.round(jx)));
      const cy = Math.max(0, Math.min(height - 1, Math.round(jy)));
      if ((data[(cy * width + cx) * 4 + 3] ?? 0) >= alphaThreshold) {
        points.push([jx, jy]);
      }
    }
  }
  return points;
}

/**
 * Remove interior points that are within `minDistance` of any edge point.
 *
 * @param {Array<[number,number]>} interiorPts
 * @param {Array<[number,number]>} edgePts
 * @param {number}                 minDistance
 * @returns {Array<[number,number]>}
 */
export function filterByEdgePadding(
  interiorPts: readonly Point2D[],
  edgePts: readonly Point2D[],
  minDistance: number,
): Point2D[] {
  const minDist2 = minDistance * minDistance;
  return interiorPts.filter((pt) => {
    for (const ep of edgePts) {
      const dx = pt[0] - ep[0];
      const dy = pt[1] - ep[1];
      if (dx * dx + dy * dy < minDist2) return false;
    }
    return true;
  });
}
