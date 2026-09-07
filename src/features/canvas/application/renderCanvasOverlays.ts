import type {
  ProjectDocument,
  Vertex,
  WarpDeformerNode,
} from "@kukla2d/contracts";

import type { AnimationStore } from "@/store/animationStoreTypes.types.js";

import { resolveVisibleHoverHit } from "@/domain/hoverPolicy.js";
import { computeWorldMatrices } from "@/domain/transforms";

import { buildCanvasOverlayFrame } from "@/features/canvas/domain/canvasOverlayFrame.js";
import { buildGizmoFrame } from "@/features/canvas/domain/gizmoFrame.js";
import { buildSkeletonFrame } from "@/features/canvas/domain/skeletonFrame.js";
import { buildWarpLatticeFrame } from "@/features/canvas/domain/warpLatticeFrame.js";

import type { CanvasEditorSnapshot } from "./canvasApplication.types.js";
import type { CanvasSceneGateway } from "./canvasApplication.types.js";
import type { composeCanvasFrameState } from "./composeCanvasFrameState.js";

interface RenderCanvasOverlaysArgs {
  gateway: CanvasSceneGateway;
  project: ProjectDocument;
  editor: CanvasEditorSnapshot;
  animationState: AnimationStore;
  framePose: ReturnType<typeof composeCanvasFrameState>;
  isPickInteraction: boolean;
}

export function renderCanvasOverlays({
  gateway,
  project,
  editor,
  animationState,
  framePose,
  isPickInteraction,
}: RenderCanvasOverlaysArgs): void {
  const overlayRenderer = gateway.overlayRenderer;
  if (!overlayRenderer) return;
  const { effectiveNodes, effectiveBones, effectiveMeshes, poseOverrides } =
    framePose;
  const overlayFrame = buildCanvasOverlayFrame({
    project,
    editorState: editor,
    animationState,
    framePose: {
      poseOverrides,
      effectiveNodes,
      effectiveBones,
      effectiveMeshes,
      worldMatrices: computeWorldMatrices(effectiveNodes),
    },
  });
  const worldMatrices = overlayFrame.worldMatrices;
  const gizmoFrame = buildGizmoFrame({
    selectedNode: overlayFrame.effectiveNodes.find(
      (node) => node.id === overlayFrame.selectedNodeId,
    ),
    effectiveNodes: overlayFrame.effectiveNodes,
    worldMatrices,
  });
  let skeletonFrame = null;
  let warpFrame = null;
  overlayRenderer.clear();
  overlayRenderer.renderGizmo(
    isPickInteraction ? null : gizmoFrame,
    editor.view.zoom,
  );
  const showOverlays = editor.showSkeleton !== false;
  const visibleHoverHit = resolveVisibleHoverHit(editor);
  const hasRigHover =
    typeof visibleHoverHit === "string" &&
    (visibleHoverHit.startsWith("bone:") ||
      visibleHoverHit.startsWith("constraint:"));
  const showRigOverlays = showOverlays || hasRigHover;
  overlayRenderer.renderMeshWireframe(
    showOverlays ? overlayFrame.meshWireframe : null,
    editor.view.zoom,
  );
  overlayRenderer.renderIkConstraints(
    showRigOverlays ? overlayFrame.ikOverlay : null,
    editor.view.zoom,
  );
  if (showRigOverlays && overlayFrame.effectiveBones?.length) {
    skeletonFrame = buildSkeletonFrame({
      effectiveNodes: overlayFrame.effectiveNodes,
      effectiveBones: overlayFrame.effectiveBones,
      worldMatrices,
      editorState: editor,
      constraints: project.constraints ?? [],
      poseHandleExtensions: numberExtensions(
        gateway.interactionSystem?.readPoseHandleExtensions(),
      ),
    });
    overlayRenderer.renderSkeleton(skeletonFrame, editor.view.zoom);
  }
  const selectedWarpNode = overlayFrame.effectiveNodes.find(
    (node): node is WarpDeformerNode =>
      node.id === overlayFrame.selectedNodeId && node.type === "warpDeformer",
  );
  if (selectedWarpNode) {
    const gridPoints = poseOverrides?.get(selectedWarpNode.id)?.mesh_verts;
    if (isVertexArray(gridPoints) && gridPoints.length > 0) {
      warpFrame = buildWarpLatticeFrame({
        wdNode: selectedWarpNode,
        gridPoints,
      });
      if (warpFrame)
        overlayRenderer.renderWarpLattice(warpFrame, editor.view.zoom);
    }
  }
  const hoverNode = overlayFrame.hoverHit
    ? overlayFrame.effectiveNodes.find(
        (node) => node.id === overlayFrame.hoverHit,
      )
    : null;
  const hoverFrame = hoverNode
    ? buildGizmoFrame({
        selectedNode: hoverNode,
        effectiveNodes: overlayFrame.effectiveNodes,
        worldMatrices,
      })
    : null;
  overlayRenderer.renderHover(
    hoverFrame?.visible ? hoverFrame : null,
    editor.view.zoom,
    {
      tone:
        editor.interaction?.kind === "pendingPickAutoMotionPart"
          ? "amber"
          : "default",
    },
  );
  if (overlayFrame.marqueeWorldBox)
    overlayRenderer.renderMarquee(
      overlayFrame.marqueeWorldBox,
      editor.view.zoom,
    );
  const drawBonePreview = showOverlays
    ? (gateway.interactionSystem?.getDrawBonePreview?.() ??
      overlayFrame.drawBonePreview)
    : null;
  if (drawBonePreview)
    overlayRenderer.renderDrawBonePreview(drawBonePreview, editor.view.zoom);
  if (overlayFrame.weightPaintOverlay?.visible) {
    overlayRenderer.renderWeightPaint(
      overlayFrame.weightPaintOverlay,
      editor.view.zoom,
    );
  } else if (overlayFrame.weightPaintPoints?.length) {
    overlayRenderer.renderWeightPaint(
      overlayFrame.weightPaintPoints,
      editor.view.zoom,
    );
  }
  if (overlayFrame.brushCursor) {
    const brushPosition = gateway.interactionSystem?.getBrushWorldPos();
    if (brushPosition?.visible)
      overlayRenderer.renderBrush(
        overlayFrame.brushCursor,
        brushPosition.x,
        brushPosition.y,
        editor.view.zoom,
      );
  }
  overlayRenderer.renderExportArea(
    overlayFrame.exportAreaFrame,
    editor.view.zoom,
  );
  gateway.interactionSystem?.updateHandles({
    gizmoFrame,
    skeletonFrame,
    warpFrame,
    zoom: editor.view.zoom,
  });
  gateway.incrementOverlayRenderCount();
}

function isVertexArray(value: unknown): value is Vertex[] {
  return (
    Array.isArray(value) &&
    value.every((candidate: unknown) => {
      if (typeof candidate !== "object" || candidate === null) return false;
      const point = Object.fromEntries(Object.entries(candidate));
      return typeof point.x === "number" && typeof point.y === "number";
    })
  );
}

function numberExtensions(
  values: ReadonlyMap<string, unknown> | null | undefined,
): Map<string, number> {
  const result = new Map<string, number>();
  for (const [id, value] of values ?? [])
    if (typeof value === "number" && Number.isFinite(value))
      result.set(id, value);
  return result;
}
