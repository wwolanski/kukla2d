import type { ModularSpriteProcessingRecipe } from '@kukla2d/contracts';
import { createSpriteObservation } from '@kukla2d/modular-sprite-schema';

import { rgbToOklab } from '../imageMath.js';
import { analyzeModularSpriteBackground } from './backgroundAnalysis.js';
import { computeMatteRange, createMatte, precomputeOklabAsync, PROCESSING_CHUNK_ROWS } from './chromaKey.js';
import { connectedComponents, MAX_DETECTED_REGIONS, restoreSplitPixels } from './connectedComponents.js';
import { componentContour } from './contours.js';
import { detectionStrokesPass, matteStrokesPass } from './maskStrokes.js';
import { buildDetectionMask } from './morphology.js';
import { suggestRole } from './regionClassification.js';

import type {
  DetectedRegion,
  ProcessedModularSprite,
  ProcessModularSpriteRequest,
  RgbaImageData,
} from '../contracts.js';
import type { ProcessingHooks } from './types.js';

function buildRegions(detection: Uint8Array, beforeSplit: Uint8Array | null, width: number, height: number, recipe: ModularSpriteProcessingRecipe): {
  labels: Int32Array;
  regions: DetectedRegion[];
  discardedRegionCount: number;
} {
  const minimumArea = Math.max(1, Math.round(width * height * recipe.detection.minimumRegionAreaRatio));
  const { labels, stats, discardedRegionCount } = connectedComponents(detection, width, height, minimumArea);
  if (beforeSplit) restoreSplitPixels(labels, beforeSplit, width, height);
  const regions: DetectedRegion[] = stats.map(component => {
    const bounds = {
      x: component.minX,
      y: component.minY,
      width: component.maxX - component.minX + 1,
      height: component.maxY - component.minY + 1,
    };
    const normalizedBounds = {
      x: bounds.x / width,
      y: bounds.y / height,
      width: bounds.width / width,
      height: bounds.height / height,
    };
    const centroid = {
      x: Math.min(1, Math.max(0, (component.sumX + 0.5) / width)),
      y: Math.min(1, Math.max(0, (component.sumY + 0.5) / height)),
    };
    return {
      id: component.id,
      area: component.area,
      bounds,
      normalizedBounds,
      centroid,
      suggestedRole: suggestRole(normalizedBounds, component.area / (width * height)),
      contour: componentContour(labels, component.id, width, height, centroid, component),
    };
  });
  return { labels, regions, discardedRegionCount };
}

function assertValidImage(image: RgbaImageData): void {
  if (image.width <= 0 || image.height <= 0 || image.data.length !== image.width * image.height * 4) throw new Error('Invalid RGBA image data');
}

function warningsFor(recipe: ModularSpriteProcessingRecipe, background: ReturnType<typeof analyzeModularSpriteBackground>, regions: readonly DetectedRegion[], discardedRegionCount: number): string[] {
  const warnings: string[] = [];
  if (recipe.background.mode === 'chroma' && background.confidence < 0.55) warnings.push('Low border-color confidence; pick the background color manually.');
  if (regions.length === 0) warnings.push('No foreground regions were detected.');
  if (discardedRegionCount > 0) warnings.push(`Showing the ${MAX_DETECTED_REGIONS} largest regions; ${discardedRegionCount} smaller regions were ignored. Increase the minimum region area to remove noise.`);
  return warnings;
}

function makeResult(image: RgbaImageData, recipe: ModularSpriteProcessingRecipe, background: ReturnType<typeof analyzeModularSpriteBackground>, rgba: Uint8ClampedArray, matte: Uint8ClampedArray, labels: Int32Array, regions: DetectedRegion[], discardedRegionCount: number): ProcessedModularSprite {
  return {
    width: image.width,
    height: image.height,
    rgba,
    matte,
    labels,
    regions,
    background,
    warnings: warningsFor(recipe, background, regions, discardedRegionCount),
    observation: createSpriteObservation({ width: image.width, height: image.height, matte, labels, regions }),
  };
}

export function processModularSprite(request: ProcessModularSpriteRequest): ProcessedModularSprite {
  const { image, recipe } = request;
  assertValidImage(image);
  const background = analyzeModularSpriteBackground(image);
  const { matte, rgba } = createMatte(image, recipe);
  matteStrokesPass(matte, rgba, recipe, image.width, image.height);
  const detection = buildDetectionMask(matte, recipe, image.width, image.height);
  const beforeSplit = detectionStrokesPass(detection, recipe, image.width, image.height);
  const { labels, regions, discardedRegionCount } = buildRegions(detection, beforeSplit, image.width, image.height, recipe);
  return makeResult(image, recipe, background, rgba, matte, labels, regions, discardedRegionCount);
}

export async function processModularSpriteAsync(request: ProcessModularSpriteRequest, hooks: ProcessingHooks, oklab?: Float32Array | null): Promise<ProcessedModularSprite> {
  const { image, recipe } = request;
  assertValidImage(image);
  hooks.throwIfAborted();
  const background = analyzeModularSpriteBackground(image);
  hooks.report(0.05, 'Analyzing background');
  await hooks.checkpoint();

  const matte = new Uint8ClampedArray(image.width * image.height);
  const rgba = new Uint8ClampedArray(image.data);
  if (recipe.background.mode === 'chroma') {
    const backgroundLab = rgbToOklab(recipe.background.color.r, recipe.background.color.g, recipe.background.color.b);
    for (let y = 0; y < image.height; y += PROCESSING_CHUNK_ROWS) {
      hooks.throwIfAborted();
      computeMatteRange(image, recipe, backgroundLab, oklab ?? null, matte, rgba, y, y + PROCESSING_CHUNK_ROWS);
      hooks.report(0.05 + 0.4 * (y / image.height), 'Keying background');
      await hooks.checkpoint();
    }
  } else {
    computeMatteRange(image, recipe, [0, 0, 0], null, matte, rgba, 0, image.height);
  }
  hooks.throwIfAborted();
  matteStrokesPass(matte, rgba, recipe, image.width, image.height);
  hooks.report(0.5, 'Applying mask strokes');
  await hooks.checkpoint();
  hooks.throwIfAborted();
  const detection = buildDetectionMask(matte, recipe, image.width, image.height);
  hooks.report(0.6, 'Cleaning detection mask');
  await hooks.checkpoint();
  hooks.throwIfAborted();
  const beforeSplit = detectionStrokesPass(detection, recipe, image.width, image.height);
  hooks.report(0.68, 'Finding regions');
  await hooks.checkpoint();
  hooks.throwIfAborted();
  const { labels, regions, discardedRegionCount } = buildRegions(detection, beforeSplit, image.width, image.height, recipe);
  hooks.report(0.85, 'Tracing outlines');
  await hooks.checkpoint();
  hooks.throwIfAborted();
  hooks.report(1, 'Done');
  return makeResult(image, recipe, background, rgba, matte, labels, regions, discardedRegionCount);
}

export { precomputeOklabAsync };
