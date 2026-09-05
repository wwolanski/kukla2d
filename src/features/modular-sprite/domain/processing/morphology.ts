import type { ModularSpriteProcessingRecipe } from '@kukla2d/contracts';

export function squareMorphology(mask: Uint8Array, width: number, height: number, radius: number, dilate: boolean): Uint8Array {
  if (radius <= 0) return new Uint8Array(mask);
  const horizontal = new Uint8Array(mask.length);
  const output = new Uint8Array(mask.length);
  const windowSize = radius * 2 + 1;

  for (let y = 0; y < height; y += 1) {
    let count = 0;
    for (let x = -radius; x <= radius; x += 1) if (x >= 0 && x < width) count += mask[y * width + x] ?? 0;
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
    for (let y = -radius; y <= radius; y += 1) if (y >= 0 && y < height) count += horizontal[y * width + x] ?? 0;
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

export function applyMorphology(mask: Uint8Array, width: number, height: number, recipe: ModularSpriteProcessingRecipe): Uint8Array {
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

export function buildDetectionMask(matte: Uint8ClampedArray, recipe: ModularSpriteProcessingRecipe, width: number, height: number): Uint8Array {
  const detection = new Uint8Array(matte.length);
  for (let index = 0; index < matte.length; index += 1) detection[index] = Number((matte[index] ?? 0) >= recipe.detection.alphaThreshold);
  return applyMorphology(detection, width, height, recipe);
}

