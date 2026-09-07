import { useCallback, useMemo, useState } from "react";

import { useAnimationStore } from "@/store/animationStore";
import { useEditorStore } from "@/store/editorStore";
import { useProjectStore } from "@/store/projectStore";

import { requestEditorMode } from "@/domain/editorModeTransition.js";

import {
  createAnimationAuthoringApi,
  type AnimationAuthoringApi,
} from "@/features/animation";

interface ModeTransitionState {
  nextMode: "staging" | "animation";
  reason?: string;
  error?: string;
}

interface EditorModeController {
  requestMode: (nextMode: "staging" | "animation") => void;
  transitionState: ModeTransitionState | null;
  confirmCommit: () => void;
  confirmDiscard: () => void;
  confirmCancel: () => void;
}

let animationAuthoringApi: AnimationAuthoringApi | null = null;

function getAnimationAuthoringApi(): AnimationAuthoringApi {
  animationAuthoringApi ??= createAnimationAuthoringApi();
  return animationAuthoringApi;
}

export function useEditorModeController(): EditorModeController {
  const mode = useEditorStore((s) => s.editorMode);
  const setEditorMode = useEditorStore((s) => s.setEditorMode);
  const draftDirty = useAnimationStore((s) => s.draftDirty);
  const draftPoseSize = useAnimationStore((s) => s.draftPose.size);
  const activeAnimationId = useAnimationStore((s) => s.activeAnimationId);
  const captureRestPose = useAnimationStore((s) => s.captureRestPose);
  const nodes = useProjectStore((s) => s.project.nodes);
  const animations = useProjectStore((s) => s.project.animations);
  const pause = useAnimationStore((s) => s.pause);

  const [transitionState, setTransitionState] =
    useState<ModeTransitionState | null>(null);

  const hasActiveClip = useMemo(() => {
    if (!activeAnimationId) return false;
    return animations.some((a) => a.id === activeAnimationId);
  }, [activeAnimationId, animations]);

  const completeExitToStaging = useCallback(() => {
    pause();
    setEditorMode("staging");
    setTransitionState(null);
  }, [pause, setEditorMode]);

  const showTransitionError = useCallback((error: unknown) => {
    const message =
      typeof error === "string"
        ? error
        : error instanceof Error
          ? error.message
          : "Unable to update animation changes.";
    setTransitionState((state) =>
      state ? { ...state, error: message } : state,
    );
  }, []);

  const requestMode = useCallback(
    (nextMode: "staging" | "animation") => {
      const draftState = { dirty: draftDirty, values: { size: draftPoseSize } };
      const { result, reason } = requestEditorMode({
        currentMode: mode,
        nextMode,
        draftState,
        hasActiveClip,
      });

      if (result === "unchanged") return;

      if (result === "blocked-draft") {
        setTransitionState({
          nextMode,
          ...(reason !== undefined ? { reason } : {}),
        });
        return;
      }

      if (nextMode === "animation") {
        setEditorMode("animation");
        captureRestPose(nodes);
        return;
      }

      if (nextMode === "staging") {
        completeExitToStaging();
      }
    },
    [
      mode,
      draftDirty,
      draftPoseSize,
      hasActiveClip,
      setEditorMode,
      captureRestPose,
      nodes,
      completeExitToStaging,
    ],
  );

  const confirmCommit = useCallback(() => {
    try {
      const result = getAnimationAuthoringApi().commit({
        source: "mode-transition",
      });
      if (result.changed) {
        completeExitToStaging();
        return;
      }
      const animationStore = useAnimationStore.getState();
      if (!animationStore.draftDirty && animationStore.draftPose.size === 0) {
        completeExitToStaging();
        return;
      }
      showTransitionError(
        result.error ?? "Unable to commit animation changes.",
      );
    } catch (error) {
      showTransitionError(error);
    }
  }, [completeExitToStaging, showTransitionError]);

  const confirmDiscard = useCallback(() => {
    try {
      getAnimationAuthoringApi().discard();
      completeExitToStaging();
    } catch (error) {
      showTransitionError(error);
    }
  }, [completeExitToStaging, showTransitionError]);

  const confirmCancel = useCallback(() => {
    setTransitionState(null);
  }, []);

  return {
    requestMode,
    transitionState,
    confirmCommit,
    confirmDiscard,
    confirmCancel,
  };
}
