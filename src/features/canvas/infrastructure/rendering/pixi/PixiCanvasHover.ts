import { computeWorldMatrices } from "@/domain/transforms.js";

import {
  findAlphaHit,
  findBoneHit,
  findConstraintTargetHit,
} from "@/features/canvas/domain/picking.js";
import { suppressPassiveCanvasHover } from "@/features/canvas/infrastructure/rendering/pixi/PixiHoverPolicy.js";
import { getAdapterEffectiveRigState } from "@/features/canvas/infrastructure/rendering/pixi/PixiInputState.js";
import type { PixiInteractionSystem } from "@/features/canvas/infrastructure/rendering/pixi/PixiInteractionSystem.js";

interface WorldPoint {
  x: number;
  y: number;
}

export function updateCanvasHover(
  adapter: PixiInteractionSystem,
  world: WorldPoint,
): void {
  const editorState = adapter.editorRef.current;
  if (!["select", "transform", "pose"].includes(editorState.activeTool ?? ""))
    return;
  if (suppressPassiveCanvasHover(adapter, editorState)) return;
  const project = adapter.projectRef.current;
  const { nodes, bones } = getAdapterEffectiveRigState(adapter);
  if (["all", "rig"].includes(editorState.selectionTarget ?? "element")) {
    const constraintId = findConstraintTargetHit({
      constraints: project.constraints ?? [],
      worldX: world.x,
      worldY: world.y,
      zoom: editorState.view.zoom,
    });
    if (constraintId) {
      setCanvasHover(adapter, editorState, `constraint:${constraintId}`);
      return;
    }
    const boneId = findBoneHit({
      bones,
      worldX: world.x,
      worldY: world.y,
      zoom: editorState.view.zoom,
    });
    if (boneId) {
      setCanvasHover(adapter, editorState, `bone:${boneId}`);
      return;
    }
    if (editorState.selectionTarget === "rig") {
      if (editorState.hoverHit != null)
        setCanvasHover(adapter, editorState, null);
      return;
    }
  }
  const hit = findAlphaHit({
    parts: nodes.filter((node) => node.type === "part"),
    imageDataByPartId: adapter.imageDataByPartId,
    worldMatrices: computeWorldMatrices(nodes),
    worldX: world.x,
    worldY: world.y,
  });
  setCanvasHover(adapter, editorState, hit);
}

function setCanvasHover(
  adapter: PixiInteractionSystem,
  editorState: PixiInteractionSystem["editorRef"]["current"],
  hit: string | null,
): void {
  if (hit === editorState.hoverHit && editorState.hoverSource === "canvas")
    return;
  adapter._executeCommand({ type: "setHover", payload: { hit } });
  adapter.markDirty?.();
}
