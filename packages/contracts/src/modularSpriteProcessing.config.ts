import type { ModularSpriteProcessingRecipe } from "./project.types.js";

interface NumericProcessingParameter {
  readonly default: number;
  readonly min: number;
  readonly max: number;
  readonly step: number;
  readonly digits: number;
  readonly integer?: true;
}

/**
 * Single source of truth for the processing recipe, Web UI controls and
 * implementation-level tuning. Persisted recipes intentionally contain only
 * recipe values; ranges and algorithm constants stay versioned with the code.
 */
export const MODULAR_SPRITE_PROCESSING_CONFIG = {
  background: {
    mode: { default: "chroma" as const },
    color: {
      default: { r: 0, g: 255, b: 0 },
      channel: { min: 0, max: 255, step: 1, integer: true },
    },
    tolerance: {
      default: 0.08,
      min: 0,
      max: 0.25,
      step: 0.002,
      digits: 3,
    },
    softness: {
      default: 0.12,
      min: 0.002,
      max: 0.25,
      step: 0.002,
      digits: 3,
    },
    despill: { default: 0.8, min: 0, max: 1, step: 0.02, digits: 2 },
    protectIslandInteriors: { default: true },
    interiorProtectionInset: {
      default: 2,
      min: 1,
      max: 8,
      step: 1,
      digits: 0,
      integer: true,
    },
    matteChoke: {
      default: 0.1,
      min: 0,
      max: 0.25,
      step: 0.01,
      digits: 2,
    },
    edgeColorRecovery: {
      default: 0.9,
      min: 0,
      max: 1,
      step: 0.05,
      digits: 2,
    },
    edgeSearchRadius: {
      default: 4,
      min: 0,
      max: 12,
      step: 1,
      digits: 0,
      integer: true,
    },
  },
  detection: {
    alphaThreshold: {
      default: 32,
      min: 1,
      max: 254,
      step: 1,
      digits: 0,
      integer: true,
    },
    minimumRegionAreaRatio: {
      default: 0.00005,
      min: 0,
      max: 0.01,
      step: 0.00005,
      digits: 5,
    },
    openingRadius: {
      default: 0,
      min: 0,
      max: 8,
      step: 1,
      digits: 0,
      integer: true,
    },
    closingRadius: {
      default: 1,
      min: 0,
      max: 8,
      step: 1,
      digits: 0,
      integer: true,
    },
    connectivity: { default: 8 as const },
  },
  strokes: {
    radius: { minExclusive: 0, max: 1 },
    editorRadius: {
      default: 0.012,
      min: 0.002,
      max: 0.08,
      step: 0.002,
      digits: 3,
    },
    minimumPixelRadius: 1,
    sampleSpacingRadiusFactor: 0.5,
  },
  algorithm: {
    alphaByteMax: 255,
    confidentForegroundAlpha: 254,
    oklabLightnessWeight: 0.5,
    despillKeyAlphaMin: 0.02,
    despillKeyAlphaMax: 0.995,
    despillSafeAlphaMin: 0.08,
    processingChunkRows: 64,
    oklabCacheMaxPixels: 4_000_000,
    transparentBorderAlpha: 16,
    transparentBorderRatio: 0.5,
    borderColorBinShift: 4,
    lowBorderConfidence: 0.55,
    maxDetectedRegions: 256,
    maxContourCandidates: 1024,
    maxContourPoints: 256,
    extractionPaddingRatio: 0.01,
    extractionPaddingMin: 4,
    extractionPaddingMax: 32,
  },
} as const;

const config = MODULAR_SPRITE_PROCESSING_CONFIG;

export const DEFAULT_CHROMA_REFINEMENT = {
  protectIslandInteriors: config.background.protectIslandInteriors.default,
  interiorProtectionInset: config.background.interiorProtectionInset.default,
  matteChoke: config.background.matteChoke.default,
  edgeColorRecovery: config.background.edgeColorRecovery.default,
  edgeSearchRadius: config.background.edgeSearchRadius.default,
} as const;

export function createDefaultModularSpriteRecipe(): ModularSpriteProcessingRecipe {
  return {
    background: {
      mode: config.background.mode.default,
      color: { ...config.background.color.default },
      tolerance: config.background.tolerance.default,
      softness: config.background.softness.default,
      despill: config.background.despill.default,
      ...DEFAULT_CHROMA_REFINEMENT,
    },
    detection: {
      alphaThreshold: config.detection.alphaThreshold.default,
      minimumRegionAreaRatio: config.detection.minimumRegionAreaRatio.default,
      openingRadius: config.detection.openingRadius.default,
      closingRadius: config.detection.closingRadius.default,
      connectivity: config.detection.connectivity.default,
    },
    strokes: [],
  };
}

export const DEFAULT_MODULAR_SPRITE_RECIPE = createDefaultModularSpriteRecipe();

interface ChromaRefinement {
  protectIslandInteriors: boolean;
  interiorProtectionInset: number;
  matteChoke: number;
  edgeColorRecovery: number;
  edgeSearchRadius: number;
}

export function resolveChromaRefinement(
  background: ModularSpriteProcessingRecipe["background"],
): ChromaRefinement {
  return {
    protectIslandInteriors:
      background.protectIslandInteriors ??
      DEFAULT_CHROMA_REFINEMENT.protectIslandInteriors,
    interiorProtectionInset:
      background.interiorProtectionInset ??
      DEFAULT_CHROMA_REFINEMENT.interiorProtectionInset,
    matteChoke: background.matteChoke ?? DEFAULT_CHROMA_REFINEMENT.matteChoke,
    edgeColorRecovery:
      background.edgeColorRecovery ??
      DEFAULT_CHROMA_REFINEMENT.edgeColorRecovery,
    edgeSearchRadius:
      background.edgeSearchRadius ?? DEFAULT_CHROMA_REFINEMENT.edgeSearchRadius,
  };
}

function assertNumericParameter(
  name: string,
  value: unknown,
  parameter: NumericProcessingParameter,
): asserts value is number {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < parameter.min ||
    value > parameter.max ||
    (parameter.integer === true && !Number.isInteger(value))
  )
    throw new Error(
      `${name} must be ${parameter.integer === true ? "an integer " : ""}between ${parameter.min} and ${parameter.max}`,
    );
}

function assertRecord(
  name: string,
  value: unknown,
): asserts value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    throw new Error(`${name} must be an object`);
}

/** Validates the exact recipe contract accepted by both browser and CLI. */
export function assertValidModularSpriteRecipe(
  value: unknown,
): asserts value is ModularSpriteProcessingRecipe {
  assertRecord("recipe", value);
  assertRecord("background", value.background);
  const background = value.background;
  if (background.mode !== "alpha" && background.mode !== "chroma")
    throw new Error("background.mode must be alpha or chroma");
  assertRecord("background.color", background.color);
  for (const channel of ["r", "g", "b"] as const) {
    const channelValue = background.color[channel];
    const range = config.background.color.channel;
    if (
      typeof channelValue !== "number" ||
      !Number.isInteger(channelValue) ||
      channelValue < range.min ||
      channelValue > range.max
    )
      throw new Error(
        `background.color.${channel} must be an integer between 0 and 255`,
      );
  }
  assertNumericParameter(
    "background.tolerance",
    background.tolerance,
    config.background.tolerance,
  );
  assertNumericParameter(
    "background.softness",
    background.softness,
    config.background.softness,
  );
  assertNumericParameter(
    "background.despill",
    background.despill,
    config.background.despill,
  );
  const protectIslandInteriors =
    background.protectIslandInteriors ??
    DEFAULT_CHROMA_REFINEMENT.protectIslandInteriors;
  if (typeof protectIslandInteriors !== "boolean")
    throw new Error("background.protectIslandInteriors must be boolean");
  assertNumericParameter(
    "background.interiorProtectionInset",
    background.interiorProtectionInset ??
      DEFAULT_CHROMA_REFINEMENT.interiorProtectionInset,
    config.background.interiorProtectionInset,
  );
  assertNumericParameter(
    "background.matteChoke",
    background.matteChoke ?? DEFAULT_CHROMA_REFINEMENT.matteChoke,
    config.background.matteChoke,
  );
  assertNumericParameter(
    "background.edgeColorRecovery",
    background.edgeColorRecovery ?? DEFAULT_CHROMA_REFINEMENT.edgeColorRecovery,
    config.background.edgeColorRecovery,
  );
  assertNumericParameter(
    "background.edgeSearchRadius",
    background.edgeSearchRadius ?? DEFAULT_CHROMA_REFINEMENT.edgeSearchRadius,
    config.background.edgeSearchRadius,
  );
  assertRecord("detection", value.detection);
  const detection = value.detection;
  assertNumericParameter(
    "detection.alphaThreshold",
    detection.alphaThreshold,
    config.detection.alphaThreshold,
  );
  assertNumericParameter(
    "detection.minimumRegionAreaRatio",
    detection.minimumRegionAreaRatio,
    config.detection.minimumRegionAreaRatio,
  );
  assertNumericParameter(
    "detection.openingRadius",
    detection.openingRadius,
    config.detection.openingRadius,
  );
  assertNumericParameter(
    "detection.closingRadius",
    detection.closingRadius,
    config.detection.closingRadius,
  );
  if (detection.connectivity !== config.detection.connectivity.default)
    throw new Error("detection.connectivity must be 8");
  if (!Array.isArray(value.strokes))
    throw new Error("strokes must be an array");
  for (const [index, strokeValue] of value.strokes.entries()) {
    assertRecord(`strokes.${index}`, strokeValue);
    const stroke = strokeValue;
    if (
      stroke.kind !== "foreground" &&
      stroke.kind !== "background" &&
      stroke.kind !== "split"
    )
      throw new Error(
        `strokes.${index}.kind must be foreground, background or split`,
      );
    if (
      typeof stroke.radius !== "number" ||
      !Number.isFinite(stroke.radius) ||
      stroke.radius <= config.strokes.radius.minExclusive ||
      stroke.radius > config.strokes.radius.max
    )
      throw new Error(
        `strokes.${index}.radius must be greater than 0 and at most 1`,
      );
    if (!Array.isArray(stroke.points) || stroke.points.length === 0)
      throw new Error(`strokes.${index}.points must not be empty`);
    for (const [pointIndex, pointValue] of stroke.points.entries()) {
      assertRecord(`strokes.${index}.points.${pointIndex}`, pointValue);
      const point = pointValue;
      for (const axis of ["x", "y"] as const)
        if (
          typeof point[axis] !== "number" ||
          !Number.isFinite(point[axis]) ||
          point[axis] < 0 ||
          point[axis] > 1
        )
          throw new Error(
            `strokes.${index}.points.${pointIndex}.${axis} must be between 0 and 1`,
          );
    }
  }
}
