import type { AnimationTargetId } from "@kukla2d/contracts";

import { useAnimationStore } from "@/store/animationStore";
import { useEditorStore } from "@/store/editorStore";

import { createAnimationAuthoringApi } from "./createAnimationAuthoringApi.js";

import type {
  AnimationAuthoringApi,
  AnimationCommitResult,
} from "./createAnimationAuthoringApi.types.js";

const api = createAnimationAuthoringApi();

export function inspectorPreview(
  targetId: AnimationTargetId,
  property: string,
  value: unknown,
): ReturnType<AnimationAuthoringApi["preview"]> | null {
  const { editorMode } = useEditorStore.getState();
  if (editorMode !== "animation") return null;
  const { activeAnimationId, currentTime } = useAnimationStore.getState();
  if (!activeAnimationId) return null;
  return api.preview({
    animationId: activeAnimationId,
    targetId,
    property,
    value,
    timeMs: currentTime,
    source: "inspector",
    phase: "preview",
  });
}

/**
 * Preview a non-animation pose layer through the same feature boundary used
 * by animation authoring. Inspector components never mutate draft state.
 */
export function inspectorPosePreview(
  targetId: AnimationTargetId,
  property: string,
  value: unknown,
): ReturnType<AnimationAuthoringApi["preview"]> | null {
  if (useEditorStore.getState().editorMode === "animation") {
    return inspectorPreview(targetId, property, value);
  }
  useAnimationStore.getState().setDraftPose(targetId, { [property]: value });
  return { valid: true };
}

export function inspectorClearPoseTarget(targetId: AnimationTargetId): void {
  useAnimationStore.getState().clearDraftPoseForNode(targetId);
  useAnimationStore.getState().clearDraftAuthoringForNode(targetId);
}

export function inspectorCommit(
  source = "gesture",
): AnimationCommitResult | null {
  const { editorMode, autoKeyframe } = useEditorStore.getState();
  if (editorMode !== "animation") return null;
  if (!autoKeyframe) {
    return { changed: false, affectedIds: [], committedAddresses: [] };
  }
  return api.commit({ source });
}

export function isAnimationMode(): boolean {
  return useEditorStore.getState().editorMode === "animation";
}
