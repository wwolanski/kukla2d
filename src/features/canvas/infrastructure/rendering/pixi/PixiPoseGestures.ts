import {
  buildRotatedBoneBranch,
  updatePoseHandleDrag,
} from "@/features/canvas/domain/poseHandle.js";

import { getEffectiveBones, getEffectiveNodes } from "./PixiInputState.js";
import {
  canStartAnimationGesture,
  previewPosePartial,
  usesPoseDraft,
} from "./PixiPosePreview.js";

import type { PointerInput } from "./pixiInteractionContracts.types.js";
import type { DragState } from "./pixiInteractionDragContracts.types.js";
import type { PixiInteractionSystem } from "./PixiInteractionSystem.js";
import type { PoseHandleFrame } from "./PixiPoseGestures.types.js";

export function startPoseHandleDrag(
  adapter: PixiInteractionSystem,
  event: PointerInput,
  frame: PoseHandleFrame,
): void {
  if (!frame?.boneId) return;
  if (!canStartAnimationGesture(adapter)) return;
  const world = adapter._eventWorldPosition(event);
  if (!world) return;
  const editor = adapter.editorRef.current;
  const project = adapter.projectRef.current;
  const effectiveNodes = getEffectiveNodes({
    project,
    editor,
    animation: adapter.animationRef.current,
  });
  const effectiveBones = getEffectiveBones({
    project,
    effectiveNodes,
    editor,
    animation: adapter.animationRef.current,
  });
  const bone = effectiveBones.find(
    (candidate) => candidate.id === frame.boneId,
  );
  if (!bone) return;
  adapter._sendWorkflow({
    type: "SELECT_RIG_HIT",
    elementIds: [],
    boneIds: [bone.id],
    constraintIds: [],
    activeBoneId: bone.id,
    activeConstraintId: null,
    anchor: bone.id,
  });
  adapter.editorRef.current = {
    ...editor,
    selection: [bone.id],
    activeBoneId: bone.id,
    activeConstraintId: null,
    rigSelectionAnchor: bone.id,
  };
  const useDraftPose = usesPoseDraft(editor);
  if (!useDraftPose)
    adapter._beginCommandBatch({ name: "Pose bone", type: "pose" });
  const isAnimMode = editor.editorMode === "animation";
  const gestureId =
    isAnimMode && useDraftPose
      ? adapter.animationAuthoringAdapter?.beginGesture()
      : null;
  adapter._setDragState({
    type: "poseHandle",
    boneId: bone.id,
    pivot: frame.pivot,
    startRotation: bone.setup?.rotation ?? frame.rotation ?? 0,
    startPointerAngle: Math.atan2(
      world.y - frame.pivot.y,
      world.x - frame.pivot.x,
    ),
    minRadius: frame.minRadius,
    maxRadius: frame.maxRadius,
    startBones: effectiveBones.map((candidate) => ({
      ...candidate,
      setup: { ...(candidate.setup ?? {}) },
    })),
    isAnimMode,
    useDraftPose,
    gestureId,
  });
  adapter._sendWorkflow({
    type: "START_TRANSFORM_DRAG",
    payload: { mode: "poseHandle", boneId: frame.boneId },
  });
}

export function handlePoseHandleDrag(
  adapter: PixiInteractionSystem,
  event: PointerInput,
  drag: DragState,
): boolean {
  if (drag.type !== "poseHandle") return false;
  const world = adapter._eventWorldPosition(event);
  if (!world) return true;
  const next = updatePoseHandleDrag({
    pivot: drag.pivot,
    pointer: world,
    startRotation: drag.startRotation,
    startPointerAngle: drag.startPointerAngle,
    minRadius: drag.minRadius,
    maxRadius: drag.maxRadius,
    snap: !!event.shiftKey,
  });
  adapter._poseHandleExtensions.set(drag.boneId, next.radius);
  const branch = buildRotatedBoneBranch(
    drag.startBones,
    drag.boneId,
    next.rotation - drag.startRotation,
  );
  if (drag.useDraftPose) {
    const gestureId = drag.gestureId;
    for (const [boneId, partial] of branch) {
      const isRoot = boneId === drag.boneId;
      const meta = gestureId
        ? {
            gestureId,
            role: isRoot ? "authored" : "derived",
            source: "pose.rotate",
          }
        : undefined;
      previewPosePartial(adapter, boneId, partial, meta);
    }
  } else {
    adapter._executeCommand({
      type: "updateProject",
      payload: {
        mutator: (project) => {
          for (const [boneId, partial] of branch) {
            const bone = project.bones?.find(
              (candidate) => candidate.id === boneId,
            );
            if (bone) Object.assign(bone.setup, partial);
          }
        },
      },
    });
  }
  adapter.markDirty();
  return true;
}
