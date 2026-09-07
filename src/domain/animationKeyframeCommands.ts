import {
  toAnimationId,
  toAnimationTargetId,
  type Keyframe,
  type ProjectDocument,
  type Track,
} from "@kukla2d/contracts";

import { checkBoomerangTimeBlocked } from "./animationBoomerang.js";
import {
  assertFiniteNumber,
  assertString,
  collectTargetKeyframes,
  createCommandError,
  getAnimation,
  getOrCreateTrack,
  normalizeKeyframeRefs,
  reconcileEnabledBoomerangTargets,
  removeSupersededMaterializedKeyframes,
  sortTrackKeyframes,
  trackKey,
} from "./animationDocumentCommandSupport.js";
import { validateAnimationEditBatch } from "./animationKeyframeBatchCommands.js";
import {
  easingEquals,
  isSupportedTrackProperty,
  isValidEasing,
  validateTrackValue,
} from "./animationProperties.js";
import {
  expandGestureKeyframes,
  normalizeKeyframeAuthoring,
} from "./keyframeProvenance.js";

import type {
  AnimationCommandResult,
  DeleteAnimationKeyframesPayload,
  MoveAnimationKeyframesPayload,
  SetAnimationKeyframeEasingPayload,
  UpsertAnimationKeyframePayload,
  UpsertAnimationKeyframesPayload,
} from "./animationCommandTypes.types.js";

export function upsertAnimationKeyframe(
  project: ProjectDocument,
  {
    animationId,
    targetId,
    property,
    timeMs,
    value,
    easing = "ease-both",
    authoring,
  }: UpsertAnimationKeyframePayload,
): AnimationCommandResult {
  const id = toAnimationId(assertString(animationId, "animationId"));
  const animation = getAnimation(project, id);
  if (!animation) return { changed: false, affectedIds: [] };
  const normalizedTargetId = toAnimationTargetId(
    assertString(targetId, "targetId"),
  );
  const normalizedProperty = assertString(property, "property");
  if (!isSupportedTrackProperty(normalizedProperty)) {
    throw createCommandError(
      `Unknown animation property "${normalizedProperty}"`,
      {
        property: normalizedProperty,
      },
    );
  }
  const normalizedTimeMs = assertFiniteNumber(timeMs, "timeMs", { min: 0 });
  if (normalizedTimeMs > animation.duration) {
    throw createCommandError("Keyframe time exceeds animation duration", {
      timeMs: normalizedTimeMs,
      duration: animation.duration,
    });
  }
  const blocked = checkBoomerangTimeBlocked(
    animation,
    normalizedTargetId,
    normalizedTimeMs,
  );
  if (blocked.blocked) {
    throw createCommandError(
      "Keyframe time is in locked BOOMERANG generated range",
      {
        targetId: normalizedTargetId,
        timeMs: normalizedTimeMs,
        reasonCode: blocked.reasonCode,
      },
    );
  }
  if (!validateTrackValue(normalizedProperty, value)) {
    throw createCommandError(
      `Invalid value for "${normalizedProperty}" track`,
      {
        property: normalizedProperty,
        value,
      },
    );
  }
  const normalizedEasing = easing ?? "ease-both";
  if (!isValidEasing(normalizedEasing))
    throw createCommandError("Invalid easing", { easing: normalizedEasing });
  const normalizedAuthoring =
    authoring === undefined ? undefined : normalizeKeyframeAuthoring(authoring);
  if (normalizedAuthoring === null) {
    throw createCommandError("Invalid keyframe authoring", { authoring });
  }
  const track = getOrCreateTrack(
    animation,
    normalizedTargetId,
    normalizedProperty,
  );
  const existing = track.keyframes.find((kf) => kf.time === normalizedTimeMs);
  if (existing) {
    const preserveVisibleAuthoring =
      normalizedAuthoring?.role !== "authored" &&
      (!existing.authoring || existing.authoring.role === "authored");
    const valueUnchanged =
      existing.value === value &&
      easingEquals(existing.easing, normalizedEasing);
    const authoringUnchanged =
      normalizedAuthoring === undefined ||
      preserveVisibleAuthoring ||
      (existing.authoring &&
        existing.authoring.gestureId === normalizedAuthoring.gestureId &&
        existing.authoring.role === normalizedAuthoring.role &&
        existing.authoring.source === normalizedAuthoring.source);
    if (valueUnchanged && authoringUnchanged)
      return { changed: false, affectedIds: [] };
    existing.value = value;
    existing.easing = normalizedEasing;
    if (normalizedAuthoring !== undefined && !preserveVisibleAuthoring)
      existing.authoring = normalizedAuthoring;
  } else {
    const newKeyframe: Keyframe = {
      time: normalizedTimeMs,
      value,
      easing: normalizedEasing,
    };
    if (normalizedAuthoring !== undefined)
      newKeyframe.authoring = normalizedAuthoring;
    track.keyframes.push(newKeyframe);
    sortTrackKeyframes(track);
  }
  return {
    changed: true,
    affectedIds: [
      id,
      trackKey(track),
      `${normalizedTargetId}::${normalizedProperty}@${normalizedTimeMs}`,
    ],
  };
}

export function upsertAnimationKeyframes(
  project: ProjectDocument,
  { animationId, keyframes = [] }: UpsertAnimationKeyframesPayload,
): AnimationCommandResult {
  const id = toAnimationId(assertString(animationId, "animationId"));
  const animation = getAnimation(project, id);
  if (!animation) return { changed: false, affectedIds: [] };
  if (!Array.isArray(keyframes))
    throw createCommandError("Invalid keyframes", { keyframes });
  const validation = validateAnimationEditBatch(
    project,
    keyframes.map((keyframe) => ({
      ...keyframe,
      animationId: id,
    })),
  );
  if (!validation.valid)
    throw createCommandError(validation.error, validation.details);
  removeSupersededMaterializedKeyframes(animation, keyframes);
  let changed = false;
  const affectedIds = new Set<string>();
  for (const keyframe of keyframes) {
    if (!keyframe || typeof keyframe !== "object")
      throw createCommandError("Invalid keyframe", { keyframe });
    const result = upsertAnimationKeyframe(project, {
      ...keyframe,
      animationId: id,
    });
    changed ||= result.changed;
    for (const affectedId of result.affectedIds) affectedIds.add(affectedId);
  }
  return changed
    ? { changed: true, affectedIds: [...affectedIds] }
    : { changed: false, affectedIds: [] };
}

export function moveAnimationKeyframes(
  project: ProjectDocument,
  { animationId, keyframes = [], deltaMs }: MoveAnimationKeyframesPayload,
): AnimationCommandResult {
  const id = toAnimationId(assertString(animationId, "animationId"));
  const animation = getAnimation(project, id);
  if (!animation) return { changed: false, affectedIds: [] };
  const normalizedDelta = assertFiniteNumber(deltaMs, "deltaMs");
  if (normalizedDelta === 0) return { changed: false, affectedIds: [] };
  const refs = normalizeKeyframeRefs(keyframes);
  if (refs.length === 0) return { changed: false, affectedIds: [] };
  const matches = collectTargetKeyframes(animation, refs);
  if (matches.length === 0) return { changed: false, affectedIds: [] };
  const expanded = expandGestureKeyframes(animation, matches, {
    includeSupport: false,
  });
  interface TrackMoves {
    track: Track;
    moves: { keyframe: Keyframe; nextTime: number }[];
  }
  const byTrack = new Map<string, TrackMoves>();
  for (const match of expanded) {
    const key = trackKey(match.track);
    const nextTime = match.keyframe.time + normalizedDelta;
    if (nextTime < 0) {
      throw createCommandError("Keyframe time cannot be negative", {
        targetId: match.track.targetId,
        property: match.track.property,
        timeMs: nextTime,
      });
    }
    if (nextTime > animation.duration) {
      throw createCommandError(
        "Keyframe move would exceed animation duration",
        {
          targetId: match.track.targetId,
          property: match.track.property,
          timeMs: nextTime,
          duration: animation.duration,
        },
      );
    }
    const blocked = checkBoomerangTimeBlocked(
      animation,
      match.track.targetId,
      nextTime,
    );
    if (blocked.blocked) {
      throw createCommandError(
        "Keyframe move targets locked BOOMERANG generated range",
        {
          targetId: match.track.targetId,
          property: match.track.property,
          timeMs: nextTime,
          reasonCode: blocked.reasonCode,
        },
      );
    }
    const trackState = byTrack.get(key) ?? { track: match.track, moves: [] };
    trackState.moves.push({ keyframe: match.keyframe, nextTime });
    byTrack.set(key, trackState);
  }
  for (const { track, moves } of byTrack.values()) {
    const occupiedTimes = new Set(
      track.keyframes
        .filter((kf) => kf.authoring?.role !== "support")
        .map((kf) => kf.time),
    );
    for (const move of moves) occupiedTimes.delete(move.keyframe.time);
    for (const move of moves) {
      if (occupiedTimes.has(move.nextTime)) {
        throw createCommandError("Keyframe move would create duplicate time", {
          targetId: track.targetId,
          property: track.property,
          timeMs: move.nextTime,
        });
      }
    }
    const destinationTimes = new Set(moves.map((move) => move.nextTime));
    track.keyframes = track.keyframes.filter(
      (keyframe) =>
        keyframe.authoring?.role !== "support" ||
        !destinationTimes.has(keyframe.time),
    );
    for (const move of moves) move.keyframe.time = move.nextTime;
    sortTrackKeyframes(track);
  }
  reconcileEnabledBoomerangTargets(
    animation,
    [...byTrack.values()].map(({ track }) => track.targetId),
  );
  return { changed: true, affectedIds: [id, ...byTrack.keys()] };
}

export function deleteAnimationKeyframes(
  project: ProjectDocument,
  { animationId, keyframes = [] }: DeleteAnimationKeyframesPayload,
): AnimationCommandResult {
  const id = toAnimationId(assertString(animationId, "animationId"));
  const animation = getAnimation(project, id);
  if (!animation) return { changed: false, affectedIds: [] };
  const refs = normalizeKeyframeRefs(keyframes);
  if (refs.length === 0) return { changed: false, affectedIds: [] };
  const matches = collectTargetKeyframes(animation, refs);
  if (matches.length === 0) return { changed: false, affectedIds: [] };
  const expanded = expandGestureKeyframes(animation, matches, {
    includeSupport: false,
  });
  const byTrack = new Map<string, { track: Track; times: Set<number> }>();
  for (const match of expanded) {
    const key = trackKey(match.track);
    const nextState = byTrack.get(key) ?? {
      track: match.track,
      times: new Set(),
    };
    nextState.times.add(match.keyframe.time);
    byTrack.set(key, nextState);
  }
  for (const { track, times } of byTrack.values()) {
    track.keyframes = track.keyframes.filter(
      (keyframe) => !times.has(keyframe.time),
    );
  }
  animation.tracks = animation.tracks.filter((track) =>
    track.keyframes.some((keyframe) => keyframe.authoring?.role !== "support"),
  );
  reconcileEnabledBoomerangTargets(
    animation,
    [...byTrack.values()].map(({ track }) => track.targetId),
  );
  return { changed: true, affectedIds: [id, ...byTrack.keys()] };
}

export function setAnimationKeyframeEasing(
  project: ProjectDocument,
  { animationId, keyframes = [], easing }: SetAnimationKeyframeEasingPayload,
): AnimationCommandResult {
  const id = toAnimationId(assertString(animationId, "animationId"));
  const animation = getAnimation(project, id);
  if (!animation) return { changed: false, affectedIds: [] };
  const normalizedEasing = easing ?? "ease-both";
  if (!isValidEasing(normalizedEasing))
    throw createCommandError("Invalid easing", { easing: normalizedEasing });
  const refs = normalizeKeyframeRefs(keyframes);
  if (refs.length === 0) return { changed: false, affectedIds: [] };
  const matches = collectTargetKeyframes(animation, refs);
  if (matches.length === 0) return { changed: false, affectedIds: [] };
  const expanded = expandGestureKeyframes(animation, matches);
  let changed = false;
  for (const { keyframe } of expanded) {
    if (easingEquals(keyframe.easing, normalizedEasing)) continue;
    keyframe.easing = normalizedEasing;
    changed = true;
  }
  return changed
    ? {
        changed: true,
        affectedIds: [
          id,
          ...new Set(matches.map(({ track }) => trackKey(track))),
        ],
      }
    : { changed: false, affectedIds: [] };
}
