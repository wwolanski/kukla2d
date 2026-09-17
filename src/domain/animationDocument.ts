import type { Animation, Keyframe } from "@kukla2d/contracts";

import {
  ANIMATION_DEFAULTS,
  durationMsFromFrameCount,
} from "@/domain/animationDefaults.js";

/**
 * Repairs legacy/imported animation data at the document boundary.
 * Evaluation may then rely on finite times and sorted, unique keyframes.
 */
export function normalizeAnimationClip(animation: Animation): Animation {
  const fps =
    Number.isFinite(animation?.fps) && animation.fps > 0
      ? Math.round(animation.fps)
      : ANIMATION_DEFAULTS.fps;
  const duration =
    Number.isFinite(animation?.duration) && animation.duration >= 0
      ? animation.duration
      : durationMsFromFrameCount(ANIMATION_DEFAULTS.frameCount, fps);

  return {
    ...animation,
    duration,
    fps,
    tracks: (animation?.tracks ?? []).map((track) => {
      const byTime = new Map<number, Keyframe>();
      for (const keyframe of track.keyframes ?? []) {
        if (!Number.isFinite(keyframe?.time) || keyframe.time < 0) continue;
        byTime.set(keyframe.time, keyframe);
      }
      return {
        ...track,
        keyframes: [...byTime.values()].sort((a, b) => a.time - b.time),
      };
    }),
    markers: (animation?.markers ?? [])
      .filter((marker) => Number.isFinite(marker?.time) && marker.time >= 0)
      .map((marker) => ({ ...marker }))
      .sort((a, b) => a.time - b.time),
    audioTracks: animation?.audioTracks ?? [],
  };
}

export function normalizeAnimations(animations: unknown): Animation[] {
  if (!Array.isArray(animations)) return [];
  return animations
    .filter(
      (animation): animation is Animation =>
        animation !== null && typeof animation === "object",
    )
    .map(normalizeAnimationClip);
}
