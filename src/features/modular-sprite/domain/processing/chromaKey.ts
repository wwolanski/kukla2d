import type { ModularSpriteProcessingRecipe } from '@kukla2d/contracts';

import { clamp, rgbToOklab, smoothstep } from '../imageMath.js';

import type { RgbaImageData } from '../contracts.js';
import type { ProcessingHooks } from './types.js';

export const PROCESSING_CHUNK_ROWS = 64;

export function precomputeOklab(image: RgbaImageData): Float32Array {
  const oklab = new Float32Array(image.width * image.height * 3);
  precomputeOklabRange(image, oklab, 0, image.height);
  return oklab;
}

export function precomputeOklabRange(image: RgbaImageData, oklab: Float32Array, yStart: number, yEnd: number): void {
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

export function computeMatteRange(
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
      rgba[offset + 3] = matte[pixelIndex] ?? 0;
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

export function createMatte(image: RgbaImageData, recipe: ModularSpriteProcessingRecipe): { matte: Uint8ClampedArray; rgba: Uint8ClampedArray } {
  const matte = new Uint8ClampedArray(image.width * image.height);
  const rgba = new Uint8ClampedArray(image.data);
  const backgroundLab = rgbToOklab(recipe.background.color.r, recipe.background.color.g, recipe.background.color.b);
  computeMatteRange(image, recipe, backgroundLab, null, matte, rgba, 0, image.height);
  return { matte, rgba };
}

