import type { NormalizedRect } from '@kukla2d/contracts';

import { clamp, normalizedRect, pixelRect } from '../imageMath.js';

import type {
  DetectedRegion,
  ExtractedPart,
  ModularSpriteDraftPart,
  ProcessedModularSprite,
} from '../contracts.js';

export function createDefaultExtractionFrame(region: DetectedRegion, sourceWidth: number, sourceHeight: number): NormalizedRect {
  const padding = clamp(Math.round(Math.max(sourceWidth, sourceHeight) * 0.01), 4, 32);
  const x = Math.max(0, region.bounds.x - padding);
  const y = Math.max(0, region.bounds.y - padding);
  const right = Math.min(sourceWidth, region.bounds.x + region.bounds.width + padding);
  const bottom = Math.min(sourceHeight, region.bounds.y + region.bounds.height + padding);
  return normalizedRect({ x, y, width: right - x, height: bottom - y }, sourceWidth, sourceHeight);
}

export function unionNormalizedBounds(rectangles: readonly NormalizedRect[]): NormalizedRect {
  if (rectangles.length === 0) return { x: 0, y: 0, width: 0, height: 0 };
  const minX = Math.min(...rectangles.map(rect => rect.x));
  const minY = Math.min(...rectangles.map(rect => rect.y));
  const maxX = Math.max(...rectangles.map(rect => rect.x + rect.width));
  const maxY = Math.max(...rectangles.map(rect => rect.y + rect.height));
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

export function extractModularSpriteParts(processed: ProcessedModularSprite, parts: readonly ModularSpriteDraftPart[]): ExtractedPart[] {
  const regionMap = new Map(processed.regions.map(region => [region.id, region]));
  return parts.map(part => {
    const selectedLabels = new Set(part.regionIds);
    const frame = pixelRect(part.extractionFrame, processed.width, processed.height);
    const output = new Uint8ClampedArray(frame.width * frame.height * 4);
    let overflow = false;
    for (let y = 0; y < processed.height; y += 1) {
      for (let x = 0; x < processed.width; x += 1) {
        const sourcePixel = y * processed.width + x;
        if (!selectedLabels.has(processed.labels[sourcePixel] ?? 0)) continue;
        if (x < frame.x || x >= frame.x + frame.width || y < frame.y || y >= frame.y + frame.height) {
          if ((processed.matte[sourcePixel] ?? 0) > 0) overflow = true;
          continue;
        }
        const outputPixel = (y - frame.y) * frame.width + (x - frame.x);
        const sourceOffset = sourcePixel * 4;
        const outputOffset = outputPixel * 4;
        output[outputOffset] = processed.rgba[sourceOffset] ?? 0;
        output[outputOffset + 1] = processed.rgba[sourceOffset + 1] ?? 0;
        output[outputOffset + 2] = processed.rgba[sourceOffset + 2] ?? 0;
        output[outputOffset + 3] = processed.matte[sourcePixel] ?? 0;
      }
    }
    const selectedRegions = part.regionIds
      .map(id => regionMap.get(id))
      .filter((region): region is DetectedRegion => Boolean(region));
    const contentBounds = selectedRegions.length > 0
      ? unionNormalizedBounds(selectedRegions.map(region => region.normalizedBounds))
      : part.contentBounds;
    return {
      partKey: part.partKey,
      image: { width: frame.width, height: frame.height, data: output },
      contentBounds,
      componentSeeds: selectedRegions.map(region => region.centroid),
      overflow,
    };
  });
}

