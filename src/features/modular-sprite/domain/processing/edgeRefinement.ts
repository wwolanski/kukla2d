import {
  MODULAR_SPRITE_PROCESSING_CONFIG,
  resolveChromaRefinement,
  type ModularSpriteEnclosedChromaMode,
  type ModularSpriteProcessingRecipe,
} from "@kukla2d/contracts";

import { rgbToOklab } from "../imageMath.js";
import { detectEnclosedChroma } from "./enclosedChroma.js";
import { hasReliableKeyChroma } from "./keyColorProfile.js";
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

interface PreparedInteriorMasks {
  protectedCore: Uint8Array;
  backgroundStrokeMask: Uint8Array;
  enclosedChromaMask: Uint8Array;
  enclosedChromaManualMask: Uint8Array;
  mode: ModularSpriteEnclosedChromaMode;
}

interface ChromaRefinementResult {
  protectedInteriorMask: Uint8Array;
  enclosedChromaMask: Uint8Array;
}

function strokeMask(
  recipe: ModularSpriteProcessingRecipe,
  width: number,
  height: number,
  kind: "background" | "foreground",
): Uint8Array {
  const mask = new Uint8Array(width * height);
  for (const stroke of recipe.strokes)
    if (stroke.kind === kind) rasterizeStroke(mask, width, height, stroke, 1);
  return mask;
}

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

function prepareInteriorMasks(
  image: RgbaImageData,
  recipe: ModularSpriteProcessingRecipe,
  matte: Uint8ClampedArray,
): PreparedInteriorMasks {
  const empty = new Uint8Array(image.width * image.height);
  const refinement = resolveChromaRefinement(recipe.background);
  const lockedBackground = backgroundStrokeMask(
    recipe,
    image.width,
    image.height,
  );
  if (!refinement.protectIslandInteriors)
    return {
      protectedCore: empty,
      backgroundStrokeMask: lockedBackground,
      enclosedChromaMask: empty,
      enclosedChromaManualMask: empty,
      mode: refinement.enclosedChromaMode,
    };

  let detection = thresholdMatte(matte, recipe.detection.alphaThreshold);
  const backgroundLab = rgbToOklab(
    recipe.background.color.r,
    recipe.background.color.g,
    recipe.background.color.b,
  );
  if (!hasReliableKeyChroma(backgroundLab)) {
    // Neutral foreground outlines can share the key luminance and leave narrow
    // leaks into otherwise closed silhouettes. Seal only tiny gaps before the
    // protection fill; the final region mask still uses the user's morphology.
    const closingRadius =
      MODULAR_SPRITE_PROCESSING_CONFIG.algorithm
        .neutralKeyProtectionClosingRadius;
    detection = squareMorphology(
      squareMorphology(
        detection,
        image.width,
        image.height,
        closingRadius,
        true,
      ),
      image.width,
      image.height,
      closingRadius,
      false,
    );
  }
  const filledDetection = fillEnclosedHoles(
    detection,
    image.width,
    image.height,
  );
  const protectedCore = squareMorphology(
    filledDetection,
    image.width,
    image.height,
    refinement.interiorProtectionInset,
    false,
  );
  const detectedEnclosed = detectEnclosedChroma(
    image,
    matte,
    protectedCore,
    recipe.detection.alphaThreshold,
    recipe.background.color,
    refinement.enclosedChromaSeeds,
    lockedBackground,
    strokeMask(recipe, image.width, image.height, "foreground"),
    {
      coreAlphaMax: refinement.enclosedChromaCoreAlphaMax,
      coreColorTolerance: refinement.enclosedChromaCoreColorTolerance,
      growthRadius: refinement.enclosedChromaGrowthRadius,
      growthAlphaMax: refinement.enclosedChromaGrowthAlphaMax,
      growthColorTolerance: refinement.enclosedChromaGrowthColorTolerance,
      growthChromaTolerance: refinement.enclosedChromaGrowthChromaTolerance,
      growthHueTolerance: refinement.enclosedChromaGrowthHueTolerance,
      growthMinChromaRatio: refinement.enclosedChromaGrowthMinChromaRatio,
    },
  );
  return {
    protectedCore,
    backgroundStrokeMask: lockedBackground,
    enclosedChromaMask: detectedEnclosed.mask,
    enclosedChromaManualMask: detectedEnclosed.manualMask,
    mode: refinement.enclosedChromaMode,
  };
}

function restoreProtectedInterior(
  image: RgbaImageData,
  masks: PreparedInteriorMasks,
  matte: Uint8ClampedArray,
  rgba: Uint8ClampedArray,
): Uint8Array {
  const protection = new Uint8Array(image.width * image.height);
  for (let pixelIndex = 0; pixelIndex < protection.length; pixelIndex += 1) {
    if (masks.backgroundStrokeMask[pixelIndex]) continue;
    if (!masks.protectedCore[pixelIndex]) continue;
    if (masks.enclosedChromaMask[pixelIndex]) continue;
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

function applyEnclosedChroma(
  image: RgbaImageData,
  masks: PreparedInteriorMasks,
  matte: Uint8ClampedArray,
  rgba: Uint8ClampedArray,
): void {
  for (
    let pixelIndex = 0;
    pixelIndex < masks.enclosedChromaMask.length;
    pixelIndex += 1
  ) {
    if (!masks.enclosedChromaMask[pixelIndex]) continue;
    const offset = pixelIndex * 4;
    if (
      masks.mode === "transparent" ||
      masks.enclosedChromaManualMask[pixelIndex]
    ) {
      matte[pixelIndex] = 0;
      rgba[offset + 3] = 0;
      continue;
    }
    const sourceAlpha = image.data[offset + 3] ?? 0;
    matte[pixelIndex] = sourceAlpha;
    rgba[offset + 3] = sourceAlpha;
    if (masks.mode === "black") {
      rgba[offset] = 0;
      rgba[offset + 1] = 0;
      rgba[offset + 2] = 0;
      continue;
    }
    if (masks.mode === "desaturate") {
      const gray = Math.round(
        (image.data[offset] ?? 0) * 0.2126 +
          (image.data[offset + 1] ?? 0) * 0.7152 +
          (image.data[offset + 2] ?? 0) * 0.0722,
      );
      rgba[offset] = gray;
      rgba[offset + 1] = gray;
      rgba[offset + 2] = gray;
      continue;
    }
    rgba[offset] = image.data[offset] ?? 0;
    rgba[offset + 1] = image.data[offset + 1] ?? 0;
    rgba[offset + 2] = image.data[offset + 2] ?? 0;
  }
}

export function protectIslandInteriors(
  image: RgbaImageData,
  recipe: ModularSpriteProcessingRecipe,
  matte: Uint8ClampedArray,
  rgba: Uint8ClampedArray,
): Uint8Array {
  const masks = prepareInteriorMasks(image, recipe, matte);
  applyEnclosedChroma(image, masks, matte, rgba);
  return restoreProtectedInterior(image, masks, matte, rgba);
}

function chokeSoftMatte(
  recipe: ModularSpriteProcessingRecipe,
  matte: Uint8ClampedArray,
  rgba: Uint8ClampedArray,
  skipMask?: Uint8Array,
): void {
  const choke = resolveChromaRefinement(recipe.background).matteChoke;
  if (choke <= 0) return;
  const { alphaByteMax } = MODULAR_SPRITE_PROCESSING_CONFIG.algorithm;
  const remaining = 1 - choke;
  for (let pixelIndex = 0; pixelIndex < matte.length; pixelIndex += 1) {
    if (skipMask?.[pixelIndex]) continue;
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
  skipMask?: Uint8Array,
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
    if (skipMask?.[pixelIndex]) continue;
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
  return refineChromaKeyEdgesWithMasks(image, recipe, matte, rgba)
    .protectedInteriorMask;
}

export function refineChromaKeyEdgesWithMasks(
  image: RgbaImageData,
  recipe: ModularSpriteProcessingRecipe,
  matte: Uint8ClampedArray,
  rgba: Uint8ClampedArray,
): ChromaRefinementResult {
  if (recipe.background.mode !== "chroma")
    return {
      protectedInteriorMask: new Uint8Array(image.width * image.height),
      enclosedChromaMask: new Uint8Array(image.width * image.height),
    };
  const masks = prepareInteriorMasks(image, recipe, matte);
  applyEnclosedChroma(image, masks, matte, rgba);
  const protection = restoreProtectedInterior(image, masks, matte, rgba);
  chokeSoftMatte(recipe, matte, rgba, masks.enclosedChromaMask);
  recoverEdgeColors(
    recipe,
    matte,
    rgba,
    image.width,
    image.height,
    masks.enclosedChromaMask,
  );
  return {
    protectedInteriorMask: protection,
    enclosedChromaMask: masks.enclosedChromaMask,
  };
}
