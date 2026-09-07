import {
  toAnimationTargetId,
  type Animation,
  type AnimationModifier,
} from "@kukla2d/contracts";

import { evaluateTimeDriver } from "./modifierEvaluation.js";

import type { AnimationKeyframeInput } from "../animationCommandTypes.types.js";

const SUPPORTED_OUTPUT_KINDS = new Set([
  "blendShapeValue",
  "nodeTransform",
  "boneTransform",
]);
const TRANSFORM_CHANNELS = ["x", "y", "rotation", "scaleX", "scaleY"];

export function createBakeKeyframes({
  modifier,
  clip,
}: {
  modifier: AnimationModifier | null | undefined;
  clip: Animation | null | undefined;
}): AnimationKeyframeInput[] {
  if (!modifier || !clip) return [];
  if (modifier.driver?.kind !== "time") return [];
  if (
    !modifier.driver?.periodMs ||
    !isFinite(modifier.driver.periodMs) ||
    modifier.driver.periodMs <= 0
  )
    return [];
  if (!clip.duration || clip.duration <= 0) return [];

  const period = modifier.driver.periodMs;
  const duration = clip.duration;
  const sampleOffsets = [0, 0.25, 0.5, 0.75, 1];
  const strength = modifier.params?.strength ?? 1;
  const keyframes: AnimationKeyframeInput[] = [];
  let cycleStart = 0;

  while (cycleStart < duration) {
    for (const frac of sampleOffsets) {
      const t = cycleStart + period * frac;
      if (t > duration) continue;

      const driver01 = evaluateTimeDriver(modifier.driver, t);

      for (const output of modifier.outputs ?? []) {
        if (!SUPPORTED_OUTPUT_KINDS.has(output.kind)) continue;

        if (output.kind === "blendShapeValue") {
          if (!output.property) continue;
          const amount = modifier.params?.[output.property] ?? 1;
          const value = Math.max(0, Math.min(1, driver01 * amount * strength));
          keyframes.push({
            targetId: toAnimationTargetId(output.targetId),
            property: `blendShape:${output.property}`,
            timeMs: t,
            value,
            easing: "ease-both",
          });
        } else if (output.kind === "nodeTransform") {
          if (!TRANSFORM_CHANNELS.includes(output.property)) continue;
          const amount = getTransformAmount(modifier.params, output.property);
          const value = driver01 * amount * strength;
          keyframes.push({
            targetId: toAnimationTargetId(output.targetId),
            property: output.property,
            timeMs: t,
            value,
            easing: "ease-both",
          });
        } else if (output.kind === "boneTransform") {
          if (!TRANSFORM_CHANNELS.includes(output.property)) continue;
          const amount = getTransformAmount(modifier.params, output.property);
          const value = driver01 * amount * strength;
          keyframes.push({
            targetId: toAnimationTargetId(output.targetId),
            property: output.property,
            timeMs: t,
            value,
            easing: "ease-both",
          });
        }
      }
    }
    cycleStart += period;
  }

  return keyframes;
}

function getTransformAmount(
  params: Record<string, number> = {},
  property: string,
): number {
  const pixelAmount = params[`${property}Px`];
  if (pixelAmount !== undefined) return pixelAmount;
  const directAmount = params[property];
  if (directAmount !== undefined) return directAmount;
  if (property === "y" && params.verticalLiftPx !== undefined)
    return params.verticalLiftPx;
  return 1;
}
