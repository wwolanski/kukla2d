import {
  MODULAR_SPRITE_PROCESSING_CONFIG,
  type NormalizedPoint,
} from "@kukla2d/contracts";

import { clamp, rgbToOklab } from "../imageMath.js";
import { hasReliableKeyChroma, keyLightnessWeight } from "./keyColorProfile.js";

import type { RgbaImageData } from "../contracts.types.js";

const FOUR_CONNECTED_NEIGHBORS = [
  [0, -1],
  [-1, 0],
  [1, 0],
  [0, 1],
] as const;

const EIGHT_CONNECTED_NEIGHBORS = [
  [-1, -1],
  [0, -1],
  [1, -1],
  [-1, 0],
  [1, 0],
  [-1, 1],
  [0, 1],
  [1, 1],
] as const;

interface EnclosedChromaThresholds {
  strongDistance: number;
  meanDistance: number;
  strongRatio: number;
  colorSpread: number;
  smallArea: number;
  smallMeanDistance: number;
  smallStrongRatio: number;
  smallColorSpread: number;
  coreAlphaMax: number;
  coreColorTolerance: number;
  growthRadius: number;
  growthAlphaMax: number;
  growthColorTolerance: number;
  growthChromaTolerance: number;
  growthHueTolerance: number;
  growthMinChromaRatio: number;
}

const DEFAULT_THRESHOLDS: EnclosedChromaThresholds = {
  strongDistance: 0.05,
  meanDistance: 0.08,
  strongRatio: 0.7,
  colorSpread: 0.06,
  smallArea: 64,
  smallMeanDistance: 0.13,
  smallStrongRatio: 0.1,
  smallColorSpread: 0.09,
  coreAlphaMax: 32,
  coreColorTolerance: 0.13,
  growthRadius: 2,
  growthAlphaMax: 254,
  growthColorTolerance: 0.24,
  growthChromaTolerance: 0.16,
  growthHueTolerance: 12,
  growthMinChromaRatio: 0.2,
};

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

interface EnclosedChromaTuning {
  coreAlphaMax: number;
  coreColorTolerance: number;
  growthRadius: number;
  growthAlphaMax: number;
  growthColorTolerance: number;
  growthChromaTolerance: number;
  growthHueTolerance: number;
  growthMinChromaRatio: number;
}

interface EnclosedChromaDetection {
  mask: Uint8Array;
  manualMask: Uint8Array;
}

function thresholds(
  tuning: Partial<EnclosedChromaTuning>,
): EnclosedChromaThresholds {
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
    coreAlphaMax: tuning.coreAlphaMax ?? DEFAULT_THRESHOLDS.coreAlphaMax,
    coreColorTolerance:
      tuning.coreColorTolerance ?? DEFAULT_THRESHOLDS.coreColorTolerance,
    growthRadius: tuning.growthRadius ?? DEFAULT_THRESHOLDS.growthRadius,
    growthAlphaMax: tuning.growthAlphaMax ?? DEFAULT_THRESHOLDS.growthAlphaMax,
    growthColorTolerance:
      tuning.growthColorTolerance ?? DEFAULT_THRESHOLDS.growthColorTolerance,
    growthChromaTolerance:
      tuning.growthChromaTolerance ?? DEFAULT_THRESHOLDS.growthChromaTolerance,
    growthHueTolerance:
      tuning.growthHueTolerance ?? DEFAULT_THRESHOLDS.growthHueTolerance,
    growthMinChromaRatio:
      tuning.growthMinChromaRatio ?? DEFAULT_THRESHOLDS.growthMinChromaRatio,
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
  const lightnessWeight = keyLightnessWeight(backgroundLab);
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

function pixelColorDistances(
  image: RgbaImageData,
  pixelIndex: number,
  backgroundLab: readonly [number, number, number],
): {
  weighted: number;
  chroma: number;
  pixelChroma: number;
  hueCosine: number;
} {
  const offset = pixelIndex * 4;
  const [lightness, aAxis, bAxis] = rgbToOklab(
    image.data[offset] ?? 0,
    image.data[offset + 1] ?? 0,
    image.data[offset + 2] ?? 0,
  );
  const lightnessWeight = keyLightnessWeight(backgroundLab);
  const deltaA = aAxis - backgroundLab[1];
  const deltaB = bAxis - backgroundLab[2];
  const pixelChroma = Math.hypot(aAxis, bAxis);
  const backgroundChroma = Math.hypot(backgroundLab[1], backgroundLab[2]);
  return {
    weighted: Math.hypot(
      (lightness - backgroundLab[0]) * lightnessWeight,
      deltaA,
      deltaB,
    ),
    chroma: Math.hypot(deltaA, deltaB),
    pixelChroma,
    hueCosine:
      pixelChroma > Number.EPSILON && backgroundChroma > Number.EPSILON
        ? (aAxis * backgroundLab[1] + bAxis * backgroundLab[2]) /
          (pixelChroma * backgroundChroma)
        : -1,
  };
}

function growChromaCore(
  coreMask: Uint8Array,
  image: RgbaImageData,
  matte: Uint8ClampedArray,
  protectedCore: Uint8Array,
  backgroundStrokeMask: Uint8Array,
  foregroundStrokeMask: Uint8Array,
  backgroundLab: readonly [number, number, number],
  limits: EnclosedChromaThresholds,
): Uint8Array {
  const grown = new Uint8Array(coreMask);
  if (limits.growthRadius <= 0) return grown;

  const depth = new Int16Array(coreMask.length);
  depth.fill(-1);
  const rejected = new Uint8Array(coreMask.length);
  const queue = new Int32Array(coreMask.length);
  let head = 0;
  let tail = 0;
  const backgroundChroma = Math.hypot(backgroundLab[1], backgroundLab[2]);
  const minimumPixelChroma = backgroundChroma * limits.growthMinChromaRatio;
  const minimumHueCosine = Math.cos(
    (limits.growthHueTolerance * Math.PI) / 180,
  );
  for (let pixelIndex = 0; pixelIndex < coreMask.length; pixelIndex += 1) {
    if (!coreMask[pixelIndex]) continue;
    depth[pixelIndex] = 0;
    queue[tail++] = pixelIndex;
  }

  while (head < tail) {
    const pixelIndex = queue[head++] ?? 0;
    const currentDepth = depth[pixelIndex] ?? 0;
    if (currentDepth >= limits.growthRadius) continue;
    const x = pixelIndex % image.width;
    const y = Math.floor(pixelIndex / image.width);
    for (const [deltaX, deltaY] of EIGHT_CONNECTED_NEIGHBORS) {
      const neighborX = x + deltaX;
      const neighborY = y + deltaY;
      if (
        neighborX < 0 ||
        neighborX >= image.width ||
        neighborY < 0 ||
        neighborY >= image.height
      )
        continue;
      const neighborIndex = neighborY * image.width + neighborX;
      if ((depth[neighborIndex] ?? -1) >= 0 || rejected[neighborIndex])
        continue;
      if (
        !protectedCore[neighborIndex] ||
        backgroundStrokeMask[neighborIndex] ||
        foregroundStrokeMask[neighborIndex] ||
        (matte[neighborIndex] ?? 0) > limits.growthAlphaMax
      ) {
        rejected[neighborIndex] = 1;
        continue;
      }
      const distances = pixelColorDistances(
        image,
        neighborIndex,
        backgroundLab,
      );
      const closeToKey =
        distances.weighted <= limits.growthColorTolerance &&
        distances.chroma <= limits.growthChromaTolerance;
      const sameKeyHue =
        distances.pixelChroma >= minimumPixelChroma &&
        distances.hueCosine >= minimumHueCosine;
      if (!closeToKey && !sameKeyHue) {
        rejected[neighborIndex] = 1;
        continue;
      }
      grown[neighborIndex] = 1;
      depth[neighborIndex] = currentDepth + 1;
      queue[tail++] = neighborIndex;
    }
  }
  return grown;
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
  tuning: Partial<EnclosedChromaTuning> = {},
): EnclosedChromaDetection {
  const mask = new Uint8Array(matte.length);
  const manualMask = new Uint8Array(matte.length);
  const limits = thresholds(tuning);
  const candidateCore = createCandidateCoreMask(
    matte,
    protectedCore,
    backgroundStrokeMask,
    foregroundStrokeMask,
    Math.min(alphaThreshold, limits.coreAlphaMax),
  );
  const coreComponents = findComponents(
    candidateCore,
    image.width,
    image.height,
  );
  const coreComponentIds = new Int32Array(matte.length);
  coreComponentIds.fill(-1);
  const backgroundLab = rgbToOklab(
    backgroundColor.r,
    backgroundColor.g,
    backgroundColor.b,
  );
  const selectedCores = new Set<number>();
  const manuallySelectedCores = new Set<number>();
  // Hue cannot disambiguate an achromatic key from black, white or gray
  // foreground details. Preserve those automatically and retain manual seeds
  // as the explicit signal for true enclosed background pockets.
  const allowAutomaticSelection = hasReliableKeyChroma(backgroundLab);

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
    if (
      allowAutomaticSelection &&
      componentQualifies(component, values, limits)
    )
      selectedCores.add(componentId);
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
    }
  }

  const automaticCoreMask = new Uint8Array(matte.length);
  const manualCoreMask = new Uint8Array(matte.length);
  for (const coreId of selectedCores) {
    const component = coreComponents[coreId];
    if (!component) continue;
    const manuallySelected = manuallySelectedCores.has(coreId);
    for (const pixelIndex of component) {
      if (manuallySelected) manualCoreMask[pixelIndex] = 1;
      else if (
        pixelColorDistances(image, pixelIndex, backgroundLab).weighted <=
        limits.coreColorTolerance
      )
        automaticCoreMask[pixelIndex] = 1;
    }
  }

  // Multi-source geodesic growth recovers dark/anti-aliased key spill while a
  // hard radius and two color constraints prevent it crossing foreground edges.
  const automaticGrowth = growChromaCore(
    automaticCoreMask,
    image,
    matte,
    protectedCore,
    backgroundStrokeMask,
    foregroundStrokeMask,
    backgroundLab,
    limits,
  );
  const manualGrowth = growChromaCore(
    manualCoreMask,
    image,
    matte,
    protectedCore,
    backgroundStrokeMask,
    foregroundStrokeMask,
    backgroundLab,
    limits,
  );
  for (let pixelIndex = 0; pixelIndex < matte.length; pixelIndex += 1) {
    if (automaticGrowth[pixelIndex] || manualGrowth[pixelIndex])
      mask[pixelIndex] = 1;
    if (manualGrowth[pixelIndex]) manualMask[pixelIndex] = 1;
  }
  return { mask, manualMask };
}
