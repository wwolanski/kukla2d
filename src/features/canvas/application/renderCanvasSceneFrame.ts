import type { ProjectDocument } from "@kukla2d/contracts";

import type { AnimationStore } from "@/store/animationStoreTypes.types.js";

import { hasActiveTimeModifiers } from "@/domain/autoMotion/modifierEvaluation.js";

import { getPreviewModifierDraft } from "@/features/auto-motion";
import { buildCanvasFrame } from "@/features/canvas/domain/canvasFrame.js";

import { composeCanvasFrameState } from "./composeCanvasFrameState.js";
import { withTransientPose } from "./poseHelpers.js";
import { renderCanvasOverlays } from "./renderCanvasOverlays.js";
import { syncEffectiveMeshFrames } from "./syncEffectiveMeshFrames.js";

import type {
  CanvasEditorSnapshot,
  CanvasSceneGateway,
  MutableRef,
} from "./canvasApplication.types.js";
import type { PhysicsRuntime } from "./evaluateEditorFramePose.types.js";

interface CanvasSceneFrameInput {
  gateway: CanvasSceneGateway;
  project: ProjectDocument;
  editor: CanvasEditorSnapshot;
  animationState: AnimationStore;
  canvas: HTMLCanvasElement;
  isDark: boolean;
  physicsRuntime: PhysicsRuntime | null;
  meshOverriddenPartsRef: MutableRef<Set<string>>;
  timestamp: number;
}

export function renderCanvasSceneFrame({
  gateway,
  project,
  editor,
  animationState,
  canvas,
  isDark,
  physicsRuntime,
  meshOverriddenPartsRef,
  timestamp,
}: CanvasSceneFrameInput): boolean {
  const transientPose = gateway.interactionSystem?.readPreviewPoseOverrides?.();
  const frameAnimationState = withTransientPose(animationState, transientPose);
  const framePose = composeCanvasFrameState({
    project,
    editorState: editor,
    animationState: frameAnimationState,
    physicsRuntime: physicsRuntime?.evaluate ? physicsRuntime : null,
    timestamp,
    previewModifierDraft: getPreviewModifierDraft(),
  });
  const {
    poseOverrides,
    effectiveNodes,
    effectiveBones,
    physicsActive = false,
  } = framePose;
  meshOverriddenPartsRef.current = syncEffectiveMeshFrames({
    gateway,
    project,
    effectiveMeshes: framePose.effectiveMeshes,
    previousIds: meshOverriddenPartsRef.current,
  });
  gateway.drawFrame(
    buildCanvasFrame({
      project,
      editor,
      isDark,
      poseOverrides,
      effectiveNodes,
      canvasSize: { width: canvas.width, height: canvas.height },
      options: {},
    }),
    { skipRender: true },
  );
  const isPickInteraction =
    editor.interaction?.kind === "pendingPickIKBone" ||
    editor.interaction?.kind === "pendingPickAutoMotionPart";
  if (gateway.contentLayer)
    gateway.contentLayer.alpha = isPickInteraction ? 0.3 : 1;
  gateway.interactionSystem?.updateFramePose({
    poseOverrides,
    effectiveNodes,
    effectiveBones,
  });
  renderCanvasOverlays({
    gateway,
    project,
    editor,
    animationState: frameAnimationState,
    framePose,
    isPickInteraction,
  });
  gateway.render();
  return (
    physicsActive ||
    hasActiveTimeModifiers({
      project,
      activeAnimationId: animationState.activeAnimationId ?? null,
    }) ||
    Boolean(getPreviewModifierDraft())
  );
}
