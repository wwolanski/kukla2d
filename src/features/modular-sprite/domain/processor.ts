import type { ModularSpriteMaskStroke, ModularSpriteProcessingRecipe } from '@kukla2d/contracts';
import { createSpriteObservation } from '@kukla2d/modular-sprite-schema';

import { clamp, normalizedPoint, normalizedRect, pixelRect, rgbToOklab, smoothstep } from './imageMath.js';

import type {
  BackgroundAnalysis,
  DetectedRegion,
  ExtractedPart,
  ModularSpriteDraftPart,
  ProcessedModularSprite,
  ProcessModularSpriteRequest,
  RgbaImageData,
} from './contracts.js';

const NEIGHBORS_8 = [
  [-1, -1], [0, -1], [1, -1],
  [-1, 0], [1, 0],
  [-1, 1], [0, 1], [1, 1],
] as const;

const MAX_DETECTED_REGIONS = 256;
const MAX_CONTOUR_CANDIDATES = 1024;
const MAX_CONTOUR_POINTS = 256;
const PROCESSING_CHUNK_ROWS = 64;

export function analyzeModularSpriteBackground(image: RgbaImageData): BackgroundAnalysis {
  const { data, width, height } = image;
  const borderIndices: number[] = [];
  for (let x = 0; x < width; x += 1) {
    borderIndices.push(x, (height - 1) * width + x);
  }
  for (let y = 1; y < height - 1; y += 1) {
    borderIndices.push(y * width, y * width + width - 1);
  }

  let transparent = 0;
  const bins = new Map<number, { count: number; red: number; green: number; blue: number }>();
  for (const pixelIndex of borderIndices) {
    const offset = pixelIndex * 4;
    const alpha = data[offset + 3] ?? 0;
    if (alpha < 16) transparent += 1;
    const red = data[offset] ?? 0;
    const green = data[offset + 1] ?? 0;
    const blue = data[offset + 2] ?? 0;
    const key = ((red >> 4) << 8) | ((green >> 4) << 4) | (blue >> 4);
    const bin = bins.get(key) ?? { count: 0, red: 0, green: 0, blue: 0 };
    bin.count += 1;
    bin.red += red;
    bin.green += green;
    bin.blue += blue;
    bins.set(key, bin);
  }

  const borderCount = Math.max(1, borderIndices.length);
  if (transparent / borderCount >= 0.5) {
    return { mode: 'alpha', color: { r: 0, g: 0, b: 0 }, confidence: transparent / borderCount };
  }

  let dominant = { count: 0, red: 0, green: 0, blue: 0 };
  for (const bin of bins.values()) {
    if (bin.count > dominant.count) dominant = bin;
  }
  const divisor = Math.max(1, dominant.count);
  return {
    mode: 'chroma',
    color: {
      r: Math.round(dominant.red / divisor),
      g: Math.round(dominant.green / divisor),
      b: Math.round(dominant.blue / divisor),
    },
    confidence: dominant.count / borderCount,
  };
}

function createMatte(
  image: RgbaImageData,
  recipe: ModularSpriteProcessingRecipe,
): { matte: Uint8ClampedArray; rgba: Uint8ClampedArray } {
  const matte = new Uint8ClampedArray(image.width * image.height);
  const rgba = new Uint8ClampedArray(image.data);
  const backgroundLab = rgbToOklab(recipe.background.color.r, recipe.background.color.g, recipe.background.color.b);
  computeMatteRange(image, recipe, backgroundLab, null, matte, rgba, 0, image.height);
  return { matte, rgba };
}

export function precomputeOklab(image: RgbaImageData): Float32Array {
  const oklab = new Float32Array(image.width * image.height * 3);
  precomputeOklabRange(image, oklab, 0, image.height);
  return oklab;
}

function precomputeOklabRange(image: RgbaImageData, oklab: Float32Array, yStart: number, yEnd: number): void {
  const { data, width, height } = image;
  const startPixel = Math.max(0, Math.min(height, yStart)) * width;
  const endPixel = Math.max(0, Math.min(height, yEnd)) * width;
  for (let pixelIndex = startPixel; pixelIndex < endPixel; pixelIndex += 1) {
    const offset = pixelIndex * 4;
    const [lightness, aAxis, bAxis] = rgbToOklab(data[offset] ?? 0, data[offset + 1] ?? 0, data[offset + 2] ?? 0);
    oklab[pixelIndex * 3] = lightness;
    oklab[pixelIndex * 3 + 1] = aAxis;
    oklab[pixelIndex * 3 + 2] = bAxis;
  }
}

function computeMatteRange(
  image: RgbaImageData,
  recipe: ModularSpriteProcessingRecipe,
  backgroundLab: readonly number[],
  oklab: Float32Array | null,
  matte: Uint8ClampedArray,
  rgba: Uint8ClampedArray,
  yStart: number,
  yEnd: number,
): void {
  const { width, height } = image;
  const background = recipe.background;
  const [backgroundLightness = 0, backgroundA = 0, backgroundB = 0] = backgroundLab;
  const startY = Math.max(0, Math.min(height, yStart));
  const endY = Math.max(startY, Math.min(height, yEnd));
  const startPixel = startY * width;
  const endPixel = endY * width;

  for (let pixelIndex = startPixel; pixelIndex < endPixel; pixelIndex += 1) {
    const offset = pixelIndex * 4;
    const sourceAlpha = (image.data[offset + 3] ?? 0) / 255;
    if (background.mode === 'alpha') {
      matte[pixelIndex] = Math.round(sourceAlpha * 255);
      continue;
    }

    const red = image.data[offset] ?? 0;
    const green = image.data[offset + 1] ?? 0;
    const blue = image.data[offset + 2] ?? 0;
    let labLightness: number;
    let labA: number;
    let labB: number;
    if (oklab) {
      labLightness = oklab[pixelIndex * 3] ?? 0;
      labA = oklab[pixelIndex * 3 + 1] ?? 0;
      labB = oklab[pixelIndex * 3 + 2] ?? 0;
    } else {
      [labLightness, labA, labB] = rgbToOklab(red, green, blue);
    }
    const deltaLightness = (labLightness - backgroundLightness) * 0.5;
    const deltaA = labA - backgroundA;
    const deltaB = labB - backgroundB;
    const distance = Math.sqrt(deltaLightness * deltaLightness + deltaA * deltaA + deltaB * deltaB);
    const keyAlpha = smoothstep(background.tolerance, background.tolerance + background.softness, distance);
    const alpha = sourceAlpha * keyAlpha;
    matte[pixelIndex] = Math.round(alpha * 255);

    if (keyAlpha > 0.02 && keyAlpha < 0.995 && background.despill > 0) {
      const edgeStrength = (1 - keyAlpha) * background.despill;
      const safeAlpha = Math.max(0.08, keyAlpha);
      const correctedRed = clamp((red - (1 - keyAlpha) * background.color.r) / safeAlpha, 0, 255);
      const correctedGreen = clamp((green - (1 - keyAlpha) * background.color.g) / safeAlpha, 0, 255);
      const correctedBlue = clamp((blue - (1 - keyAlpha) * background.color.b) / safeAlpha, 0, 255);
      rgba[offset] = Math.round(red + (correctedRed - red) * edgeStrength);
      rgba[offset + 1] = Math.round(green + (correctedGreen - green) * edgeStrength);
      rgba[offset + 2] = Math.round(blue + (correctedBlue - blue) * edgeStrength);
    }
    rgba[offset + 3] = matte[pixelIndex] ?? 0;
  }
}

function paintCircle(target: Uint8Array | Uint8ClampedArray, width: number, height: number, x: number, y: number, radius: number, value: number): void {
  const radiusSquared = radius * radius;
  const minX = Math.max(0, Math.floor(x - radius));
  const maxX = Math.min(width - 1, Math.ceil(x + radius));
  const minY = Math.max(0, Math.floor(y - radius));
  const maxY = Math.min(height - 1, Math.ceil(y + radius));
  for (let py = minY; py <= maxY; py += 1) {
    for (let px = minX; px <= maxX; px += 1) {
      const deltaX = px - x;
      const deltaY = py - y;
      if (deltaX * deltaX + deltaY * deltaY <= radiusSquared) target[py * width + px] = value;
    }
  }
}

function rasterizeStroke(target: Uint8Array | Uint8ClampedArray, width: number, height: number, stroke: ModularSpriteMaskStroke, value: number): void {
  const radius = Math.max(1, stroke.radius * Math.max(width, height));
  let previous: { x: number; y: number } | null = null;
  for (const point of stroke.points) {
    const current = { x: point.x * (width - 1), y: point.y * (height - 1) };
    if (!previous) {
      paintCircle(target, width, height, current.x, current.y, radius, value);
    } else {
      const distance = Math.hypot(current.x - previous.x, current.y - previous.y);
      const steps = Math.max(1, Math.ceil(distance / Math.max(1, radius * 0.5)));
      for (let step = 0; step <= steps; step += 1) {
        const amount = step / steps;
        paintCircle(
          target,
          width,
          height,
          previous.x + (current.x - previous.x) * amount,
          previous.y + (current.y - previous.y) * amount,
          radius,
          value,
        );
      }
    }
    previous = current;
  }
}

function squareMorphology(mask: Uint8Array, width: number, height: number, radius: number, dilate: boolean): Uint8Array {
  if (radius <= 0) return new Uint8Array(mask);
  const horizontal = new Uint8Array(mask.length);
  const output = new Uint8Array(mask.length);
  const windowSize = radius * 2 + 1;

  for (let y = 0; y < height; y += 1) {
    let count = 0;
    for (let x = -radius; x <= radius; x += 1) {
      if (x >= 0 && x < width) count += mask[y * width + x] ?? 0;
    }
    for (let x = 0; x < width; x += 1) {
      horizontal[y * width + x] = dilate ? Number(count > 0) : Number(count === windowSize);
      const removeX = x - radius;
      const addX = x + radius + 1;
      if (removeX >= 0) count -= mask[y * width + removeX] ?? 0;
      if (addX < width) count += mask[y * width + addX] ?? 0;
    }
  }

  for (let x = 0; x < width; x += 1) {
    let count = 0;
    for (let y = -radius; y <= radius; y += 1) {
      if (y >= 0 && y < height) count += horizontal[y * width + x] ?? 0;
    }
    for (let y = 0; y < height; y += 1) {
      output[y * width + x] = dilate ? Number(count > 0) : Number(count === windowSize);
      const removeY = y - radius;
      const addY = y + radius + 1;
      if (removeY >= 0) count -= horizontal[removeY * width + x] ?? 0;
      if (addY < height) count += horizontal[addY * width + x] ?? 0;
    }
  }
  return output;
}

function applyMorphology(mask: Uint8Array, width: number, height: number, recipe: ModularSpriteProcessingRecipe): Uint8Array {
  let current = mask;
  const { openingRadius, closingRadius } = recipe.detection;
  if (openingRadius > 0) {
    current = squareMorphology(current, width, height, openingRadius, false);
    current = squareMorphology(current, width, height, openingRadius, true);
  }
  if (closingRadius > 0) {
    current = squareMorphology(current, width, height, closingRadius, true);
    current = squareMorphology(current, width, height, closingRadius, false);
  }
  return current;
}

interface ComponentStats {
  id: number;
  area: number;
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  sumX: number;
  sumY: number;
}

function hasLowerRetentionPriority(left: ComponentStats, right: ComponentStats): boolean {
  if (left.area !== right.area) return left.area < right.area;
  if (left.minY !== right.minY) return left.minY > right.minY;
  return left.minX > right.minX;
}

function retainLargestComponent(heap: ComponentStats[], component: ComponentStats): void {
  if (heap.length < MAX_DETECTED_REGIONS) {
    heap.push(component);
    let index = heap.length - 1;
    while (index > 0) {
      const parent = Math.floor((index - 1) / 2);
      if (!hasLowerRetentionPriority(heap[index]!, heap[parent]!)) break;
      [heap[index], heap[parent]] = [heap[parent]!, heap[index]!];
      index = parent;
    }
    return;
  }
  if (!hasLowerRetentionPriority(heap[0]!, component)) return;
  heap[0] = component;
  let index = 0;
  while (true) {
    const left = index * 2 + 1;
    const right = left + 1;
    if (left >= heap.length) break;
    let lowest = left;
    if (right < heap.length && hasLowerRetentionPriority(heap[right]!, heap[left]!)) lowest = right;
    if (!hasLowerRetentionPriority(heap[lowest]!, heap[index]!)) break;
    [heap[index], heap[lowest]] = [heap[lowest]!, heap[index]!];
    index = lowest;
  }
}

function connectedComponents(mask: Uint8Array, width: number, height: number, minimumArea: number): {
  labels: Int32Array;
  stats: ComponentStats[];
  discardedRegionCount: number;
} {
  const temporaryLabels = new Int32Array(mask.length);
  const queue = new Int32Array(mask.length);
  const components: ComponentStats[] = [];
  let validRegionCount = 0;
  let nextLabel = 1;

  for (let start = 0; start < mask.length; start += 1) {
    if (!mask[start] || temporaryLabels[start]) continue;
    let head = 0;
    let tail = 0;
    queue[tail++] = start;
    temporaryLabels[start] = nextLabel;
    const stats: ComponentStats = {
      id: nextLabel, area: 0,
      minX: width, minY: height, maxX: 0, maxY: 0,
      sumX: 0, sumY: 0,
    };
    while (head < tail) {
      const pixelIndex = queue[head++] ?? 0;
      const x = pixelIndex % width;
      const y = Math.floor(pixelIndex / width);
      stats.area += 1;
      stats.minX = Math.min(stats.minX, x);
      stats.minY = Math.min(stats.minY, y);
      stats.maxX = Math.max(stats.maxX, x);
      stats.maxY = Math.max(stats.maxY, y);
      stats.sumX += x;
      stats.sumY += y;
      for (const [deltaX, deltaY] of NEIGHBORS_8) {
        const neighborX = x + deltaX;
        const neighborY = y + deltaY;
        if (neighborX < 0 || neighborX >= width || neighborY < 0 || neighborY >= height) continue;
        const neighborIndex = neighborY * width + neighborX;
        if (!mask[neighborIndex] || temporaryLabels[neighborIndex]) continue;
        temporaryLabels[neighborIndex] = nextLabel;
        queue[tail++] = neighborIndex;
      }
    }
    if (stats.area >= minimumArea) {
      validRegionCount += 1;
      retainLargestComponent(components, stats);
    }
    nextLabel += 1;
  }

  const discardedRegionCount = Math.max(0, validRegionCount - components.length);
  const valid = components.sort((left, right) => left.minY - right.minY || left.minX - right.minX || right.area - left.area);
  const remap = new Int32Array(nextLabel);
  valid.forEach((component, index) => { remap[component.id] = index + 1; });
  const labels = new Int32Array(mask.length);
  for (let index = 0; index < labels.length; index += 1) {
    labels[index] = remap[temporaryLabels[index] ?? 0] ?? 0;
  }
  return {
    labels,
    stats: valid.map((component, index) => ({ ...component, id: index + 1 })),
    discardedRegionCount,
  };
}

function restoreSplitPixels(labels: Int32Array, beforeSplit: Uint8Array, width: number, height: number): void {
  const queue = new Int32Array(labels.length);
  let head = 0;
  let tail = 0;
  for (let index = 0; index < labels.length; index += 1) {
    if (labels[index]) queue[tail++] = index;
  }
  while (head < tail) {
    const pixelIndex = queue[head++] ?? 0;
    const x = pixelIndex % width;
    const y = Math.floor(pixelIndex / width);
    const label = labels[pixelIndex] ?? 0;
    for (const [deltaX, deltaY] of NEIGHBORS_8) {
      const neighborX = x + deltaX;
      const neighborY = y + deltaY;
      if (neighborX < 0 || neighborX >= width || neighborY < 0 || neighborY >= height) continue;
      const neighborIndex = neighborY * width + neighborX;
      if (!beforeSplit[neighborIndex] || labels[neighborIndex]) continue;
      labels[neighborIndex] = label;
      queue[tail++] = neighborIndex;
    }
  }
}

function suggestRole(bounds: { x: number; y: number; width: number; height: number }, areaRatio: number): string {
  const centerX = bounds.x + bounds.width / 2;
  const centerY = bounds.y + bounds.height / 2;
  if (centerY < 0.34 && centerX < 0.7 && areaRatio > 0.025) return 'head';
  if (centerY > 0.72 && bounds.width >= bounds.height * 0.7) return 'foot';
  if (bounds.height > bounds.width * 2.2 && (centerX < 0.2 || centerX > 0.8)) return 'weapon';
  if (centerY > 0.3 && centerY < 0.75 && areaRatio > 0.02) return 'torso';
  if (centerX < 0.28 || centerX > 0.72) return 'upper-arm';
  return 'custom';
}

function componentContour(
  labels: Int32Array,
  id: number,
  width: number,
  height: number,
  centroid: { x: number; y: number },
  bounds: { minX: number; minY: number; maxX: number; maxY: number },
): ReturnType<typeof normalizedPoint>[] {
  const boundary: Array<{ x: number; y: number }> = [];
  let boundaryCount = 0;
  for (let y = bounds.minY; y <= bounds.maxY && y < height; y += 1) {
    for (let x = bounds.minX; x <= bounds.maxX && x < width; x += 1) {
      const pixelIndex = y * width + x;
      if (labels[pixelIndex] !== id) continue;
      const isBoundary = x === 0 || y === 0 || x === width - 1 || y === height - 1
        || labels[y * width + x - 1] !== id
        || labels[y * width + x + 1] !== id
        || labels[(y - 1) * width + x] !== id
        || labels[(y + 1) * width + x] !== id;
      if (!isBoundary) continue;
      boundaryCount += 1;
      if (boundary.length < MAX_CONTOUR_CANDIDATES) {
        boundary.push({ x, y });
        continue;
      }
      // Deterministic reservoir sampling bounds memory for noisy/large outlines.
      const slot = ((Math.imul(pixelIndex, 0x9e3779b1) >>> 0) % boundaryCount);
      if (slot < MAX_CONTOUR_CANDIDATES) boundary[slot] = { x, y };
    }
  }
  boundary.sort((left, right) => {
    const leftAngle = Math.atan2(left.y / height - centroid.y, left.x / width - centroid.x);
    const rightAngle = Math.atan2(right.y / height - centroid.y, right.x / width - centroid.x);
    return leftAngle - rightAngle || left.y - right.y || left.x - right.x;
  });
  const stride = Math.max(1, Math.ceil(boundary.length / MAX_CONTOUR_POINTS));
  return boundary.filter((_, index) => index % stride === 0)
    .map(point => normalizedPoint(point.x, point.y, width, height));
}

function matteStrokesPass(matte: Uint8ClampedArray, rgba: Uint8ClampedArray, recipe: ModularSpriteProcessingRecipe, width: number, height: number): void {
  const alphaStrokes = recipe.strokes.filter(stroke => stroke.kind === 'foreground' || stroke.kind === 'background');
  if (alphaStrokes.length === 0) return;
  for (const stroke of alphaStrokes) {
    if (stroke.kind === 'foreground') rasterizeStroke(matte, width, height, stroke, 255);
    if (stroke.kind === 'background') rasterizeStroke(matte, width, height, stroke, 0);
  }
  for (let index = 0; index < matte.length; index += 1) rgba[index * 4 + 3] = matte[index] ?? 0;
}

function buildDetectionMask(matte: Uint8ClampedArray, recipe: ModularSpriteProcessingRecipe, width: number, height: number): Uint8Array {
  const detection: Uint8Array<ArrayBufferLike> = new Uint8Array(matte.length);
  for (let index = 0; index < matte.length; index += 1) {
    detection[index] = Number((matte[index] ?? 0) >= recipe.detection.alphaThreshold);
  }
  return applyMorphology(detection, width, height, recipe);
}

function detectionStrokesPass(detection: Uint8Array, recipe: ModularSpriteProcessingRecipe, width: number, height: number): Uint8Array | null {
  const hasSplitStroke = recipe.strokes.some(stroke => stroke.kind === 'split');
  const beforeSplit = hasSplitStroke ? new Uint8Array(detection) : null;
  for (const stroke of recipe.strokes) {
    if (stroke.kind === 'split') rasterizeStroke(detection, width, height, stroke, 0);
    if (stroke.kind === 'foreground') rasterizeStroke(detection, width, height, stroke, 1);
    if (stroke.kind === 'background') rasterizeStroke(detection, width, height, stroke, 0);
  }
  return beforeSplit;
}

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
    const normalizedBounds = normalizedRect(bounds, width, height);
    const centroid = normalizedPoint(component.sumX / component.area, component.sumY / component.area, width, height);
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

export function processModularSprite(request: ProcessModularSpriteRequest): ProcessedModularSprite {
  const { image, recipe } = request;
  if (image.width <= 0 || image.height <= 0 || image.data.length !== image.width * image.height * 4) {
    throw new Error('Invalid RGBA image data');
  }
  const background = analyzeModularSpriteBackground(image);
  const { matte, rgba } = createMatte(image, recipe);
  matteStrokesPass(matte, rgba, recipe, image.width, image.height);
  const detection = buildDetectionMask(matte, recipe, image.width, image.height);
  const beforeSplit = detectionStrokesPass(detection, recipe, image.width, image.height);
  const { labels, regions, discardedRegionCount } = buildRegions(detection, beforeSplit, image.width, image.height, recipe);
  const warnings: string[] = [];
  if (recipe.background.mode === 'chroma' && background.confidence < 0.55) warnings.push('Low border-color confidence; pick the background color manually.');
  if (regions.length === 0) warnings.push('No foreground regions were detected.');
  if (discardedRegionCount > 0) warnings.push(`Showing the ${MAX_DETECTED_REGIONS} largest regions; ${discardedRegionCount} smaller regions were ignored. Increase the minimum region area to remove noise.`);
  const observation = createSpriteObservation({ width: image.width, height: image.height, matte, labels, regions });
  return { width: image.width, height: image.height, rgba, matte, labels, regions, background, warnings, observation };
}

export interface ProcessingHooks {
  throwIfAborted(): void;
  checkpoint(): Promise<void>;
  report(progress: number, stage: string): void;
}

export async function precomputeOklabAsync(image: RgbaImageData, hooks: ProcessingHooks): Promise<Float32Array> {
  const oklab = new Float32Array(image.width * image.height * 3);
  for (let y = 0; y < image.height; y += PROCESSING_CHUNK_ROWS) {
    hooks.throwIfAborted();
    precomputeOklabRange(image, oklab, y, y + PROCESSING_CHUNK_ROWS);
    await hooks.checkpoint();
  }
  hooks.throwIfAborted();
  return oklab;
}

export async function processModularSpriteAsync(request: ProcessModularSpriteRequest, hooks: ProcessingHooks, oklab?: Float32Array | null): Promise<ProcessedModularSprite> {
  const { image, recipe } = request;
  if (image.width <= 0 || image.height <= 0 || image.data.length !== image.width * image.height * 4) {
    throw new Error('Invalid RGBA image data');
  }
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
  const warnings: string[] = [];
  if (recipe.background.mode === 'chroma' && background.confidence < 0.55) warnings.push('Low border-color confidence; pick the background color manually.');
  if (regions.length === 0) warnings.push('No foreground regions were detected.');
  if (discardedRegionCount > 0) warnings.push(`Showing the ${MAX_DETECTED_REGIONS} largest regions; ${discardedRegionCount} smaller regions were ignored. Increase the minimum region area to remove noise.`);
  const observation = createSpriteObservation({ width: image.width, height: image.height, matte, labels, regions });
  return { width: image.width, height: image.height, rgba, matte, labels, regions, background, warnings, observation };
}

export function createDefaultExtractionFrame(region: DetectedRegion, sourceWidth: number, sourceHeight: number): ReturnType<typeof normalizedRect> {
  const padding = clamp(Math.round(Math.max(sourceWidth, sourceHeight) * 0.01), 4, 32);
  const x = Math.max(0, region.bounds.x - padding);
  const y = Math.max(0, region.bounds.y - padding);
  const right = Math.min(sourceWidth, region.bounds.x + region.bounds.width + padding);
  const bottom = Math.min(sourceHeight, region.bounds.y + region.bounds.height + padding);
  return normalizedRect({ x, y, width: right - x, height: bottom - y }, sourceWidth, sourceHeight);
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
    const selectedRegions = part.regionIds.map(id => regionMap.get(id)).filter((region): region is DetectedRegion => Boolean(region));
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

function unionNormalizedBounds(rectangles: readonly ReturnType<typeof normalizedRect>[]): ReturnType<typeof normalizedRect> {
  const minX = Math.min(...rectangles.map(rect => rect.x));
  const minY = Math.min(...rectangles.map(rect => rect.y));
  const maxX = Math.max(...rectangles.map(rect => rect.x + rect.width));
  const maxY = Math.max(...rectangles.map(rect => rect.y + rect.height));
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}
