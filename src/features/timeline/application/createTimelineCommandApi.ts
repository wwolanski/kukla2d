import {
  toAnimationId,
  type Animation,
  type AnimationId,
} from "@kukla2d/contracts";

import { loadAnimationSettings } from "@/platform/animationSettingsRepository.js";

import { useAnimationStore } from "@/store/animationStore";
import { useProjectStore } from "@/store/projectStore";
import { beginBatch, endBatch } from "@/store/undoHistory";

import { canNavigate } from "@/domain/animationAuthoring.js";
import type {
  CreateAnimationClipPayload,
  UpdateAnimationTimingPayload,
} from "@/domain/animationCommandTypes.types.js";
import { durationMsFromFrameCount } from "@/domain/animationDefaults.js";

import type { TimelineCommandApi } from "./createTimelineCommandApi.types.js";

interface TimelineCreateAnimationPayload extends CreateAnimationClipPayload {
  frameCount?: number;
}

function getAnimationById(animationId: AnimationId): Animation | null {
  return (
    useProjectStore
      .getState()
      .project.animations.find((animation) => animation.id === animationId) ??
    null
  );
}

function syncRuntimeToAnimation(
  animation: Animation | null,
): AnimationId | null {
  if (!animation) return null;
  const animationState = useAnimationStore.getState();
  animationState.switchAnimation(animation);
  return animation.id;
}

function syncRuntimeTiming(animation: Animation | null): void {
  if (!animation) return;
  const animationState = useAnimationStore.getState();
  animationState.synchronizeSession(animation);
}

function selectAnimation(animationId: AnimationId): AnimationId | null {
  const animation = getAnimationById(animationId);
  if (!animation) {
    useAnimationStore.getState().resetPlayback();
    return null;
  }
  return syncRuntimeToAnimation(animation);
}

function checkNavigationGuard(): ReturnType<typeof canNavigate> {
  const animationState = useAnimationStore.getState();
  return canNavigate({
    dirty: animationState.draftDirty,
    values: animationState.draftPose,
  });
}

export function createTimelineCommandApi(): TimelineCommandApi {
  return {
    selectAnimationClip(animationId) {
      const nav = checkNavigationGuard();
      if (!nav.allowed) return null;
      const wasPlaying = useAnimationStore.getState().isPlaying;
      const selectedId = selectAnimation(animationId);
      if (selectedId && wasPlaying) {
        useAnimationStore.getState().play();
      }
      return selectedId;
    },

    ensureAnimationClip() {
      const project = useProjectStore.getState().project;
      const animationState = useAnimationStore.getState();
      const activeAnimation =
        project.animations.find(
          (animation) => animation.id === animationState.activeAnimationId,
        ) ?? null;
      if (activeAnimation) return activeAnimation.id;

      const firstAnimation = project.animations[0] ?? null;
      if (firstAnimation) {
        return selectAnimation(firstAnimation.id);
      }

      const settings = loadAnimationSettings();
      const resolvedFps = settings.fps;
      const resolvedDuration = payloadDuration(
        resolvedFps,
        settings.frameCount,
      );
      const result = useProjectStore.getState().createAnimationClip({
        fps: resolvedFps,
        durationMs: resolvedDuration,
      });
      const createdId = result.affectedIds[0]
        ? toAnimationId(result.affectedIds[0])
        : null;
      if (createdId) {
        selectAnimation(createdId);
      }
      return createdId;
    },

    createAnimationClip(payload: TimelineCreateAnimationPayload = {}) {
      const settings = loadAnimationSettings();
      const merged: CreateAnimationClipPayload = {};

      if (payload.fps !== undefined) {
        merged.fps = payload.fps;
      } else {
        merged.fps = settings.fps;
      }

      if (payload.durationMs !== undefined) {
        merged.durationMs = payload.durationMs;
      } else {
        merged.durationMs = durationMsFromFrameCount(
          payload.frameCount ?? settings.frameCount,
          merged.fps,
        );
      }

      if (payload.name !== undefined) merged.name = payload.name;
      if (payload.animationId !== undefined)
        merged.animationId = payload.animationId;
      if (payload.id !== undefined) merged.id = payload.id;

      const result = useProjectStore.getState().createAnimationClip(merged);
      const createdId = result.affectedIds[0]
        ? toAnimationId(result.affectedIds[0])
        : null;
      if (createdId) {
        selectAnimation(createdId);
      }
      return result;
    },

    renameAnimationClip(animationId, name) {
      return useProjectStore.getState().renameAnimationClip(animationId, name);
    },

    deleteAnimationClip(animationId) {
      const activeAnimationId = useAnimationStore.getState().activeAnimationId;
      if (activeAnimationId === animationId) {
        const nav = checkNavigationGuard();
        if (!nav.allowed) return { changed: false, affectedIds: [] };
      }
      const result = useProjectStore
        .getState()
        .deleteAnimationClip(animationId);
      if (!result.changed) return result;

      if (activeAnimationId === animationId) {
        const remaining =
          useProjectStore.getState().project.animations[0] ?? null;
        if (remaining) {
          selectAnimation(remaining.id);
        } else {
          useAnimationStore.getState().resetPlayback();
        }
      }

      return result;
    },

    updateAnimationTiming(payload: UpdateAnimationTimingPayload) {
      const result = useProjectStore.getState().updateAnimationTiming(payload);
      if (!result.changed) return result;

      const animation = getAnimationById(payload.animationId);
      if (
        animation &&
        useAnimationStore.getState().activeAnimationId === animation.id
      ) {
        syncRuntimeTiming(animation);
      }

      return result;
    },

    upsertAnimationKeyframe(payload) {
      return useProjectStore.getState().upsertAnimationKeyframe(payload);
    },

    upsertAnimationKeyframes(payload) {
      return useProjectStore.getState().upsertAnimationKeyframes(payload);
    },

    editAnimationKeyframes(payload) {
      return useProjectStore.getState().editAnimationKeyframes(payload);
    },

    moveAnimationKeyframes(payload) {
      return useProjectStore.getState().moveAnimationKeyframes(payload);
    },

    deleteAnimationKeyframes(payload) {
      return useProjectStore.getState().deleteAnimationKeyframes(payload);
    },

    setAnimationKeyframeEasing(payload) {
      return useProjectStore.getState().setAnimationKeyframeEasing(payload);
    },

    addAnimationMarker(payload) {
      return useProjectStore.getState().addAnimationMarker(payload);
    },

    addAnimationAudioTrack(payload) {
      return useProjectStore.getState().addAnimationAudioTrack(payload);
    },

    updateAnimationAudioTrack(payload) {
      return useProjectStore.getState().updateAnimationAudioTrack(payload);
    },

    removeAnimationAudioTrack(payload) {
      return useProjectStore.getState().removeAnimationAudioTrack(payload);
    },

    setAnimationTargetBoomerang(payload) {
      return useProjectStore.getState().setAnimationTargetBoomerang(payload);
    },

    beginAudioTrackGesture(name) {
      beginBatch(null, { name, type: "timeline" });
    },

    endAudioTrackGesture() {
      endBatch();
    },
  };
}

function payloadDuration(fps: number, frameCount: number): number {
  return durationMsFromFrameCount(frameCount, fps);
}
