import { getWarpGrid } from "./PixiInputState.js";

import type { DragState } from "./pixiInteractionDragContracts.types.js";
import type { PixiInteractionSystem } from "./PixiInteractionSystem.js";

type WarpDrag = Extract<DragState, { type: "warp" }>;

export function startWarpDrag(
  adapter: PixiInteractionSystem,
  ptIndex: number,
): void {
  const editorState = adapter.editorRef.current;
  const selection = editorState.selection;
  if (!selection?.length) return;
  const wdNode = adapter.projectRef.current.nodes.find(
    (n) => n.id === selection[0],
  );
  if (!wdNode || wdNode.type !== "warpDeformer") return;

  const framePose = adapter.readFramePose?.();
  const currentGrid = getWarpGrid({
    wdNode,
    animation: adapter.animationRef.current,
    poseOverrides: framePose?.poseOverrides ?? null,
  });
  if (!currentGrid) return;

  const isAnimMode = editorState.editorMode === "animation";
  if (!isAnimMode)
    adapter._beginCommandBatch({ name: "Warp drag", type: "warp" });
  const gestureId = isAnimMode
    ? adapter.animationAuthoringAdapter?.beginGesture()
    : null;

  adapter._setDragState({
    type: "warp",
    ptIndex,
    wdNodeId: wdNode.id,
    startPts: currentGrid.map((p) => ({ x: p.x, y: p.y })),
    isAnimMode,
    gestureId,
  });
  adapter._sendWorkflow({
    type: "START_MESH_BRUSH",
    payload: { mode: "warp", nodeId: wdNode.id, pointIndex: ptIndex },
  });
}

export function commitWarpDrag(
  adapter: PixiInteractionSystem,
  drag: WarpDrag,
): void {
  const isAnimMode = drag.isAnimMode;
  if (isAnimMode) {
    if (
      adapter.animationAuthoringAdapter?.commitGesture &&
      adapter.editorRef.current?.autoKeyframe !== false
    ) {
      adapter.animationAuthoringAdapter.commitGesture({ source: "auto-key" });
    }
  } else {
    const posedVerts = adapter.animationRef.current?.draftPose?.get?.(
      drag.wdNodeId,
    )?.mesh_verts;
    if (Array.isArray(posedVerts) && posedVerts.length) {
      adapter._executeCommand({
        type: "updateProject",
        payload: {
          mutator: (project) => {
            const wdNode = project.nodes.find((n) => n.id === drag.wdNodeId);
            if (!wdNode || wdNode.type !== "warpDeformer") return;
            project.defaultPose ??= {};
            project.defaultPose[wdNode.id] = {
              ...(project.defaultPose[wdNode.id] ?? {}),
              mesh_verts: posedVerts.map((point) => ({
                x: Number((point as { x?: unknown }).x),
                y: Number((point as { y?: unknown }).y),
              })),
            };
          },
        },
      });
    }
  }
  cleanupWarpDrag(adapter, drag);
}

export function cleanupWarpDrag(
  adapter: PixiInteractionSystem,
  drag: WarpDrag,
): void {
  adapter._clearPreviewPose();
  adapter.animationRef.current?.clearDraftPoseForNode?.(drag.wdNodeId);
}
