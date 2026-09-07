import { computeWorldMatrices } from "@/domain/transforms";

import { routePointerDown } from "@/features/canvas/domain/inputRouter.js";
import {
  computeBoneSelectionFromClick,
  findAlphaHit,
  findBoneHit,
} from "@/features/canvas/domain/picking.js";

import {
  handleAutoMotionPartPickDown,
  handleAutoMotionPartPickMove,
} from "./PixiAutoMotionPickGestures.js";
import { commitDrawnBone } from "./PixiBoneAssignment.js";
import { updateCanvasHover } from "./PixiCanvasHover.js";
import { handleExportAreaPointerDown } from "./PixiExportAreaGestures.js";
import {
  handleIkPointerDown,
  handleIkPointerMove,
  handleIkTargetSelection,
} from "./PixiIkConstraintGestures.js";
import { getAdapterEffectiveRigState } from "./PixiInputState.js";
import {
  commitMarquee,
  shouldStartMarquee,
  startMarquee,
  updateMarquee,
} from "./PixiMarqueeGestures.js";
import { moveMeshGesture, startMeshGesture } from "./PixiMeshGestures.js";
import { commitWarpDrag, cleanupWarpDrag } from "./PixiWarpGestures.js";

import type { PointerInput } from "./pixiInteractionContracts.types.js";
import type { DragState } from "./pixiInteractionDragContracts.types.js";
import type { PixiInteractionSystem } from "./PixiInteractionSystem.js";

type CanvasPointerInput = PointerInput & { button: number };
type DrawBoneDrag = Extract<DragState, { type: "drawBone" }>;
export function handleCanvasPointerDown(
  adapter: PixiInteractionSystem,
  event: CanvasPointerInput,
): void {
  if (event.button !== 0) return;
  const world = adapter._eventWorldPosition(event);
  if (!world) return;
  const editorState = adapter.editorRef.current;
  const project = adapter.projectRef.current;
  if (handleExportAreaPointerDown(adapter, event, world)) return;
  const { nodes, bones } = getAdapterEffectiveRigState(adapter);
  const matrices = computeWorldMatrices(nodes);
  const alphaHit = findAlphaHit({
    parts: nodes.filter((node) => node.type === "part"),
    imageDataByPartId: adapter.imageDataByPartId,
    worldMatrices: matrices,
    worldX: world.x,
    worldY: world.y,
  });

  if (handleAutoMotionPartPickDown(adapter, event, world)) return;

  const canPickRig =
    ["select", "transform", "pose"].includes(editorState.activeTool ?? "") &&
    ["all", "rig"].includes(editorState.selectionTarget ?? "element");
  const boneHit = canPickRig
    ? findBoneHit({
        bones,
        worldX: world.x,
        worldY: world.y,
        zoom: editorState.view.zoom,
      })
    : null;

  if (handleIkPointerDown(adapter, world)) return;
  if (handleIkTargetSelection(adapter, event, world)) return;

  if (startMeshGesture(adapter, world, { alphaHit, boneHit })) {
    event.stopPropagation?.();
    return;
  }

  if (boneHit) {
    const selection = computeBoneSelectionFromClick({
      orderedBoneIds: (project.bones ?? []).map((bone) => bone.id),
      currentSelection: editorState.selection ?? [],
      anchorBoneId: editorState.rigSelectionAnchor,
      boneHit,
      shiftKey: !!event.shiftKey,
      ctrlOrMetaKey: !!(event.ctrlKey || event.metaKey),
    });
    adapter._sendWorkflow({
      type: "SELECT_RIG_HIT",
      elementIds:
        editorState.selectionTarget === "all" &&
        (event.ctrlKey || event.metaKey)
          ? (editorState.selection ?? []).filter((id) =>
              project.nodes.some((node) => node.id === id),
            )
          : [],
      boneIds: selection,
      constraintIds:
        editorState.selectionTarget === "all" &&
        (event.ctrlKey || event.metaKey)
          ? (editorState.selection ?? []).filter((id) =>
              (project.constraints ?? []).some(
                (constraint) => constraint.id === id,
              ),
            )
          : [],
      activeBoneId: boneHit,
      anchor: boneHit,
    });
    if (editorState.activeTool === "transform") {
      adapter._startBoneDrag(event, boneHit);
    }
    adapter.markDirty?.();
    return;
  }

  if (shouldStartMarquee(editorState, event, alphaHit)) {
    startMarquee(adapter, event, world);
    return;
  }

  if (
    editorState.activeTool === "select" &&
    editorState.selectionTarget === "rig" &&
    alphaHit
  )
    return;
  const action = routePointerDown({
    button: event.button,
    ctrlKey: !!event.ctrlKey,
    editorState,
    toolMode: editorState.toolMode ?? "",
    meshEditMode: !!editorState.meshEditMode,
    weightPaintMode: !!editorState.weightPaintMode,
    alphaHit,
  });
  if (
    action.type === "startDrawBone" &&
    editorState.riggingTool === "draw" &&
    !event.shiftKey &&
    !event.ctrlKey &&
    !event.metaKey
  ) {
    if (editorState.hoverHit != null) {
      adapter._executeCommand({ type: "setHover", payload: { hit: null } });
    }
    adapter._beginCommandBatch({ name: "Draw bone", type: "drawBone" });
    const drawBoneDrag: DrawBoneDrag = {
      type: "drawBone",
      startWorldX: world.x,
      startWorldY: world.y,
      endWorldX: world.x,
      endWorldY: world.y,
      parentId: editorState.drawBoneChainMode
        ? (project.bones.find((bone) => bone.id === editorState.activeBoneId)
            ?.id ?? null)
        : null,
    };
    adapter._setDragState(drawBoneDrag);
    setDrawPreview(adapter, drawBoneDrag);
    adapter._sendWorkflow({
      type: "START_DRAW_BONE",
      payload: { parentId: drawBoneDrag.parentId },
    });
  } else if (action.type === "selectPart") {
    if (
      editorState.selectionTarget === "all" &&
      (event.ctrlKey || event.metaKey)
    ) {
      const current = editorState.selection ?? [];
      const currentElementIds = current.filter((id) =>
        project.nodes.some((node) => node.id === id),
      );
      const elementIds = currentElementIds.includes(action.partId)
        ? currentElementIds.filter((id) => id !== action.partId)
        : [...currentElementIds, action.partId];
      const boneIds = current.filter((id) =>
        (project.bones ?? []).some((bone) => bone.id === id),
      );
      const constraintIds = current.filter((id) =>
        (project.constraints ?? []).some((constraint) => constraint.id === id),
      );
      adapter._sendWorkflow({
        type: "SELECT_RIG_HIT",
        elementIds,
        boneIds,
        constraintIds,
        activeBoneId: editorState.activeBoneId,
        activeConstraintId: editorState.activeConstraintId,
        anchor: editorState.rigSelectionAnchor,
      });
    } else {
      adapter._sendWorkflow({ type: "SELECT_HIT", partId: action.partId });
    }
    if (editorState.activeTool === "transform") {
      // Workflow/store effects land after this pointer event. Seed current
      // selection so the same LPM down starts movement of the new hit.
      adapter.editorRef.current = {
        ...editorState,
        selection: [action.partId],
      };
      adapter._startMoveDrag(event);
    }
    adapter.markDirty?.();
  } else if (action.type === "clearSelection") {
    adapter._sendWorkflow({ type: "CLEAR_SELECTION" });
    adapter.markDirty?.();
  }
}

export function handleCanvasPointerMove(
  adapter: PixiInteractionSystem,
  event: PointerInput,
): void {
  if (
    adapter._dragState?.type === "drawBone" &&
    adapter.editorRef.current?.activeTool !== "drawBone"
  ) {
    handleCanvasGestureCancel(adapter);
    return;
  }
  const world = adapter._eventWorldPosition(event);
  if (!world) return;
  if (handleAutoMotionPartPickMove(adapter, world)) return;
  if (handleIkPointerMove(adapter, world)) return;
  if (moveMeshGesture(adapter, world)) return;
  const drag = adapter._dragState;
  if (drag?.type === "marquee") {
    updateMarquee(adapter, drag, event, world);
  } else if (drag?.type === "drawBone") {
    drag.endWorldX = world.x;
    drag.endWorldY = world.y;
    setDrawPreview(adapter, drag);
    adapter._sendWorkflow({
      type: "MOVE_GESTURE",
      payload: { mode: "drawBone", worldX: world.x, worldY: world.y },
    });
    adapter.markDirty?.();
  } else if (!drag) {
    updateCanvasHover(adapter, world);
  }
}

export function handleCanvasPointerLeave(adapter: PixiInteractionSystem): void {
  if (adapter._dragState) return;
  adapter._brushWorldPos = null;
  if (
    adapter.editorRef.current.hoverHit != null &&
    adapter.editorRef.current.hoverSource !== "panel"
  ) {
    adapter._executeCommand({ type: "setHover", payload: { hit: null } });
  }
  adapter.markDirty?.();
}

export function handleCanvasPointerUp(
  adapter: PixiInteractionSystem,
  event: PointerInput,
): boolean {
  if (event?.button != null && event.button !== 0) return !!adapter._dragState;
  const drag = adapter._dragState;
  if (
    !drag ||
    !["marquee", "drawBone", "meshBrush", "weightPaint", "warp"].includes(
      drag.type,
    )
  )
    return false;
  if (drag.type === "marquee") {
    commitMarquee(adapter, drag);
    adapter._executeCommand({ type: "setMarquee", payload: { box: null } });
    adapter._sendWorkflow({ type: "COMMIT_MARQUEE" });
  } else if (drag.type === "drawBone") {
    commitDrawnBone(adapter, drag);
    adapter._drawBonePreview = null;
    adapter._executeCommand({
      type: "setDrawBonePreview",
      payload: { preview: null },
    });
    adapter._endCommandBatch();
    adapter._sendWorkflow({ type: "COMMIT_GESTURE" });
  } else if (drag.type === "warp") {
    commitWarpDrag(adapter, drag);
    adapter._endCommandBatch();
    adapter._sendWorkflow({ type: "COMMIT_GESTURE" });
  } else {
    const isAnimMeshBrush =
      drag.type === "meshBrush" &&
      adapter.editorRef.current?.editorMode === "animation";
    if (
      isAnimMeshBrush &&
      adapter.animationAuthoringAdapter?.commitGesture &&
      adapter.editorRef.current?.autoKeyframe !== false
    ) {
      adapter.animationAuthoringAdapter.commitGesture({ source: "auto-key" });
    } else if (isAnimMeshBrush)
      adapter.animationAuthoringAdapter?.endGesture?.();
    adapter._endCommandBatch();
    adapter._sendWorkflow({ type: "COMMIT_GESTURE" });
  }
  adapter._dragState = null;
  adapter._clearGestureSnapshot();
  adapter._resumeViewportDrag();
  adapter.markDirty?.();
  return true;
}
export function handleCanvasGestureCancel(
  adapter: PixiInteractionSystem,
): boolean {
  const drag = adapter._dragState;
  if (
    !drag ||
    !["marquee", "drawBone", "meshBrush", "weightPaint", "warp"].includes(
      drag.type,
    )
  )
    return false;
  adapter._executeCommand({ type: "setMarquee", payload: { box: null } });
  adapter._drawBonePreview = null;
  adapter._executeCommand({
    type: "setDrawBonePreview",
    payload: { preview: null },
  });
  adapter._restoreGestureSnapshot();
  if (drag.type === "warp") cleanupWarpDrag(adapter, drag);
  if (
    adapter.animationAuthoringAdapter?.cancelGesture &&
    adapter.editorRef.current?.editorMode === "animation"
  )
    adapter.animationAuthoringAdapter.cancelGesture();
  if (drag.type !== "marquee") adapter._endCommandBatch();
  adapter._dragState = null;
  adapter._resumeViewportDrag();
  adapter._sendWorkflow({ type: "CANCEL_GESTURE" });
  adapter.markDirty?.();
  return true;
}

function setDrawPreview(
  adapter: PixiInteractionSystem,
  drag: DrawBoneDrag,
): void {
  adapter._drawBonePreview = {
    startX: drag.startWorldX,
    startY: drag.startWorldY,
    endX: drag.endWorldX,
    endY: drag.endWorldY,
  };
  adapter._executeCommand({
    type: "setDrawBonePreview",
    payload: { preview: adapter._drawBonePreview },
  });
}
