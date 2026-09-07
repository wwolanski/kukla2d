import {
  toAnimationTargetId,
  type Animation,
  type AnimationId,
  type AnimationTargetId,
  type AudioTrack,
  type Keyframe,
  type Marker,
  type ProjectDocument,
  type Track,
} from "@kukla2d/contracts";

import { isFiniteNumber } from "@/lib/math";

import { checkBoomerangEligibility } from "./animationBoomerang.js";

import type { AnimationKeyframeInput } from "./animationCommandTypes.types.js";

interface CommandErrorDetails {
  [key: string]: unknown;
}

interface AnimationKeyframeRef {
  targetId: AnimationTargetId;
  timeMs: number;
  property?: string;
}

interface AnimationKeyframeMatch {
  track: Track;
  keyframe: Keyframe;
  ref: AnimationKeyframeRef;
}

export class AnimationDocumentCommandError extends Error {
  readonly details: CommandErrorDetails;

  constructor(message: string, details: CommandErrorDetails = {}) {
    super(message);
    this.name = "AnimationDocumentCommandError";
    this.details = details;
  }
}

export function createCommandError(
  message: string,
  details: CommandErrorDetails = {},
): AnimationDocumentCommandError {
  return new AnimationDocumentCommandError(message, details);
}

export function assertFiniteNumber(
  value: unknown,
  fieldName: string,
  { min = -Infinity, max = Infinity }: { min?: number; max?: number } = {},
): number {
  if (!isFiniteNumber(value))
    throw createCommandError(`Invalid ${fieldName}`, { fieldName, value });
  if (value < min || value > max) {
    throw createCommandError(`Invalid ${fieldName}`, {
      fieldName,
      value,
      min,
      max,
    });
  }
  return value;
}

export function assertString(
  value: unknown,
  fieldName: string,
  { allowEmpty = false }: { allowEmpty?: boolean } = {},
): string {
  if (typeof value !== "string")
    throw createCommandError(`Invalid ${fieldName}`, { fieldName, value });
  const normalized = value.trim();
  if (!allowEmpty && normalized.length === 0) {
    throw createCommandError(`Invalid ${fieldName}`, { fieldName, value });
  }
  return normalized;
}

export function cloneArray<T>(value: readonly T[] | null | undefined): T[] {
  return value ? Array.from(value) : [];
}

export function getAnimation(
  project: ProjectDocument,
  animationId: AnimationId,
): Animation | null {
  return (
    project.animations.find((animation) => animation.id === animationId) ?? null
  );
}

export function getTrack(
  animation: Animation,
  targetId: AnimationTargetId,
  property: string,
): Track | null {
  return (
    animation.tracks.find(
      (track) => track.targetId === targetId && track.property === property,
    ) ?? null
  );
}

export function getOrCreateTrack(
  animation: Animation,
  targetId: AnimationTargetId,
  property: string,
): Track {
  let track = getTrack(animation, targetId, property);
  if (!track) {
    track = { targetId, property, keyframes: [] };
    animation.tracks.push(track);
  }
  return track;
}

export function removeSupersededMaterializedKeyframes(
  animation: Animation,
  edits: readonly AnimationKeyframeInput[],
): void {
  const supersededGestureIds = new Set<string>();
  for (const edit of edits) {
    const authoring = edit.authoring;
    if (authoring?.role !== "authored") continue;
    const existing = getTrack(
      animation,
      edit.targetId,
      edit.property,
    )?.keyframes.find((keyframe) => keyframe.time === edit.timeMs);
    const existingAuthoring = existing?.authoring;
    if (
      existingAuthoring?.role === "authored" &&
      existingAuthoring.source === authoring.source &&
      existingAuthoring.gestureId !== authoring.gestureId
    ) {
      supersededGestureIds.add(existingAuthoring.gestureId);
    }
  }
  if (supersededGestureIds.size === 0) return;
  for (const track of animation.tracks) {
    track.keyframes = track.keyframes.filter((keyframe) => {
      const authoring = keyframe.authoring;
      return (
        authoring?.role === "authored" ||
        !authoring?.gestureId ||
        !supersededGestureIds.has(authoring.gestureId)
      );
    });
  }
  animation.tracks = animation.tracks.filter(
    (track) => track.keyframes.length > 0,
  );
}

export function trackKey(track: Track): string {
  return `${track.targetId}::${track.property}`;
}

function keyframeRefKey(ref: AnimationKeyframeRef): string {
  return `${ref.targetId}::${ref.timeMs}${ref.property ? `::${ref.property}` : ""}`;
}

export function normalizeKeyframeRefs(
  keyframes: unknown,
): AnimationKeyframeRef[] {
  const seen = new Set<string>();
  const refs: AnimationKeyframeRef[] = [];
  const candidates = Array.isArray(keyframes) ? keyframes : [];
  for (const rawRef of candidates) {
    if (!rawRef || typeof rawRef !== "object") {
      throw createCommandError("Invalid keyframe reference", {
        keyframe: rawRef,
      });
    }
    const candidate = rawRef as Record<string, unknown>;
    const targetId = toAnimationTargetId(
      assertString(candidate.targetId, "targetId"),
    );
    const timeMs = assertFiniteNumber(candidate.timeMs, "timeMs", { min: 0 });
    const property =
      candidate.property === undefined
        ? undefined
        : assertString(candidate.property, "property");
    const ref: AnimationKeyframeRef =
      property === undefined
        ? { targetId, timeMs }
        : { targetId, timeMs, property };
    const key = keyframeRefKey(ref);
    if (seen.has(key)) continue;
    seen.add(key);
    refs.push(ref);
  }
  return refs;
}

function collectMatchingKeyframes(
  animation: Animation,
  ref: AnimationKeyframeRef,
): Omit<AnimationKeyframeMatch, "ref">[] {
  const matches: Omit<AnimationKeyframeMatch, "ref">[] = [];
  const tracks = ref.property
    ? [getTrack(animation, ref.targetId, ref.property)].filter(Boolean)
    : animation.tracks.filter((track) => track.targetId === ref.targetId);
  for (const track of tracks.filter(
    (candidate): candidate is Track => candidate !== null,
  )) {
    const keyframe = track.keyframes.find((kf) => kf.time === ref.timeMs);
    if (keyframe) matches.push({ track, keyframe });
  }
  return matches;
}

export function collectTargetKeyframes(
  animation: Animation,
  refs: unknown,
): AnimationKeyframeMatch[] {
  const matches: AnimationKeyframeMatch[] = [];
  const seen = new Set<string>();
  for (const ref of normalizeKeyframeRefs(refs)) {
    const refMatches = collectMatchingKeyframes(animation, ref);
    if (refMatches.length === 0)
      throw createCommandError("Animation keyframe not found", { ...ref });
    for (const match of refMatches) {
      const key = `${trackKey(match.track)}::${match.keyframe.time}`;
      if (seen.has(key)) continue;
      seen.add(key);
      matches.push({ ...match, ref });
    }
  }
  return matches;
}

export function sortTrackKeyframes(track: Track): void {
  track.keyframes.sort((a, b) => a.time - b.time);
}

export function reconcileEnabledBoomerangTargets(
  animation: Animation,
  targetIds: Iterable<AnimationTargetId>,
): void {
  if (!animation.boomerangTargets) return;
  const next = { ...animation.boomerangTargets };
  for (const targetId of new Set(targetIds)) {
    if (!next[targetId]) continue;
    const eligibility = checkBoomerangEligibility(animation, targetId);
    if (eligibility.eligible)
      next[targetId] = { sourceEndMs: eligibility.sourceEndMs };
    else delete next[targetId];
  }
  if (Object.keys(next).length > 0) animation.boomerangTargets = next;
  else delete animation.boomerangTargets;
}

export function normalizeMarkers(
  markers: readonly Marker[] | null | undefined,
): Marker[] {
  return cloneArray(markers)
    .map((marker) => ({ ...marker }))
    .sort((a, b) => a.time - b.time);
}

export function normalizeAudioTrackPatch(
  track: AudioTrack,
  patch: Partial<Omit<AudioTrack, "id">>,
): AudioTrack {
  const next = { ...track, ...patch };
  if ("name" in patch && patch.name !== undefined)
    next.name = assertString(patch.name, "name");
  for (const field of ["source", "sourceUrl", "mimeType"] as const) {
    if (field in patch && patch[field] !== undefined && patch[field] !== null) {
      next[field] = assertString(patch[field], field, { allowEmpty: true });
    }
  }
  for (const field of [
    "audioDurationMs",
    "audioStartMs",
    "timelineStartMs",
  ] as const) {
    if (field in patch && patch[field] !== undefined) {
      next[field] = assertFiniteNumber(patch[field], field, { min: 0 });
    }
  }
  if ("audioEndMs" in patch) {
    if (patch.audioEndMs === null) next.audioEndMs = null;
    else if (patch.audioEndMs !== undefined) {
      next.audioEndMs = assertFiniteNumber(patch.audioEndMs, "audioEndMs", {
        min: 0,
      });
    }
  }
  const audioStartMs = next.audioStartMs ?? 0;
  if (
    next.audioEndMs !== null &&
    next.audioEndMs !== undefined &&
    next.audioEndMs < audioStartMs + 100
  ) {
    throw createCommandError("Audio track duration must be at least 100ms", {
      audioStartMs,
      audioEndMs: next.audioEndMs,
    });
  }
  return next;
}
