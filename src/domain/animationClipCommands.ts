import { toAnimationId, type ProjectDocument } from "@kukla2d/contracts";

import { uid } from "@/lib/uid";

import {
  ANIMATION_DEFAULTS,
  durationMsFromFrameCount,
} from "./animationDefaults.js";
import {
  assertFiniteNumber,
  assertString,
  createCommandError,
  getAnimation,
} from "./animationDocumentCommandSupport.js";

import type {
  AnimationCommandResult,
  CreateAnimationClipPayload,
  UpdateAnimationTimingPayload,
} from "./animationCommandTypes.types.js";

export function createAnimationClip(
  project: ProjectDocument,
  payload: CreateAnimationClipPayload = {},
): AnimationCommandResult {
  const animationId =
    payload.animationId ??
    (payload.id ? toAnimationId(payload.id) : toAnimationId(uid()));
  if (getAnimation(project, animationId)) {
    throw createCommandError("Animation clip already exists", { animationId });
  }
  const fps =
    payload.fps === undefined
      ? ANIMATION_DEFAULTS.fps
      : assertFiniteNumber(payload.fps, "fps", { min: 1, max: 120 });
  const duration =
    payload.durationMs === undefined
      ? durationMsFromFrameCount(ANIMATION_DEFAULTS.frameCount, fps)
      : assertFiniteNumber(payload.durationMs, "durationMs", { min: 0 });
  const name =
    payload.name === undefined
      ? `Animation ${project.animations.length + 1}`
      : assertString(payload.name, "name");
  project.animations.push({
    id: animationId,
    name,
    duration,
    fps: Math.round(fps),
    tracks: [],
    markers: [],
    audioTracks: [],
  });
  return { changed: true, affectedIds: [animationId] };
}

export function renameAnimationClip(
  project: ProjectDocument,
  { animationId, name }: { animationId: string; name: string },
): AnimationCommandResult {
  const animation = getAnimation(
    project,
    toAnimationId(assertString(animationId, "animationId")),
  );
  if (!animation) return { changed: false, affectedIds: [] };
  const nextName = assertString(name, "name");
  if (animation.name === nextName) return { changed: false, affectedIds: [] };
  animation.name = nextName;
  return { changed: true, affectedIds: [animation.id] };
}

export function deleteAnimationClip(
  project: ProjectDocument,
  { animationId }: { animationId: string },
): AnimationCommandResult {
  const id = toAnimationId(assertString(animationId, "animationId"));
  const index = project.animations.findIndex(
    (animation) => animation.id === id,
  );
  if (index < 0) return { changed: false, affectedIds: [] };
  project.animations.splice(index, 1);
  return { changed: true, affectedIds: [id] };
}

export function updateAnimationTiming(
  project: ProjectDocument,
  { animationId, durationMs, fps }: UpdateAnimationTimingPayload,
): AnimationCommandResult {
  const id = toAnimationId(assertString(animationId, "animationId"));
  const animation = getAnimation(project, id);
  if (!animation) return { changed: false, affectedIds: [] };
  const nextDuration =
    durationMs === undefined
      ? animation.duration
      : assertFiniteNumber(durationMs, "durationMs", { min: 0 });
  const nextFps =
    fps === undefined
      ? animation.fps
      : Math.round(assertFiniteNumber(fps, "fps", { min: 1, max: 120 }));
  if (animation.duration === nextDuration && animation.fps === nextFps) {
    return { changed: false, affectedIds: [] };
  }
  if (nextDuration < animation.duration && animation.boomerangTargets) {
    for (const [targetId, meta] of Object.entries(animation.boomerangTargets)) {
      if (nextDuration <= meta.sourceEndMs) {
        throw createCommandError(
          "Cannot shorten duration below BOOMERANG cutoff for target",
          {
            targetId,
            sourceEndMs: meta.sourceEndMs,
            newDuration: nextDuration,
            reasonCode: "boomerang_generated_range",
          },
        );
      }
    }
  }
  animation.duration = nextDuration;
  animation.fps = nextFps;
  return { changed: true, affectedIds: [id] };
}
