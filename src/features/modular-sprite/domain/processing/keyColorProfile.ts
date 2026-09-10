import { MODULAR_SPRITE_PROCESSING_CONFIG } from "@kukla2d/contracts";

import { clamp } from "../imageMath.js";

type OklabColor = readonly number[];

export function keyColorChroma(backgroundLab: OklabColor): number {
  return Math.hypot(backgroundLab[1] ?? 0, backgroundLab[2] ?? 0);
}

export function hasReliableKeyChroma(backgroundLab: OklabColor): boolean {
  return (
    keyColorChroma(backgroundLab) >=
    MODULAR_SPRITE_PROCESSING_CONFIG.algorithm.neutralKeyChromaThreshold
  );
}

export function keyLightnessWeight(backgroundLab: OklabColor): number {
  const algorithm = MODULAR_SPRITE_PROCESSING_CONFIG.algorithm;
  const chromaRatio = clamp(
    keyColorChroma(backgroundLab) / algorithm.neutralKeyChromaThreshold,
    0,
    1,
  );
  return (
    algorithm.neutralKeyLightnessWeight +
    (algorithm.oklabLightnessWeight - algorithm.neutralKeyLightnessWeight) *
      chromaRatio
  );
}
