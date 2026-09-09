import {
  MODULAR_SPRITE_PROCESSING_CONFIG,
  resolveChromaRefinement,
  type ModularSpriteProcessingRecipe,
} from "@kukla2d/contracts";

import { rasterizeStroke } from "./maskStrokes.js";
import {
  fillEnclosedHoles,
  squareMorphology,
  thresholdMatte,
} from "./morphology.js";

import type { RgbaImageData } from "../contracts.types.js";

const PROPAGATION_NEIGHBORS = [
  [-1, -1],
  [0, -1],
  [1, -1],
  [-1, 0],
  [1, 0],
  [-1, 1],
  [0, 1],
  [1, 1],
] as const;

function backgroundStrokeMask(
  recipe: ModularSpriteProcessingRecipe,
  width: number,
  height: number,
): Uint8Array {
  const locked = new Uint8Array(width * height);
  for (const stroke of recipe.strokes)
    if (stroke.kind === "background")
      rasterizeStroke(locked, width, height, stroke, 1);
  return locked;
}

export function protectIslandInteriors(
  image: RgbaImageData,
  recipe: ModularSpriteProcessingRecipe,
  matte: Uint8ClampedArray,
  rgba: Uint8ClampedArray,
): Uint8Array {
  const protection = new Uint8Array(image.width * image.height);
  const refinement = resolveChromaRefinement(recipe.background);
  if (!refinement.protectIslandInteriors) return protection;
  const { width, height } = image;
  const detection = thresholdMatte(matte, recipe.detection.alphaThreshold);
  const filledDetection = fillEnclosedHoles(detection, width, height);
  const inset = refinement.interiorProtectionInset;
  const protectedCore = squareMorphology(
    filledDetection,
    width,
    height,
    inset,
    false,
  );
  const lockedBackground = backgroundStrokeMask(recipe, width, height);

  for (let pixelIndex = 0; pixelIndex < protection.length; pixelIndex += 1) {
    if (lockedBackground[pixelIndex]) continue;
    if (!protectedCore[pixelIndex]) continue;
    const offset = pixelIndex * 4;
    const sourceAlpha = image.data[offset + 3] ?? 0;
    if (sourceAlpha === 0) continue;
    protection[pixelIndex] = 1;
    matte[pixelIndex] = sourceAlpha;
    rgba[offset] = image.data[offset] ?? 0;
    rgba[offset + 1] = image.data[offset + 1] ?? 0;
    rgba[offset + 2] = image.data[offset + 2] ?? 0;
    rgba[offset + 3] = sourceAlpha;
  }
  return protection;
}

function chokeSoftMatte(
  recipe: ModularSpriteProcessingRecipe,
  matte: Uint8ClampedArray,
  rgba: Uint8ClampedArray,
): void {
  const choke = resolveChromaRefinement(recipe.background).matteChoke;
  if (choke <= 0) return;
  const { alphaByteMax } = MODULAR_SPRITE_PROCESSING_CONFIG.algorithm;
  const remaining = 1 - choke;
  for (let pixelIndex = 0; pixelIndex < matte.length; pixelIndex += 1) {
    const current = matte[pixelIndex] ?? 0;
    if (current === 0 || current === alphaByteMax) continue;
    const alpha = current / alphaByteMax;
    const adjusted = Math.max(0, (alpha - choke) / remaining);
    const value = Math.round(adjusted * alphaByteMax);
    matte[pixelIndex] = value;
    rgba[pixelIndex * 4 + 3] = value;
  }
}

function recoverEdgeColors(
  recipe: ModularSpriteProcessingRecipe,
  matte: Uint8ClampedArray,
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
): void {
  const refinement = resolveChromaRefinement(recipe.background);
  const recovery = refinement.edgeColorRecovery;
  const radius = refinement.edgeSearchRadius;
  if (recovery <= 0 || radius <= 0) return;

  const { alphaByteMax, confidentForegroundAlpha } =
    MODULAR_SPRITE_PROCESSING_CONFIG.algorithm;

  const distance = new Uint8Array(matte.length);
  distance.fill(alphaByteMax);
  const sourcePixel = new Int32Array(matte.length);
  sourcePixel.fill(-1);
  const queue = new Int32Array(matte.length);
  let head = 0;
  let tail = 0;

  for (let pixelIndex = 0; pixelIndex < matte.length; pixelIndex += 1) {
    if ((matte[pixelIndex] ?? 0) < confidentForegroundAlpha) continue;
    distance[pixelIndex] = 0;
    sourcePixel[pixelIndex] = pixelIndex;
    queue[tail++] = pixelIndex;
  }

  while (head < tail) {
    const pixelIndex = queue[head++] ?? 0;
    const currentDistance = distance[pixelIndex] ?? alphaByteMax;
    if (currentDistance >= radius) continue;
    const x = pixelIndex % width;
    const y = Math.floor(pixelIndex / width);
    for (const [deltaX, deltaY] of PROPAGATION_NEIGHBORS) {
      const neighborX = x + deltaX;
      const neighborY = y + deltaY;
      if (
        neighborX < 0 ||
        neighborX >= width ||
        neighborY < 0 ||
        neighborY >= height
      )
        continue;
      const neighborIndex = neighborY * width + neighborX;
      if ((distance[neighborIndex] ?? alphaByteMax) !== alphaByteMax) continue;
      distance[neighborIndex] = currentDistance + 1;
      sourcePixel[neighborIndex] = sourcePixel[pixelIndex] ?? -1;
      queue[tail++] = neighborIndex;
    }
  }

  for (let pixelIndex = 0; pixelIndex < matte.length; pixelIndex += 1) {
    const foregroundPixel = sourcePixel[pixelIndex] ?? -1;
    const alphaByte = matte[pixelIndex] ?? 0;
    if (foregroundPixel < 0 || alphaByte >= confidentForegroundAlpha) continue;
    const offset = pixelIndex * 4;
    const foregroundOffset = foregroundPixel * 4;
    const amount = alphaByte === 0 ? 1 : recovery;
    for (let channel = 0; channel < 3; channel += 1) {
      const current = rgba[offset + channel] ?? 0;
      const foreground = rgba[foregroundOffset + channel] ?? 0;
      rgba[offset + channel] = Math.round(
        current + (foreground - current) * amount,
      );
    }
  }
}

/**
 * Refines the straight-alpha matte and RGB produced by the chroma keyer.
 * It is shared by the synchronous CLI path and the cooperative browser worker.
 */
export function refineChromaKeyEdges(
  image: RgbaImageData,
  recipe: ModularSpriteProcessingRecipe,
  matte: Uint8ClampedArray,
  rgba: Uint8ClampedArray,
): Uint8Array {
  if (recipe.background.mode !== "chroma")
    return new Uint8Array(image.width * image.height);
  const protection = protectIslandInteriors(image, recipe, matte, rgba);
  chokeSoftMatte(recipe, matte, rgba);
  recoverEdgeColors(recipe, matte, rgba, image.width, image.height);
  return protection;
}
