import type { Animation, Keyframe, Track } from "@kukla2d/contracts";

import { interpolateTrack, interpolateMeshVerts } from "./animationEngine.js";

import type { AnimationEasing } from "./animationCommandTypes.types.js";

/**
 * Deep-clone a plain animation object (JSON-safe only; no functions/Map/Set).
 */
function deepClone(animation: Animation): Animation {
  return JSON.parse(JSON.stringify(animation)) as Animation;
}

function reverseEasing(
  easing: Keyframe["easing"],
): AnimationEasing | undefined {
  if (easing === "ease-in") return "ease-out";
  if (easing === "ease-out") return "ease-in";
  if (Array.isArray(easing) && easing.length === 4) {
    return [1 - easing[2], 1 - easing[3], 1 - easing[0], 1 - easing[1]];
  }
  return easing;
}

function getTrackInterpolator(
  track: Track,
): (
  keyframes: readonly Keyframe[],
  timeMs: number,
  loopKeyframes?: boolean,
  endMs?: number,
) => unknown {
  return track.property === "mesh_verts"
    ? interpolateMeshVerts
    : interpolateTrack;
}

function mapGeneratedTime(
  sourceTimeMs: number,
  sourceEndMs: number,
  duration: number,
): number {
  return duration - ((duration - sourceEndMs) * sourceTimeMs) / sourceEndMs;
}

/**
 * Materialize one export-only reverse pass. One end key is insufficient: it
 * loses interior poses and easing whenever source and generated durations
 * differ. The temporary track instead mirrors every authored segment.
 */
function expandTrackForBoomerang(
  track: Track,
  sourceEndMs: number,
  duration: number,
): void {
  const interpolate = getTrackInterpolator(track);
  const source = track.keyframes
    .filter((keyframe) => keyframe.time <= sourceEndMs)
    .sort((a, b) => a.time - b.time);
  if (source.length === 0) return;

  const seamValue = interpolate(source, sourceEndMs, false, duration);
  if (seamValue === undefined) return;

  const lastSource = source[source.length - 1]!;
  const hasSeamKey = lastSource.time === sourceEndMs;
  const seamKey: Keyframe =
    lastSource.easing === undefined
      ? { time: sourceEndMs, value: seamValue }
      : { time: sourceEndMs, value: seamValue, easing: lastSource.easing };
  const forward: Keyframe[] = hasSeamKey ? source : [...source, seamKey];
  const reverse: Keyframe[] = [];

  for (let sourceIndex = forward.length - 2; sourceIndex >= 0; sourceIndex--) {
    const sourceKey = forward[sourceIndex]!;
    const previousKey = forward[sourceIndex - 1];
    const finalKey = forward[forward.length - 1]!;
    const reverseKey: Keyframe = {
      time: mapGeneratedTime(sourceKey.time, sourceEndMs, duration),
      value: sourceKey.value,
    };
    const reversedEasing =
      sourceIndex > 0 ? reverseEasing(previousKey!.easing) : finalKey.easing;
    if (reversedEasing !== undefined) reverseKey.easing = reversedEasing;
    reverse.push(reverseKey);
  }

  // The seam key's outgoing easing controls the first reversed segment.
  const expandedForward: Keyframe[] = forward.map((keyframe) => ({
    ...keyframe,
  }));
  if (reverse.length > 0) {
    const seamKey = expandedForward[expandedForward.length - 1]!;
    const reversedSeamEasing = reverseEasing(
      forward[forward.length - 2]!.easing,
    );
    if (reversedSeamEasing === undefined) delete seamKey.easing;
    else seamKey.easing = reversedSeamEasing;
    // No segment follows the terminal key. Preserve its authored easing for
    // exporters that retain key metadata even when it has no outgoing curve.
    const terminalKey = reverse[reverse.length - 1]!;
    const terminalEasing = forward[forward.length - 1]!.easing;
    if (terminalEasing === undefined) delete terminalKey.easing;
    else terminalKey.easing = terminalEasing;
  }
  track.keyframes = [...expandedForward, ...reverse];
}

/**
 * Return an ephemeral deep clone of the animation with boomerang tracks
 * expanded to cover the full duration.
 *
 * For each boomerang-enabled target, every authored property track gets a
 * temporary reverse pass containing its seam and each mirrored source key.
 * This preserves all interior poses and easing for track-based exporters.
 *
 * The returned object MUST never be persisted to project state or undo history.
 * If no targets have boomerang, the original animation reference is returned
 * (no clone).
 */
export function expandAnimationForExport(
  animation: Animation | null | undefined,
): Animation | null | undefined {
  if (
    !animation ||
    !animation.boomerangTargets ||
    Object.keys(animation.boomerangTargets).length === 0
  ) {
    return animation;
  }

  const expanded = deepClone(animation);
  const duration = expanded.duration;

  const boomerangTargets = expanded.boomerangTargets!;
  for (const [targetId, { sourceEndMs }] of Object.entries(boomerangTargets)) {
    for (const track of expanded.tracks) {
      if (track.targetId !== targetId) continue;
      if (!track.keyframes || track.keyframes.length === 0) continue;
      expandTrackForBoomerang(track, sourceEndMs, duration);
    }
  }

  return expanded;
}
