import type {
  Animation,
  AnimationTargetId,
  Keyframe,
  Track,
} from "@kukla2d/contracts";

import { checkBoomerangTimeBlocked } from "./animationBoomerang.js";
import { expandGestureKeyframes } from "./keyframeProvenance.js";

import type { KeyframeMatch } from "./keyframeProvenance.types.js";
import type { MoveKeyframesPreflightResult } from "./moveKeyframesPreflight.types.js";

interface KeyframeReference {
  targetId: AnimationTargetId;
  timeMs: number;
  property?: string;
}

interface MoveKeyframesPreflightInput {
  keyframes?: readonly KeyframeReference[];
  deltaMs: number;
}

function trackKey(track: Track): string {
  return `${track.targetId}::${track.property}`;
}

function collectMatchingKeyframes(
  animation: Animation,
  ref: KeyframeReference,
): KeyframeMatch[] {
  const matches: KeyframeMatch[] = [];
  for (const track of animation.tracks) {
    if (track.targetId !== ref.targetId) continue;
    if (ref.property !== undefined && track.property !== ref.property) continue;
    for (const kf of track.keyframes) {
      if (kf.time === ref.timeMs) {
        matches.push({ track, keyframe: kf, ref });
      }
    }
  }
  return matches;
}

function collectTargetKeyframes(
  animation: Animation,
  refs: readonly KeyframeReference[],
): KeyframeMatch[] {
  const matches: KeyframeMatch[] = [];
  const seen = new Set<string>();
  for (const ref of refs) {
    for (const match of collectMatchingKeyframes(animation, ref)) {
      const key = trackKey(match.track) + "@" + match.keyframe.time;
      if (seen.has(key)) continue;
      seen.add(key);
      matches.push(match);
    }
  }
  return matches;
}

function expandKeyframeGroup(
  animation: Animation,
  matches: readonly KeyframeMatch[],
): KeyframeMatch[] {
  return expandGestureKeyframes(animation, matches, { includeSupport: false });
}

export function moveKeyframesPreflight(
  animation: Animation | null | undefined,
  { keyframes = [], deltaMs }: MoveKeyframesPreflightInput,
): MoveKeyframesPreflightResult {
  if (!animation) return { valid: false, reasonCode: "no_animation" };
  if (keyframes.length === 0)
    return { valid: false, reasonCode: "no_keyframes" };
  if (deltaMs === 0) return { valid: false, reasonCode: "no_delta" };

  const refs: KeyframeReference[] = [];
  const seen = new Set<string>();
  for (const ref of keyframes) {
    if (!ref || typeof ref !== "object") continue;
    const key = `${ref.targetId}::${ref.timeMs}${ref.property !== undefined ? `::${ref.property}` : ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    refs.push(
      ref.property === undefined
        ? { targetId: ref.targetId, timeMs: ref.timeMs }
        : {
            targetId: ref.targetId,
            timeMs: ref.timeMs,
            property: ref.property,
          },
    );
  }
  if (refs.length === 0) return { valid: false, reasonCode: "no_valid_refs" };

  const matches = collectTargetKeyframes(animation, refs);
  if (matches.length === 0)
    return { valid: false, reasonCode: "no_matching_keyframes" };

  const expanded = expandKeyframeGroup(animation, matches);

  const targetFrameByAddress: Record<string, number> = {};
  let minTime = Infinity;
  let maxTime = -Infinity;

  for (const match of expanded) {
    const nextTime = match.keyframe.time + deltaMs;
    targetFrameByAddress[
      `${match.track.targetId}::${match.track.property}::${match.keyframe.time}`
    ] = nextTime;

    if (nextTime < 0) {
      return {
        valid: false,
        reasonCode: "negative_time",
        targetId: match.track.targetId,
        property: match.track.property,
        timeMs: nextTime,
      };
    }
    if (nextTime > animation.duration) {
      return {
        valid: false,
        reasonCode: "exceeds_duration",
        targetId: match.track.targetId,
        property: match.track.property,
        timeMs: nextTime,
        duration: animation.duration,
      };
    }

    const blocked = checkBoomerangTimeBlocked(
      animation,
      match.track.targetId,
      nextTime,
    );
    if (blocked.blocked) {
      return {
        valid: false,
        reasonCode: blocked.reasonCode ?? "boomerang_generated_range",
        targetId: match.track.targetId,
        property: match.track.property,
        timeMs: nextTime,
      };
    }

    if (nextTime < minTime) minTime = nextTime;
    if (nextTime > maxTime) maxTime = nextTime;
  }

  interface TrackMoveState {
    track: Track;
    occupied: Set<number>;
    moves: { keyframe: Keyframe; nextTime: number }[];
  }
  const byTrack = new Map<string, TrackMoveState>();
  for (const match of expanded) {
    const key = trackKey(match.track);
    const nextTime = match.keyframe.time + deltaMs;
    const state = byTrack.get(key) ?? {
      track: match.track,
      occupied: new Set(
        match.track.keyframes
          .filter((kf) => kf.authoring?.role !== "support")
          .map((kf) => kf.time),
      ),
      moves: [],
    };
    state.moves.push({ keyframe: match.keyframe, nextTime });
    byTrack.set(key, state);
  }

  for (const { track, moves, occupied } of byTrack.values()) {
    const adjustedOccupied = new Set(occupied);
    for (const move of moves) adjustedOccupied.delete(move.keyframe.time);
    for (const move of moves) {
      if (adjustedOccupied.has(move.nextTime)) {
        return {
          valid: false,
          reasonCode: "collision",
          targetId: track.targetId,
          property: track.property,
          timeMs: move.nextTime,
        };
      }
    }
  }

  return {
    valid: true,
    targetFrameByAddress,
    deltaMs,
    minTime,
    maxTime,
  };
}
