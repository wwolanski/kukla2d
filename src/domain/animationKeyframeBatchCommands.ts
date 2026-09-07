import {
  toAnimationId,
  type Keyframe,
  type ProjectDocument,
  type Track,
} from "@kukla2d/contracts";

import { isFiniteNumber } from "@/lib/math";

import { checkBoomerangTimeBlocked } from "./animationBoomerang.js";
import {
  assertString,
  createCommandError,
  getAnimation,
  sortTrackKeyframes,
  trackKey,
} from "./animationDocumentCommandSupport.js";
import {
  easingEquals,
  isSupportedTrackProperty,
  isValidEasing,
  validateTrackValue,
} from "./animationProperties.js";
import { normalizeKeyframeAuthoring } from "./keyframeProvenance.js";

import type {
  AnimationCommandResult,
  AnimationKeyframeInput,
  EditAnimationKeyframesPayload,
} from "./animationCommandTypes.types.js";

type AnimationEditBatchValidation =
  | { valid: true }
  | { valid: false; error: string; details: Record<string, unknown> };

interface EditAnimationKeyframeInput extends AnimationKeyframeInput {
  originalTimeMs?: number;
}

type AnimationEditValidationInput = AnimationKeyframeInput & {
  animationId: string;
};

export function validateAnimationEditBatch(
  project: ProjectDocument,
  edits: readonly AnimationEditValidationInput[] | null | undefined,
): AnimationEditBatchValidation {
  if (!edits || edits.length === 0) return { valid: true };
  for (let i = 0; i < edits.length; i++) {
    const edit = edits[i]!;
    const animationId = edit.animationId;
    if (typeof animationId !== "string" || animationId.length === 0) {
      return {
        valid: false,
        error: "Invalid animationId",
        details: { index: i },
      };
    }
    const animation = getAnimation(project, toAnimationId(animationId));
    if (!animation) {
      return {
        valid: false,
        error: `Animation clip "${animationId}" not found`,
        details: { index: i },
      };
    }
    const targetId = edit.targetId;
    if (typeof targetId !== "string" || targetId.length === 0) {
      return { valid: false, error: "Invalid targetId", details: { index: i } };
    }
    const blocked = checkBoomerangTimeBlocked(animation, targetId, edit.timeMs);
    if (blocked.blocked) {
      return {
        valid: false,
        error: "Keyframe time is in locked BOOMERANG generated range",
        details: {
          index: i,
          targetId,
          timeMs: edit.timeMs,
          reasonCode: blocked.reasonCode,
        },
      };
    }
    const property = edit.property;
    if (typeof property !== "string" || property.length === 0) {
      return { valid: false, error: "Invalid property", details: { index: i } };
    }
    if (!isSupportedTrackProperty(property)) {
      return {
        valid: false,
        error: `Unknown animation property "${property}"`,
        details: { index: i },
      };
    }
    const timeMs = edit.timeMs;
    if (!isFiniteNumber(timeMs) || timeMs < 0) {
      return {
        valid: false,
        error: "Invalid timeMs",
        details: { index: i, timeMs },
      };
    }
    if (timeMs > animation.duration) {
      return {
        valid: false,
        error: "Keyframe time exceeds animation duration",
        details: { index: i, timeMs, duration: animation.duration },
      };
    }
    if (!validateTrackValue(property, edit.value)) {
      return {
        valid: false,
        error: `Invalid value for "${property}" track`,
        details: { index: i },
      };
    }
    const easing = edit.easing ?? "ease-both";
    if (!isValidEasing(easing)) {
      return {
        valid: false,
        error: "Invalid easing",
        details: { index: i, easing },
      };
    }
    if (
      edit.authoring !== undefined &&
      !normalizeKeyframeAuthoring(edit.authoring)
    ) {
      return {
        valid: false,
        error: "Invalid keyframe authoring",
        details: { index: i },
      };
    }
  }
  return { valid: true };
}

export function editKeyframeBatch(
  project: ProjectDocument,
  { animationId, edits = [] }: EditAnimationKeyframesPayload,
): AnimationCommandResult {
  const id = toAnimationId(assertString(animationId, "animationId"));
  const animation = getAnimation(project, id);
  if (!animation) return { changed: false, affectedIds: [] };
  if (!Array.isArray(edits) || edits.length === 0)
    return { changed: false, affectedIds: [] };
  const validation = validateAnimationEditBatch(
    project,
    edits.map((edit) => ({ ...edit, animationId: id })),
  );
  if (!validation.valid)
    throw createCommandError(validation.error, validation.details);
  const addressSet = new Set<string>();
  for (const edit of edits) {
    const address = `${edit.targetId}::${edit.property}::${edit.timeMs}`;
    if (addressSet.has(address)) {
      throw createCommandError("Keyframe batch contains duplicate address", {
        targetId: edit.targetId,
        property: edit.property,
        timeMs: edit.timeMs,
      });
    }
    addressSet.add(address);
  }
  const sources: {
    edit: EditAnimationKeyframeInput;
    track: Track;
    keyframe: Keyframe;
  }[] = edits.map((edit) => {
    const track = animation.tracks.find(
      (candidate) =>
        candidate.targetId === edit.targetId &&
        candidate.property === edit.property,
    );
    const originalTimeMs = edit.originalTimeMs ?? edit.timeMs;
    const keyframe = track?.keyframes.find(
      (candidate) => candidate.time === originalTimeMs,
    );
    if (!track || !keyframe) {
      throw createCommandError("Keyframe edit source not found", {
        targetId: edit.targetId,
        property: edit.property,
        timeMs: originalTimeMs,
      });
    }
    const collision = track.keyframes.find(
      (candidate) => candidate.time === edit.timeMs && candidate !== keyframe,
    );
    if (collision) {
      throw createCommandError(
        "Keyframe edit would collide with an existing keyframe",
        {
          targetId: edit.targetId,
          property: edit.property,
          timeMs: edit.timeMs,
        },
      );
    }
    return { edit, track, keyframe };
  });
  const affectedIds = new Set<string>([id]);
  for (const { edit, track, keyframe } of sources) {
    const easing = edit.easing ?? "ease-both";
    if (
      keyframe.time === edit.timeMs &&
      keyframe.value === edit.value &&
      easingEquals(keyframe.easing, easing)
    )
      continue;
    keyframe.time = edit.timeMs;
    keyframe.value = edit.value;
    keyframe.easing = easing;
    sortTrackKeyframes(track);
    affectedIds.add(trackKey(track));
    affectedIds.add(`${edit.targetId}::${edit.property}@${edit.timeMs}`);
  }
  return { changed: affectedIds.size > 1, affectedIds: [...affectedIds] };
}
