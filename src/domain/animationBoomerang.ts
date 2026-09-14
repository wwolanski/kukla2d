import type { Animation, AnimationTargetId } from "@kukla2d/contracts";

import { isTimelineVisibleKeyframe } from "@/domain/keyframeProvenance.js";

export function getTargetAuthoredEndMs(
  animation: Animation,
  targetId: AnimationTargetId,
): number {
  let latestMs = -1;
  for (const track of animation.tracks) {
    if (track.targetId !== targetId) continue;
    for (const kf of track.keyframes) {
      if (!isTimelineVisibleKeyframe(kf)) continue;
      if (kf.time > latestMs) latestMs = kf.time;
    }
  }
  return latestMs;
}

export function checkBoomerangEligibility(
  animation: Animation,
  targetId: AnimationTargetId,
):
  | { eligible: false; reasonCode: "no_authored_keys" | "no_room" }
  | { eligible: true; sourceEndMs: number } {
  const sourceEndMs = getTargetAuthoredEndMs(animation, targetId);
  if (sourceEndMs <= 0) {
    return { eligible: false, reasonCode: "no_authored_keys" };
  }
  if (sourceEndMs >= animation.duration) {
    return { eligible: false, reasonCode: "no_room" };
  }
  return { eligible: true, sourceEndMs };
}

export function getBoomerangCutoff(
  animation: Animation,
  targetId: AnimationTargetId,
): { enabled: false } | { enabled: true; sourceEndMs: number } {
  const targets = animation.boomerangTargets;
  if (!targets || !targets[targetId]) {
    return { enabled: false };
  }
  return { enabled: true, sourceEndMs: targets[targetId].sourceEndMs };
}

export function checkBoomerangTimeBlocked(
  animation: Animation,
  targetId: AnimationTargetId,
  timeMs: number,
):
  | { blocked: false }
  | { blocked: true; reasonCode: "boomerang_generated_range" } {
  const cutoff = getBoomerangCutoff(animation, targetId);
  if (!cutoff.enabled) return { blocked: false };
  if (timeMs > cutoff.sourceEndMs) {
    return { blocked: true, reasonCode: "boomerang_generated_range" };
  }
  return { blocked: false };
}

/**
 * Map a time in the boomerang-generated zone back to the authored source time.
 *
 * For targets with boomerang enabled at sourceEndMs:
 *   t <= sourceEndMs -> source zone, returns t unchanged
 *   t > sourceEndMs  -> generated zone, mapped to sourceEndMs * (duration - t) / (duration - sourceEndMs)
 *
 * At seam (t = sourceEndMs): mappedTimeMs = sourceEndMs
 * At end  (t = duration):    mappedTimeMs = 0
 */
export function getBoomerangSourceTime(
  animation: Animation,
  targetId: AnimationTargetId,
  timeMs: number,
): {
  mappedTimeMs: number;
  isGeneratedZone: boolean;
} {
  const cutoff = getBoomerangCutoff(animation, targetId);
  if (!cutoff.enabled) {
    return { mappedTimeMs: timeMs, isGeneratedZone: false };
  }
  const { sourceEndMs } = cutoff;
  const duration = animation.duration;

  if (timeMs <= sourceEndMs) {
    return { mappedTimeMs: timeMs, isGeneratedZone: false };
  }

  if (!Number.isFinite(timeMs) || timeMs <= 0) {
    return { mappedTimeMs: sourceEndMs, isGeneratedZone: false };
  }

  if (timeMs >= duration) {
    return { mappedTimeMs: 0, isGeneratedZone: true };
  }

  const mappedTimeMs =
    (sourceEndMs * (duration - timeMs)) / (duration - sourceEndMs);
  return { mappedTimeMs, isGeneratedZone: true };
}
