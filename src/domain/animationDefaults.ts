export const ANIMATION_DEFAULTS = Object.freeze({
  frameCount: 48,
  fps: 24,
  speed: 1,
});

export const ANIMATION_SETTING_LIMITS = Object.freeze({
  frameCount: { min: 1, max: 100000 },
  fps: { min: 1, max: 120 },
  speed: { min: 0.05, max: 4 },
});

function roundToStep(value: number, step: number): number {
  return Math.round(value / step) * step;
}

export function normalizeAnimationSettings(
  candidate: unknown,
): AnimationSettings {
  if (!candidate || typeof candidate !== "object") {
    return { ...ANIMATION_DEFAULTS };
  }

  const { frameCount, fps, speed } = candidate as Partial<AnimationSettings>;
  const limits = ANIMATION_SETTING_LIMITS;

  const normalized: Partial<AnimationSettings> = {};

  if (isFiniteNumber(frameCount)) {
    normalized.frameCount = clamp(
      Math.round(frameCount),
      limits.frameCount.min,
      limits.frameCount.max,
    );
  }
  if (isFiniteNumber(fps)) {
    normalized.fps = clamp(Math.round(fps), limits.fps.min, limits.fps.max);
  }
  if (isFiniteNumber(speed)) {
    normalized.speed = clamp(
      roundToStep(speed, 0.05),
      limits.speed.min,
      limits.speed.max,
    );
  }

  return { ...ANIMATION_DEFAULTS, ...normalized };
}

export function durationMsFromFrameCount(
  frameCount: number,
  fps: number,
): number {
  const safeFrames =
    isFiniteNumber(frameCount) && frameCount > 0
      ? frameCount
      : ANIMATION_DEFAULTS.frameCount;
  const safeFps = isFiniteNumber(fps) && fps > 0 ? fps : ANIMATION_DEFAULTS.fps;
  return (safeFrames / safeFps) * 1000;
}
import { clamp, isFiniteNumber } from "@/lib/math";

import type { AnimationSettings } from "./animationDefaults.types.js";
