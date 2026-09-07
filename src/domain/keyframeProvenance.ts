import type {
  Animation,
  Keyframe,
  KeyframeAuthoringMeta,
} from "@kukla2d/contracts";

import type { KeyframeMatch } from "./keyframeProvenance.types.js";

export function normalizeKeyframeAuthoring(
  value: unknown,
): KeyframeAuthoringMeta | null {
  if (!value || typeof value !== "object") return null;

  const candidate = value as Record<string, unknown>;
  if (
    typeof candidate.gestureId !== "string" ||
    candidate.gestureId.length === 0
  )
    return null;
  if (typeof candidate.source !== "string" || candidate.source.length === 0)
    return null;
  if (
    candidate.role !== "authored" &&
    candidate.role !== "derived" &&
    candidate.role !== "support"
  )
    return null;

  return {
    gestureId: candidate.gestureId,
    role: candidate.role,
    source: candidate.source,
  };
}

export function isTimelineVisibleKeyframe(
  keyframe: Keyframe | null | undefined,
): boolean {
  if (!keyframe || typeof keyframe !== "object") return false;
  if (!keyframe.authoring) return true;
  return keyframe.authoring.role === "authored";
}

export function expandGestureKeyframes(
  animation: Animation,
  matches: readonly KeyframeMatch[],
  { includeSupport = true }: { includeSupport?: boolean } = {},
): KeyframeMatch[] {
  const gestureIds = new Set<string>();
  for (const match of matches) {
    if (match.keyframe.authoring?.gestureId) {
      gestureIds.add(match.keyframe.authoring.gestureId);
    }
  }

  if (gestureIds.size === 0) return [...matches];

  const seen = new Set<string>();
  const result: KeyframeMatch[] = [];

  for (const match of matches) {
    const key = `${match.track.targetId}::${match.track.property}::${match.keyframe.time}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(match);
  }

  for (const track of animation.tracks) {
    for (const kf of track.keyframes) {
      if (!kf.authoring || !gestureIds.has(kf.authoring.gestureId)) continue;
      if (!includeSupport && kf.authoring.role === "support") continue;
      const key = `${track.targetId}::${track.property}::${kf.time}`;
      if (seen.has(key)) continue;
      seen.add(key);
      result.push({
        track,
        keyframe: kf,
        ref: {
          targetId: track.targetId,
          timeMs: kf.time,
          property: track.property,
        },
      });
    }
  }

  return result;
}
