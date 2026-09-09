import {
  MODULAR_SPRITE_PROCESSING_CONFIG,
  type NormalizedPoint,
} from "@kukla2d/contracts";

import { clamp, rgbToOklab } from "../imageMath.js";

import type { RgbaImageData } from "../contracts.types.js";

const FOUR_CONNECTED_NEIGHBORS = [
  [0, -1],
  [-1, 0],
  [1, 0],
  [0, 1],
] as const;

const DEFAULT_THRESHOLDS = {
  strongDistance: 0.05,
  meanDistance: 0.08,
  strongRatio: 0.7,
  colorSpread: 0.06,
  smallArea: 64,
  smallMeanDistance: 0.13,
  smallStrongRatio: 0.1,
  smallColorSpread: 0.09,
} as const;

type EnclosedChromaThresholds = typeof DEFAULT_THRESHOLDS;

type AlgorithmWithEnclosedThresholds =
  typeof MODULAR_SPRITE_PROCESSING_CONFIG.algorithm &
    Partial<{
      enclosedChromaStrongDistance: number;
      enclosedChromaMeanDistance: number;
      enclosedChromaStrongRatio: number;
      enclosedChromaColorSpread: number;
      enclosedChromaSmallArea: number;
      enclosedChromaSmallMeanDistance: number;
      enclosedChromaSmallStrongRatio: number;
      enclosedChromaSmallColorSpread: number;
    }>;

interface EnclosedChromaDetection {
  mask: Uint8Array;
  manualMask: Uint8Array;
}

function thresholds(): EnclosedChromaThresholds {
  const algorithm = MODULAR_SPRITE_PROCESSING_CONFIG.algorithm as
    AlgorithmWithEnclosedThresholds | undefined;
  return {
    strongDistance:
      algorithm?.enclosedChromaStrongDistance ??
      DEFAULT_THRESHOLDS.strongDistance,
    meanDistance:
      algorithm?.enclosedChromaMeanDistance ?? DEFAULT_THRESHOLDS.meanDistance,
    strongRatio:
      algorithm?.enclosedChromaStrongRatio ?? DEFAULT_THRESHOLDS.strongRatio,
    colorSpread:
      algorithm?.enclosedChromaColorSpread ?? DEFAULT_THRESHOLDS.colorSpread,
    smallArea:
      algorithm?.enclosedChromaSmallArea ?? DEFAULT_THRESHOLDS.smallArea,
    smallMeanDistance:
      algorithm?.enclosedChromaSmallMeanDistance ??
      DEFAULT_THRESHOLDS.smallMeanDistance,
    smallStrongRatio:
      algorithm?.enclosedChromaSmallStrongRatio ??
      DEFAULT_THRESHOLDS.smallStrongRatio,
    smallColorSpread:
      algorithm?.enclosedChromaSmallColorSpread ??
      DEFAULT_THRESHOLDS.smallColorSpread,
  };
}

function componentTouchesBorder(
  pixelIndex: number,
  width: number,
  height: number,
): boolean {
  const x = pixelIndex % width;
  const y = Math.floor(pixelIndex / width);
  return x === 0 || y === 0 || x === width - 1 || y === height - 1;
}

function componentIsEnclosed(
  component: readonly number[],
  protectedCore: Uint8Array,
  width: number,
  height: number,
): boolean {
  return component.every(
    (pixelIndex) =>
      !componentTouchesBorder(pixelIndex, width, height) &&
      (protectedCore[pixelIndex] ?? 0) !== 0,
  );
}

function componentQualifies(
  component: readonly number[],
  values: {
    meanDistance: number;
    strongRatio: number;
    colorSpread: number;
  },
  limits: EnclosedChromaThresholds,
): boolean {
  const area = component.length;
  const isSmall = area <= limits.smallArea;
  const maxMeanDistance = isSmall
    ? limits.smallMeanDistance
    : limits.meanDistance;
  const minStrongRatio = isSmall ? limits.smallStrongRatio : limits.strongRatio;
  const maxColorSpread = isSmall ? limits.smallColorSpread : limits.colorSpread;
  return (
    values.meanDistance <= maxMeanDistance &&
    values.strongRatio >= minStrongRatio &&
    values.colorSpread <= maxColorSpread
  );
}

function componentMetrics(
  image: RgbaImageData,
  component: readonly number[],
  backgroundLab: readonly [number, number, number],
  strongDistance: number,
): {
  meanDistance: number;
  strongRatio: number;
  colorSpread: number;
} {
  const labs = component.map((pixelIndex) => {
    const offset = pixelIndex * 4;
    return rgbToOklab(
      image.data[offset] ?? 0,
      image.data[offset + 1] ?? 0,
      image.data[offset + 2] ?? 0,
    );
  });
  let distanceSum = 0;
  let strongCount = 0;
  let meanLightness = 0;
  let meanA = 0;
  let meanB = 0;
  const lightnessWeight =
    MODULAR_SPRITE_PROCESSING_CONFIG.algorithm.oklabLightnessWeight;
  for (const [lightness, aAxis, bAxis] of labs) {
    const deltaLightness = (lightness - backgroundLab[0]) * lightnessWeight;
    const deltaA = aAxis - backgroundLab[1];
    const deltaB = bAxis - backgroundLab[2];
    const distance = Math.hypot(deltaLightness, deltaA, deltaB);
    distanceSum += distance;
    if (distance <= strongDistance) strongCount += 1;
    meanLightness += lightness;
    meanA += aAxis;
    meanB += bAxis;
  }
  const count = Math.max(1, labs.length);
  meanLightness /= count;
  meanA /= count;
  meanB /= count;
  let spreadSum = 0;
  for (const [lightness, aAxis, bAxis] of labs) {
    const deltaLightness = (lightness - meanLightness) * lightnessWeight;
    const deltaA = aAxis - meanA;
    const deltaB = bAxis - meanB;
    spreadSum += Math.hypot(deltaLightness, deltaA, deltaB);
  }
  return {
    meanDistance: distanceSum / count,
    strongRatio: strongCount / count,
    colorSpread: spreadSum / count,
  };
}

function createKeyedSoftMask(
  matte: Uint8ClampedArray,
  backgroundStrokeMask: Uint8Array,
  foregroundStrokeMask: Uint8Array,
  alphaByteMax: number,
): Uint8Array {
  const keyedSoft = new Uint8Array(matte.length);
  for (let pixelIndex = 0; pixelIndex < matte.length; pixelIndex += 1) {
    keyedSoft[pixelIndex] = Number(
      (matte[pixelIndex] ?? 0) < alphaByteMax &&
        (backgroundStrokeMask[pixelIndex] ?? 0) === 0 &&
        (foregroundStrokeMask[pixelIndex] ?? 0) === 0,
    );
  }
  return keyedSoft;
}

function createCandidateCoreMask(
  matte: Uint8ClampedArray,
  protectedCore: Uint8Array,
  backgroundStrokeMask: Uint8Array,
  foregroundStrokeMask: Uint8Array,
  alphaThreshold: number,
): Uint8Array {
  const candidateCore = new Uint8Array(matte.length);
  for (let pixelIndex = 0; pixelIndex < matte.length; pixelIndex += 1) {
    candidateCore[pixelIndex] = Number(
      (matte[pixelIndex] ?? 0) < alphaThreshold &&
        (protectedCore[pixelIndex] ?? 0) !== 0 &&
        (backgroundStrokeMask[pixelIndex] ?? 0) === 0 &&
        (foregroundStrokeMask[pixelIndex] ?? 0) === 0,
    );
  }
  return candidateCore;
}

function findComponents(
  mask: Uint8Array,
  width: number,
  height: number,
): number[][] {
  const visited = new Uint8Array(mask.length);
  const components: number[][] = [];
  const queue = new Int32Array(mask.length);
  for (let start = 0; start < mask.length; start += 1) {
    if ((mask[start] ?? 0) === 0 || visited[start]) continue;
    const component: number[] = [];
    let head = 0;
    let tail = 0;
    visited[start] = 1;
    queue[tail++] = start;
    while (head < tail) {
      const pixelIndex = queue[head++] ?? 0;
      component.push(pixelIndex);
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
        const neighborIndex = neighborY * width + neighborX;
        if ((mask[neighborIndex] ?? 0) === 0 || visited[neighborIndex] !== 0)
          continue;
        visited[neighborIndex] = 1;
        queue[tail++] = neighborIndex;
      }
    }
    components.push(component);
  }
  return components;
}

function seedPixelIndex(
  seed: NormalizedPoint,
  width: number,
  height: number,
): number {
  const x = Math.round(clamp(seed.x, 0, 1) * Math.max(0, width - 1));
  const y = Math.round(clamp(seed.y, 0, 1) * Math.max(0, height - 1));
  return y * width + x;
}

export function detectEnclosedChroma(
  image: RgbaImageData,
  matte: Uint8ClampedArray,
  protectedCore: Uint8Array,
  alphaThreshold: number,
  backgroundColor: { r: number; g: number; b: number },
  enclosedChromaSeeds: readonly NormalizedPoint[],
  backgroundStrokeMask: Uint8Array,
  foregroundStrokeMask: Uint8Array,
): EnclosedChromaDetection {
  const mask = new Uint8Array(matte.length);
  const manualMask = new Uint8Array(matte.length);
  const candidateCore = createCandidateCoreMask(
    matte,
    protectedCore,
    backgroundStrokeMask,
    foregroundStrokeMask,
    alphaThreshold,
  );
  const coreComponents = findComponents(
    candidateCore,
    image.width,
    image.height,
  );
  const coreComponentIds = new Int32Array(matte.length);
  coreComponentIds.fill(-1);
  const keyedSoft = createKeyedSoftMask(
    matte,
    backgroundStrokeMask,
    foregroundStrokeMask,
    MODULAR_SPRITE_PROCESSING_CONFIG.algorithm.alphaByteMax,
  );
  const expansionMask = new Uint8Array(matte.length);
  for (let pixelIndex = 0; pixelIndex < matte.length; pixelIndex += 1)
    expansionMask[pixelIndex] = Number(
      keyedSoft[pixelIndex] !== 0 && (protectedCore[pixelIndex] ?? 0) !== 0,
    );
  const expandedComponents = findComponents(
    expansionMask,
    image.width,
    image.height,
  );
  const expansionComponentIds = new Int32Array(matte.length);
  expansionComponentIds.fill(-1);
  const limits = thresholds();
  const backgroundLab = rgbToOklab(
    backgroundColor.r,
    backgroundColor.g,
    backgroundColor.b,
  );
  const selectedCores = new Set<number>();
  const manuallySelectedCores = new Set<number>();

  for (const [componentId, component] of coreComponents.entries()) {
    for (const pixelIndex of component)
      coreComponentIds[pixelIndex] = componentId;
    if (
      !componentIsEnclosed(component, protectedCore, image.width, image.height)
    )
      continue;
    const values = componentMetrics(
      image,
      component,
      backgroundLab,
      limits.strongDistance,
    );
    if (componentQualifies(component, values, limits))
      selectedCores.add(componentId);
  }

  for (const [componentId, component] of expandedComponents.entries()) {
    for (const pixelIndex of component)
      expansionComponentIds[pixelIndex] = componentId;
  }

  const coreExpansionIds: Array<Set<number>> = coreComponents.map(
    () => new Set<number>(),
  );
  const expansionCoreIds: Array<Set<number>> = expandedComponents.map(
    () => new Set<number>(),
  );
  for (const [coreId, component] of coreComponents.entries()) {
    const expansionIds = coreExpansionIds[coreId];
    if (!expansionIds) continue;
    for (const pixelIndex of component) {
      const expansionId = expansionComponentIds[pixelIndex] ?? -1;
      if (expansionId < 0) continue;
      expansionIds.add(expansionId);
      expansionCoreIds[expansionId]?.add(coreId);
    }
  }

  for (const seed of enclosedChromaSeeds) {
    if (
      !Number.isFinite(seed.x) ||
      !Number.isFinite(seed.y) ||
      seed.x < 0 ||
      seed.x > 1 ||
      seed.y < 0 ||
      seed.y > 1
    )
      continue;
    const pixelIndex = seedPixelIndex(seed, image.width, image.height);
    const coreId = coreComponentIds[pixelIndex] ?? -1;
    if (coreId >= 0) {
      selectedCores.add(coreId);
      manuallySelectedCores.add(coreId);
      continue;
    }
    const expansionId = expansionComponentIds[pixelIndex] ?? -1;
    if (expansionId < 0 || !expandedComponents[expansionId]) continue;
    for (const candidateCoreId of expansionCoreIds[expansionId] ?? []) {
      selectedCores.add(candidateCoreId);
      manuallySelectedCores.add(candidateCoreId);
    }
  }

  const selectedExpansions = new Set<number>();
  const manuallySelectedExpansions = new Set<number>();
  for (const coreId of selectedCores) {
    const expansionIds = coreExpansionIds[coreId];
    if (!expansionIds) continue;
    for (const expansionId of expansionIds) {
      selectedExpansions.add(expansionId);
      if (manuallySelectedCores.has(coreId))
        manuallySelectedExpansions.add(expansionId);
    }
  }

  for (const expansionId of selectedExpansions) {
    const component = expandedComponents[expansionId];
    if (!component) continue;
    for (const pixelIndex of component) {
      mask[pixelIndex] = 1;
      if (manuallySelectedExpansions.has(expansionId))
        manualMask[pixelIndex] = 1;
    }
  }
  return { mask, manualMask };
}
