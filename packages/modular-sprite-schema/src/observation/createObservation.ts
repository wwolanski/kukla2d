import type { NormalizedRect, ObservedComponent, SpriteObservation } from '../contracts/index.js';

export interface ObservationRegion { id: number; area: number; bounds: { x: number; y: number; width: number; height: number }; centroid: { x: number; y: number } }
export interface ObservationInput { width: number; height: number; matte: Uint8Array | Uint8ClampedArray; labels: Int32Array; regions: readonly ObservationRegion[]; maskSize?: number }

const union = (items: readonly NormalizedRect[]): NormalizedRect => {
  if (!items.length) return { x: 0, y: 0, width: 0, height: 0 };
  const x = Math.min(...items.map(item => item.x)); const y = Math.min(...items.map(item => item.y));
  const right = Math.max(...items.map(item => item.x + item.width)); const bottom = Math.max(...items.map(item => item.y + item.height));
  return { x, y, width: right - x, height: bottom - y };
};

export function createSpriteObservation(input: ObservationInput): SpriteObservation {
  const size = input.maskSize ?? 32;
  const canvasArea = input.width * input.height;
  const components: ObservedComponent[] = input.regions.map(region => {
    const data = new Uint8Array(size * size);
    for (let oy = 0; oy < size; oy += 1) for (let ox = 0; ox < size; ox += 1) {
      const px = Math.min(region.bounds.x + region.bounds.width - 1, region.bounds.x + Math.floor((ox + 0.5) * region.bounds.width / size));
      const py = Math.min(region.bounds.y + region.bounds.height - 1, region.bounds.y + Math.floor((oy + 0.5) * region.bounds.height / size));
      if (input.labels[py * input.width + px] === region.id && input.matte[py * input.width + px]! > 0) data[oy * size + ox] = 1;
    }
    const bounds = { x: region.bounds.x / input.width, y: region.bounds.y / input.height, width: region.bounds.width / input.width, height: region.bounds.height / input.height };
    return { componentId: region.id, bounds, centroid: region.centroid, foregroundAreaRatio: region.area / canvasArea, boundingBoxAreaRatio: region.bounds.width * region.bounds.height / canvasArea, aspectRatio: region.bounds.width / region.bounds.height, shapeMask: { width: size, height: size, data } };
  });
  const foregroundBounds = union(components.map(item => item.bounds));
  const foreground = components.reduce((sum, item) => sum + item.foregroundAreaRatio, 0);
  const boundsArea = components.reduce((sum, item) => sum + item.boundingBoxAreaRatio, 0);
  const segmentationQualityBp = Math.round(10000 * Math.min(1, foreground / Math.max(foreground, boundsArea * 0.08, 1 / canvasArea)));
  return { observationVersion: 1, processorVersion: 1, canvas: { width: input.width, height: input.height, aspectRatio: input.width / input.height }, foregroundBounds, components, segmentationQualityBp };
}

export function observationHash(observation: SpriteObservation): string {
  const compact = JSON.stringify({ v: observation.observationVersion, c: observation.canvas, b: observation.foregroundBounds, p: observation.components.map(c => [c.bounds, c.centroid, c.foregroundAreaRatio, Array.from(c.shapeMask.data)]) });
  let hash = 2166136261;
  for (let index = 0; index < compact.length; index += 1) { hash ^= compact.charCodeAt(index); hash = Math.imul(hash, 16777619); }
  return (hash >>> 0).toString(16).padStart(8, '0');
}
