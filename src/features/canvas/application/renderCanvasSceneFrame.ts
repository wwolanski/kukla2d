import type { ProjectDocument } from "@kukla2d/contracts";

import type { AnimationStore } from "@/store/animationStoreTypes.types.js";

import { hasActiveTimeModifiers } from "@/domain/autoMotion/modifierEvaluation.js";

import { getPreviewModifierDraft } from "@/features/auto-motion";
import type {
  CanvasEditorSnapshot,
  CanvasSceneGateway,
  MutableRef,
} from "@/features/canvas/application/canvasApplication.types.js";
import { composeCanvasFrameState } from "@/features/canvas/application/composeCanvasFrameState.js";
import type { PhysicsRuntime } from "@/features/canvas/application/evaluateEditorFramePose.types.js";
import { withTransientPose } from "@/features/canvas/application/poseHelpers.js";
import { renderCanvasOverlays } from "@/features/canvas/application/renderCanvasOverlays.js";
import { syncEffectiveMeshFrames } from "@/features/canvas/application/syncEffectiveMeshFrames.js";
import { buildCanvasFrame } from "@/features/canvas/domain/canvasFrame.js";

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
