import {
  toAnimationId,
  toAnimationTargetId,
  type AudioTrack,
  type ProjectDocument,
} from "@kukla2d/contracts";

import { uid } from "@/lib/uid";

import { checkBoomerangEligibility } from "./animationBoomerang.js";
import {
  assertFiniteNumber,
  assertString,
  cloneArray,
  createCommandError,
  getAnimation,
  normalizeAudioTrackPatch,
  normalizeMarkers,
} from "./animationDocumentCommandSupport.js";

import type {
  AddAnimationAudioTrackPayload,
  AddAnimationMarkerPayload,
  AnimationCommandResult,
  RemoveAnimationAudioTrackPayload,
  SetAnimationTargetBoomerangPayload,
  UpdateAnimationAudioTrackPayload,
} from "./animationCommandTypes.types.js";

export function addAnimationMarker(
  project: ProjectDocument,
  {
    animationId,
    label = "Marker",
    timeMs,
    markerId,
  }: AddAnimationMarkerPayload,
): AnimationCommandResult {
  const id = toAnimationId(assertString(animationId, "animationId"));
  const animation = getAnimation(project, id);
  if (!animation) return { changed: false, affectedIds: [] };
  const newMarker = {
    id: markerId ? assertString(markerId, "markerId") : uid(),
    label: assertString(label, "label"),
    time: assertFiniteNumber(timeMs, "timeMs", { min: 0 }),
  };
  animation.markers = normalizeMarkers(animation.markers);
  animation.markers.push(newMarker);
  animation.markers.sort((a, b) => a.time - b.time);
  return { changed: true, affectedIds: [id, newMarker.id] };
}

export function addAnimationAudioTrack(
  project: ProjectDocument,
  {
    animationId,
    audioTrackId,
    name,
    source,
    sourceUrl = null,
    mimeType = null,
    audioDurationMs = 0,
    audioStartMs = 0,
    audioEndMs = null,
    timelineStartMs = 0,
  }: AddAnimationAudioTrackPayload,
): AnimationCommandResult {
  const id = toAnimationId(assertString(animationId, "animationId"));
  const animation = getAnimation(project, id);
  if (!animation) return { changed: false, affectedIds: [] };
  const nextTrack: AudioTrack = {
    id: audioTrackId ? assertString(audioTrackId, "audioTrackId") : uid(),
    name:
      name === undefined
        ? `Audio ${cloneArray(animation.audioTracks).length + 1}`
        : assertString(name, "name"),
    sourceUrl:
      sourceUrl === null
        ? null
        : assertString(sourceUrl, "sourceUrl", { allowEmpty: true }),
    mimeType:
      mimeType === null
        ? null
        : assertString(mimeType, "mimeType", { allowEmpty: true }),
    audioDurationMs: assertFiniteNumber(audioDurationMs, "audioDurationMs", {
      min: 0,
    }),
    audioStartMs: assertFiniteNumber(audioStartMs, "audioStartMs", { min: 0 }),
    audioEndMs:
      audioEndMs === null
        ? null
        : assertFiniteNumber(audioEndMs, "audioEndMs", { min: 0 }),
    timelineStartMs: assertFiniteNumber(timelineStartMs, "timelineStartMs", {
      min: 0,
    }),
  };
  if (source !== undefined) nextTrack.source = source;
  const normalizedAudioStartMs = nextTrack.audioStartMs ?? 0;
  const normalizedAudioEndMs = nextTrack.audioEndMs;
  if (
    normalizedAudioEndMs !== null &&
    normalizedAudioEndMs !== undefined &&
    normalizedAudioEndMs < normalizedAudioStartMs + 100
  ) {
    throw createCommandError("Audio track duration must be at least 100ms", {
      audioStartMs: normalizedAudioStartMs,
      audioEndMs: normalizedAudioEndMs,
    });
  }
  animation.audioTracks = cloneArray(animation.audioTracks);
  animation.audioTracks.push(nextTrack);
  return { changed: true, affectedIds: [id, nextTrack.id] };
}

export function updateAnimationAudioTrack(
  project: ProjectDocument,
  { animationId, audioTrackId, patch = {} }: UpdateAnimationAudioTrackPayload,
): AnimationCommandResult {
  const id = toAnimationId(assertString(animationId, "animationId"));
  const animation = getAnimation(project, id);
  if (!animation) return { changed: false, affectedIds: [] };
  const trackId = assertString(audioTrackId, "audioTrackId");
  const track =
    animation.audioTracks?.find((item) => item.id === trackId) ?? null;
  if (!track) return { changed: false, affectedIds: [] };
  const nextTrack = normalizeAudioTrackPatch(track, patch);
  const changed = (Object.keys(patch) as (keyof Omit<AudioTrack, "id">)[]).some(
    (key) => track[key] !== nextTrack[key],
  );
  if (!changed) return { changed: false, affectedIds: [] };
  Object.assign(track, nextTrack);
  return { changed: true, affectedIds: [id, trackId] };
}

export function removeAnimationAudioTrack(
  project: ProjectDocument,
  { animationId, audioTrackId }: RemoveAnimationAudioTrackPayload,
): AnimationCommandResult {
  const id = toAnimationId(assertString(animationId, "animationId"));
  const animation = getAnimation(project, id);
  if (!animation) return { changed: false, affectedIds: [] };
  const trackId = assertString(audioTrackId, "audioTrackId");
  const index =
    animation.audioTracks?.findIndex((item) => item.id === trackId) ?? -1;
  if (index < 0) return { changed: false, affectedIds: [] };
  animation.audioTracks!.splice(index, 1);
  return { changed: true, affectedIds: [id, trackId] };
}

export function setAnimationTargetBoomerang(
  project: ProjectDocument,
  { animationId, targetId, enabled }: SetAnimationTargetBoomerangPayload,
): AnimationCommandResult {
  const id = toAnimationId(assertString(animationId, "animationId"));
  const animation = getAnimation(project, id);
  if (!animation) return { changed: false, affectedIds: [] };
  const normalizedTargetId = toAnimationTargetId(
    assertString(targetId, "targetId"),
  );
  const normalizedEnabled = !!enabled;
  const existing = animation.boomerangTargets?.[normalizedTargetId];
  if (!normalizedEnabled && !existing)
    return { changed: false, affectedIds: [] };
  if (!normalizedEnabled) {
    const next = { ...(animation.boomerangTargets ?? {}) };
    delete next[normalizedTargetId];
    if (Object.keys(next).length === 0) delete animation.boomerangTargets;
    else animation.boomerangTargets = next;
    return { changed: true, affectedIds: [id, normalizedTargetId] };
  }
  const eligibility = checkBoomerangEligibility(animation, normalizedTargetId);
  if (!eligibility.eligible) {
    throw createCommandError("Cannot enable BOOMERANG for target", {
      targetId: normalizedTargetId,
      reasonCode: eligibility.reasonCode,
    });
  }
  if (existing && existing.sourceEndMs === eligibility.sourceEndMs) {
    return { changed: false, affectedIds: [] };
  }
  animation.boomerangTargets = {
    ...(animation.boomerangTargets ?? {}),
    [normalizedTargetId]: { sourceEndMs: eligibility.sourceEndMs },
  };
  return { changed: true, affectedIds: [id, normalizedTargetId] };
}
