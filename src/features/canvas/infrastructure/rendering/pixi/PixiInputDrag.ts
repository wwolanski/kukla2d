import { handleExportAreaDragMove } from "./PixiExportAreaGestures.js";
import { handleTransformDrag } from "./PixiInputTransformDrag.js";
import { readClientCoordinates } from "./PixiPointerBounds.js";
import { handlePoseHandleDrag } from "./PixiPoseGestures.js";
import {
  clearSetupPoseTargets,
  previewPosePartial,
} from "./PixiPosePreview.js";

import type { PointerInput } from "./pixiInteractionContracts.types.js";
import type { DragState } from "./pixiInteractionDragContracts.types.js";
import type { PixiInteractionSystem } from "./PixiInteractionSystem.js";
import type { CanvasDraftPoseValue } from "../../../application/canvasRenderer.types.js";

function previewDraft(
  adapter: PixiInteractionSystem,
  targetId: string,
  partial: CanvasDraftPoseValue,
): void {
  previewPosePartial(adapter, targetId, partial);
}
export function handleDragMove(
  adapter: PixiInteractionSystem,
  e: PointerInput,
): void {
  const drag = adapter._dragState;
  if (!drag) return;
  adapter._sendWorkflow({
    type: "MOVE_GESTURE",
    payload: { mode: drag.type, clientX: e.clientX, clientY: e.clientY },
  });

  if (handleExportAreaDragMove(adapter, e, drag)) return;

  if (handleTransformDrag(adapter, e, drag)) return;

  if (handlePoseHandleDrag(adapter, e, drag)) return;

  if (drag.type === "ikMove") {
    const worldPos = getEventWorldPosition(adapter, e);
    if (!worldPos) return;
    const target = {
      targetX: drag.startX + worldPos.x - drag.startWorldX,
      targetY: drag.startY + worldPos.y - drag.startWorldY,
    };
    const minDrag =
      3 / Math.max(adapter.editorRef.current?.view?.zoom ?? 1, 0.001);
    if (
      Math.hypot(target.targetX - drag.startX, target.targetY - drag.startY) <
      minDrag
    )
      return;
    if (drag.useDraftPose) {
      previewDraft(adapter, drag.constraintId, target);
    } else {
      if (!drag.setupPoseCleared) {
        clearSetupPoseTargets(
          adapter,
          [drag.constraintId],
          drag.setupEffectiveValues,
        );
        drag.setupPoseCleared = true;
      }
      adapter._executeCommand({
        type: "updateProject",
        payload: {
          mutator: (project) => {
            const constraint = project.constraints?.find(
              (item) => item.id === drag.constraintId,
            );
            if (constraint) Object.assign(constraint, target);
          },
        },
      });
    }
    adapter.markDirty();
    return;
  }

  if (drag.type === "warp") {
    const worldPos = getEventWorldPosition(adapter, e);
    if (!worldPos) return;

    const startPt = drag.startPts[drag.ptIndex];
    if (!startPt) return;
    const newPts = drag.startPts.map((p, i) =>
      i === drag.ptIndex
        ? { x: p.x + worldPos.x - startPt.x, y: p.y + worldPos.y - startPt.y }
        : { x: p.x, y: p.y },
    );
    previewDraft(adapter, drag.wdNodeId, { mesh_verts: newPts });
    adapter.markDirty();
    return;
  }

  if (drag.type === "skeletonJoint") {
    const worldPos = getEventWorldPosition(adapter, e);
    if (!worldPos) return;
    const minDrag =
      3 / Math.max(adapter.editorRef.current?.view?.zoom ?? 1, 0.001);
    if (
      Math.hypot(worldPos.x - drag.startPivotX, worldPos.y - drag.startPivotY) <
      minDrag
    )
      return;

    if (drag.useDraftPose) {
      previewPosePartial(adapter, drag.boneId, {
        x: worldPos.x,
        y: worldPos.y,
      });
    } else {
      if (!drag.setupPoseCleared) {
        clearSetupPoseTargets(
          adapter,
          [drag.boneId],
          drag.setupEffectiveValues,
        );
        drag.setupPoseCleared = true;
      }
      adapter._executeCommand({
        type: "updateProject",
        payload: {
          mutator: (project) => {
            const bone = project.bones?.find((b) => b.id === drag.boneId);
            if (!bone?.setup) return;
            bone.setup.x = worldPos.x;
            bone.setup.y = worldPos.y;
          },
        },
      });
    }
    adapter.markDirty();
    return;
  }
}

export function queueDragMove(
  adapter: PixiInteractionSystem,
  e: PointerInput,
): void {
  if (!adapter._dragState) return;
  adapter._pendingDragEvent = snapshotPointerEvent(adapter, e);
  if (adapter._dragMoveRaf !== null) return;
  adapter._dragMoveRaf = requestAnimationFrame(() => {
    adapter._dragMoveRaf = null;
    const pending = adapter._pendingDragEvent;
    adapter._pendingDragEvent = null;
    if (pending) handleDragMove(adapter, pending);
  });
}

export function handleDragEnd(adapter: PixiInteractionSystem): void {
  if (adapter._dragMoveRaf !== null) {
    cancelAnimationFrame(adapter._dragMoveRaf);
    adapter._dragMoveRaf = null;
  }
  if (adapter._pendingDragEvent) {
    const pending = adapter._pendingDragEvent;
    adapter._pendingDragEvent = null;
    handleDragMove(adapter, pending);
  }
  const drag = adapter._dragState;
  if (drag) {
    commitTransformPreview(adapter, drag);
    const isAnimationGesture = "isAnimMode" in drag && drag.isAnimMode;
    if (
      isAnimationGesture &&
      adapter.animationAuthoringAdapter?.commitGesture &&
      adapter.editorRef.current?.autoKeyframe !== false
    ) {
      adapter.animationAuthoringAdapter.commitGesture({ source: "auto-key" });
    } else if (isAnimationGesture) {
      adapter.animationAuthoringAdapter?.endGesture?.();
    }
    adapter._dragState = null;
    adapter._clearGestureSnapshot();
    adapter._clearPreviewPose();
    adapter._resumeViewportDrag();
    adapter.markDirty();
    adapter._endCommandBatch();
    adapter._sendWorkflow({ type: "COMMIT_GESTURE" });
  }
}

export function getEventClientPosition(
  adapter: PixiInteractionSystem,
  e: PointerInput,
): { x: number; y: number } {
  const direct =
    readClientCoordinates(e?.nativeEvent) ??
    readClientCoordinates(e?.originalEvent) ??
    readClientCoordinates(e);
  if (direct) {
    return { x: direct.clientX, y: direct.clientY };
  }
  const canvas = adapter.viewportBridge?.app?.canvas;
  const global = e?.global;
  if (canvas && global) {
    const rect = canvas.getBoundingClientRect();
    return { x: rect.left + global.x, y: rect.top + global.y };
  }
  return { x: 0, y: 0 };
}
export function getEventWorldPosition(
  adapter: PixiInteractionSystem,
  e: PointerInput,
): { x: number; y: number } | null {
  if (typeof adapter._eventWorldPosition === "function") {
    const resolved = adapter._eventWorldPosition(e);
    if (resolved) return resolved;
  }
  const canvas = adapter.viewportBridge?.app?.canvas;
  if (!canvas) return null;
  const rect = canvas.getBoundingClientRect();
  const pos = getEventClientPosition(adapter, e);
  if (typeof adapter.viewportBridge?.toWorld === "function") {
    return adapter.viewportBridge.toWorld(pos.x - rect.left, pos.y - rect.top);
  }
  const view = adapter.editorRef.current?.view;
  const zoom = Math.max(view?.zoom || 1, 0.001);
  return {
    x: (pos.x - rect.left - (view?.panX ?? 0)) / zoom,
    y: (pos.y - rect.top - (view?.panY ?? 0)) / zoom,
  };
}
function snapshotPointerEvent(
  adapter: PixiInteractionSystem,
  e: PointerInput,
): PointerInput {
  const position = getEventClientPosition(adapter, e);
  return { clientX: position.x, clientY: position.y, shiftKey: !!e.shiftKey };
}
function commitTransformPreview(
  adapter: PixiInteractionSystem,
  drag: DragState,
): void {
  if (
    !("nodeId" in drag) ||
    ("isAnimMode" in drag && drag.isAnimMode) ||
    !drag.lastPatch
  )
    return;
  const patch = drag.lastPatch;
  adapter._executeCommand({
    type: "updateProject",
    payload: {
      mutator: (project, versionControl) => {
        const node = project.nodes.find((n) => n.id === drag.nodeId);
        if (!node) return;
        Object.assign(node.transform, patch);
        if (versionControl) versionControl.transformVersion++;
      },
    },
  });
}
