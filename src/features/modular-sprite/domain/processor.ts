import type { ModularSpriteMaskStroke, ModularSpriteProcessingRecipe } from '@kukla2d/contracts';

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
  const background = recipe.background;
  const backgroundLab = rgbToOklab(background.color.r, background.color.g, background.color.b);

  for (let pixelIndex = 0; pixelIndex < matte.length; pixelIndex += 1) {
    const offset = pixelIndex * 4;
    const sourceAlpha = (image.data[offset + 3] ?? 0) / 255;
    if (background.mode === 'alpha') {
      matte[pixelIndex] = Math.round(sourceAlpha * 255);
      continue;
    }

    const red = image.data[offset] ?? 0;
    const green = image.data[offset + 1] ?? 0;
    const blue = image.data[offset + 2] ?? 0;
    const lab = rgbToOklab(red, green, blue);
    const deltaLightness = (lab[0] - backgroundLab[0]) * 0.5;
    const deltaA = lab[1] - backgroundLab[1];
    const deltaB = lab[2] - backgroundLab[2];
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
  return { matte, rgba };
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

function connectedComponents(mask: Uint8Array, width: number, height: number, minimumArea: number): { labels: Int32Array; stats: ComponentStats[] } {
  const temporaryLabels = new Int32Array(mask.length);
  const queue = new Int32Array(mask.length);
  const components: ComponentStats[] = [];
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
    components.push(stats);
    nextLabel += 1;
  }

  const valid = components
    .filter(component => component.area >= minimumArea)
    .sort((left, right) => left.minY - right.minY || left.minX - right.minX || right.area - left.area);
  const remap = new Map<number, number>();
  valid.forEach((component, index) => remap.set(component.id, index + 1));
  const labels = new Int32Array(mask.length);
  for (let index = 0; index < labels.length; index += 1) {
    labels[index] = remap.get(temporaryLabels[index] ?? 0) ?? 0;
  }
  return {
    labels,
    stats: valid.map((component, index) => ({ ...component, id: index + 1 })),
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

function componentContour(labels: Int32Array, id: number, width: number, height: number, centroid: { x: number; y: number }): ReturnType<typeof normalizedPoint>[] {
  const boundary: Array<{ x: number; y: number }> = [];
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (labels[y * width + x] !== id) continue;
      const isBoundary = x === 0 || y === 0 || x === width - 1 || y === height - 1
        || labels[y * width + x - 1] !== id
        || labels[y * width + x + 1] !== id
        || labels[(y - 1) * width + x] !== id
        || labels[(y + 1) * width + x] !== id;
      if (isBoundary) boundary.push({ x, y });
    }
  }
  boundary.sort((left, right) => {
    const leftAngle = Math.atan2(left.y / height - centroid.y, left.x / width - centroid.x);
    const rightAngle = Math.atan2(right.y / height - centroid.y, right.x / width - centroid.x);
    return leftAngle - rightAngle || left.y - right.y || left.x - right.x;
  });
  const stride = Math.max(1, Math.ceil(boundary.length / 512));
  return boundary.filter((_, index) => index % stride === 0)
    .map(point => normalizedPoint(point.x, point.y, width, height));
}

export function processModularSprite(request: ProcessModularSpriteRequest): ProcessedModularSprite {
  const { image, recipe } = request;
  if (image.width <= 0 || image.height <= 0 || image.data.length !== image.width * image.height * 4) {
    throw new Error('Invalid RGBA image data');
  }
  const background = analyzeModularSpriteBackground(image);
  const { matte, rgba } = createMatte(image, recipe);

  for (const stroke of recipe.strokes) {
    if (stroke.kind === 'foreground') rasterizeStroke(matte, image.width, image.height, stroke, 255);
    if (stroke.kind === 'background') rasterizeStroke(matte, image.width, image.height, stroke, 0);
  }
  for (let index = 0; index < matte.length; index += 1) rgba[index * 4 + 3] = matte[index] ?? 0;

  let detection: Uint8Array<ArrayBufferLike> = new Uint8Array(matte.length);
  for (let index = 0; index < matte.length; index += 1) {
    detection[index] = Number((matte[index] ?? 0) >= recipe.detection.alphaThreshold);
  }
  detection = applyMorphology(detection, image.width, image.height, recipe);
  const beforeSplit = new Uint8Array(detection);
  for (const stroke of recipe.strokes) {
    if (stroke.kind === 'split') rasterizeStroke(detection, image.width, image.height, stroke, 0);
    if (stroke.kind === 'foreground') rasterizeStroke(detection, image.width, image.height, stroke, 1);
    if (stroke.kind === 'background') rasterizeStroke(detection, image.width, image.height, stroke, 0);
  }

  const minimumArea = Math.max(1, Math.round(image.width * image.height * recipe.detection.minimumRegionAreaRatio));
  const { labels, stats } = connectedComponents(detection, image.width, image.height, minimumArea);
  restoreSplitPixels(labels, beforeSplit, image.width, image.height);
  const regions: DetectedRegion[] = stats.map(component => {
    const bounds = {
      x: component.minX,
      y: component.minY,
      width: component.maxX - component.minX + 1,
      height: component.maxY - component.minY + 1,
    };
    const normalizedBounds = normalizedRect(bounds, image.width, image.height);
    const centroid = normalizedPoint(component.sumX / component.area, component.sumY / component.area, image.width, image.height);
    return {
      id: component.id,
      area: component.area,
      bounds,
      normalizedBounds,
      centroid,
      suggestedRole: suggestRole(normalizedBounds, component.area / (image.width * image.height)),
      contour: componentContour(labels, component.id, image.width, image.height, centroid),
    };
  });
  const warnings: string[] = [];
  if (recipe.background.mode === 'chroma' && background.confidence < 0.55) warnings.push('Low border-color confidence; pick the background color manually.');
  if (regions.length === 0) warnings.push('No foreground regions were detected.');
  return { width: image.width, height: image.height, rgba, matte, labels, regions, background, warnings };
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
