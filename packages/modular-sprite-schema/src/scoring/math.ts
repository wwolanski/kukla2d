import type { EncodedBinaryMask, NormalizedRect, ObservedComponent } from '../contracts/index.js';

export const clampBp = (value: number): number => Math.round(Math.max(0, Math.min(10000, value)));
export const exponentialScore = (error: number, tolerance: number): number => clampBp(10000 * Math.exp(-error / Math.max(tolerance, 1e-6)));
export const ratioScore = (actual: number, expected: number, tolerance: number): number => actual > 0 && expected > 0 ? exponentialScore(Math.abs(Math.log(actual / expected)), tolerance) : actual === expected ? 10000 : 0;
export const distanceScore = (actual: number, tolerance: number): number => exponentialScore(actual, tolerance);
export function iou(left: NormalizedRect, right: NormalizedRect): number {
  const width = Math.max(0, Math.min(left.x + left.width, right.x + right.width) - Math.max(left.x, right.x));
  const height = Math.max(0, Math.min(left.y + left.height, right.y + right.height) - Math.max(left.y, right.y));
  const intersection = width * height; const union = left.width * left.height + right.width * right.height - intersection;
  return union > 0 ? intersection / union : 0;
}
export function maskSimilarity(left: EncodedBinaryMask, right: EncodedBinaryMask): number {
  const width = Math.min(left.width, right.width); const height = Math.min(left.height, right.height); let intersection = 0; let union = 0;
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) { const a = left.data[y * left.width + x] ?? 0; const b = right.data[y * right.width + x] ?? 0; if (a || b) union += 1; if (a && b) intersection += 1; }
  return union ? intersection / union : 1;
}
export const componentUnaryScore = (actual: ObservedComponent, expected: Omit<ObservedComponent, 'componentId'>): number => {
  const position = distanceScore(Math.hypot(actual.centroid.x - expected.centroid.x, actual.centroid.y - expected.centroid.y), 0.2);
  const area = ratioScore(actual.foregroundAreaRatio, expected.foregroundAreaRatio, 0.5);
  const aspect = ratioScore(actual.aspectRatio, expected.aspectRatio, 0.5);
  const shape = clampBp(maskSimilarity(actual.shapeMask, expected.shapeMask) * 10000);
  return Math.round(position * 0.35 + area * 0.2 + aspect * 0.15 + shape * 0.3);
};
