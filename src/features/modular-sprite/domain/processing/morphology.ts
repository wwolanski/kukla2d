import type { ModularSpriteProcessingRecipe } from "@kukla2d/contracts";

const FOUR_CONNECTED_NEIGHBORS = [
  [0, -1],
  [-1, 0],
  [1, 0],
  [0, 1],
] as const;

/**
 * Fills zero-valued regions that are not 4-connected to the image border,
 * complementary to the 8-connected foreground regions.
 */
export function fillEnclosedHoles(
  mask: Uint8Array,
  width: number,
  height: number,
): Uint8Array {
  const filled = new Uint8Array(mask);
  const borderBackground = new Uint8Array(mask.length);
  const queue = new Int32Array(mask.length);
  let head = 0;
  let tail = 0;

  const enqueueBorderBackground = (pixelIndex: number): void => {
    if (
      (mask[pixelIndex] ?? 0) !== 0 ||
      (borderBackground[pixelIndex] ?? 0) !== 0
    )
      return;
    borderBackground[pixelIndex] = 1;
    queue[tail++] = pixelIndex;
  };

  if (height > 0) {
    for (let x = 0; x < width; x += 1) {
      enqueueBorderBackground(x);
      enqueueBorderBackground((height - 1) * width + x);
    }
  }
  if (width > 0) {
    for (let y = 1; y < height - 1; y += 1) {
      enqueueBorderBackground(y * width);
      enqueueBorderBackground(y * width + width - 1);
    }
  }

  while (head < tail) {
    const pixelIndex = queue[head++] ?? 0;
    const x = pixelIndex % width;
    const y = Math.floor(pixelIndex / width);
    for (const [deltaX, deltaY] of FOUR_CONNECTED_NEIGHBORS) {
      const neighborX = x + deltaX;
      const neighborY = y + deltaY;
      if (
        neighborX < 0 ||
        neighborX >= width ||
        neighborY < 0 ||
        neighborY >= height
      )
        continue;
      enqueueBorderBackground(neighborY * width + neighborX);
    }
  }

  for (let pixelIndex = 0; pixelIndex < mask.length; pixelIndex += 1) {
    if (
      (mask[pixelIndex] ?? 0) === 0 &&
      (borderBackground[pixelIndex] ?? 0) === 0
    )
      filled[pixelIndex] = 1;
  }
  return filled;
}

export function squareMorphology(
  mask: Uint8Array,
  width: number,
  height: number,
  radius: number,
  dilate: boolean,
): Uint8Array {
  if (radius <= 0) return new Uint8Array(mask);
  const horizontal = new Uint8Array(mask.length);
  const output = new Uint8Array(mask.length);
  const windowSize = radius * 2 + 1;

  for (let y = 0; y < height; y += 1) {
    let count = 0;
    for (let x = -radius; x <= radius; x += 1)
      if (x >= 0 && x < width) count += mask[y * width + x] ?? 0;
    for (let x = 0; x < width; x += 1) {
      horizontal[y * width + x] = dilate
        ? Number(count > 0)
        : Number(count === windowSize);
      const removeX = x - radius;
      const addX = x + radius + 1;
      if (removeX >= 0) count -= mask[y * width + removeX] ?? 0;
      if (addX < width) count += mask[y * width + addX] ?? 0;
    }
  }

  for (let x = 0; x < width; x += 1) {
    let count = 0;
    for (let y = -radius; y <= radius; y += 1)
      if (y >= 0 && y < height) count += horizontal[y * width + x] ?? 0;
    for (let y = 0; y < height; y += 1) {
      output[y * width + x] = dilate
        ? Number(count > 0)
        : Number(count === windowSize);
      const removeY = y - radius;
      const addY = y + radius + 1;
      if (removeY >= 0) count -= horizontal[removeY * width + x] ?? 0;
      if (addY < height) count += horizontal[addY * width + x] ?? 0;
    }
  }
  return output;
}

export function applyMorphology(
  mask: Uint8Array,
  width: number,
  height: number,
  recipe: ModularSpriteProcessingRecipe,
): Uint8Array {
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

export function thresholdMatte(
  matte: Uint8ClampedArray,
  alphaThreshold: number,
): Uint8Array {
  const detection = new Uint8Array(matte.length);
  for (let index = 0; index < matte.length; index += 1)
    detection[index] = Number((matte[index] ?? 0) >= alphaThreshold);
  return detection;
}

export function buildDetectionMask(
  matte: Uint8ClampedArray,
  recipe: ModularSpriteProcessingRecipe,
  width: number,
  height: number,
): Uint8Array {
  const detection = thresholdMatte(matte, recipe.detection.alphaThreshold);
  return applyMorphology(detection, width, height, recipe);
}
