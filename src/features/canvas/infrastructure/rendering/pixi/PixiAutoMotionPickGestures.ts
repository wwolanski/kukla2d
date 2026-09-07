import type { Node } from "@kukla2d/contracts";

import { computeWorldMatrices, mat3Inverse } from "@/domain/transforms";

import { worldToLocal } from "@/features/canvas/domain/coordinates.js";
import { findAlphaHit } from "@/features/canvas/domain/picking.js";

import { getAdapterEffectiveRigState } from "./PixiInputState.js";

import type {
  EditorRuntimePort,
  PointerInput,
} from "./pixiInteractionContracts.types.js";
import type { PixiInteractionSystem } from "./PixiInteractionSystem.js";

interface WorldPoint {
  x: number;
  y: number;
}
type AutoMotionInteraction = Extract<
  NonNullable<EditorRuntimePort["interaction"]>,
  {
    kind: "pendingPickAutoMotionPart" | "pendingPickAutoMotionPoint";
  }
>;
interface AutoMotionHit {
  nodeId: string;
  localPoint: WorldPoint;
}

export function handleAutoMotionPartPickDown(
  adapter: PixiInteractionSystem,
  event: PointerInput,
  world: WorldPoint,
): boolean {
  const editorState = adapter.editorRef.current;
  if (
    editorState.interaction?.kind !== "pendingPickAutoMotionPart" &&
    editorState.interaction?.kind !== "pendingPickAutoMotionPoint"
  )
    return false;
  const { nodes } = getAdapterEffectiveRigState(adapter);
  const hit = findAutoMotionPartHit(
    adapter,
    nodes,
    world,
    editorState.interaction,
  );
  if (hit) {
    adapter._executeCommand({
      type: "setSelection",
      payload: { ids: [hit.nodeId] },
    });
    adapter._executeCommand({
      type: "setInteraction",
      payload: {
        interaction:
          editorState.interaction?.kind === "pendingPickAutoMotionPoint"
            ? {
                kind: "autoMotionPickResult",
                role: editorState.interaction.role,
                nodeId: hit.nodeId,
                localPoint: hit.localPoint,
                worldPoint: { x: world.x, y: world.y },
              }
            : { kind: "idle" },
      },
    });
    adapter._executeCommand({ type: "setHover", payload: { hit: null } });
  }
  adapter.markDirty?.();
  event.stopPropagation?.();
  return true;
}

export function handleAutoMotionPartPickMove(
  adapter: PixiInteractionSystem,
  world: WorldPoint,
): boolean {
  const editorState = adapter.editorRef.current;
  if (
    editorState.interaction?.kind !== "pendingPickAutoMotionPart" &&
    editorState.interaction?.kind !== "pendingPickAutoMotionPoint"
  )
    return false;
  const { nodes } = getAdapterEffectiveRigState(adapter);
  const hit = findAutoMotionPartHit(
    adapter,
    nodes,
    world,
    editorState.interaction,
  );
  const hitId = hit?.nodeId ?? null;
  if (hitId !== editorState.hoverHit) {
    adapter._executeCommand({ type: "setHover", payload: { hit: hitId } });
    adapter.markDirty?.();
  }
  return true;
}

function findAutoMotionPartHit(
  adapter: PixiInteractionSystem,
  nodes: readonly Node[],
  world: WorldPoint,
  interaction: AutoMotionInteraction,
): AutoMotionHit | null {
  const matrices = computeWorldMatrices(nodes);
  const partId = findAlphaHit({
    parts: nodes.filter((node) => node.type === "part"),
    imageDataByPartId: adapter.imageDataByPartId,
    worldMatrices: matrices,
    worldX: world.x,
    worldY: world.y,
  });
  if (!partId) return null;
  if (
    interaction.kind === "pendingPickAutoMotionPoint" &&
    interaction.targetNodeId &&
    partId !== interaction.targetNodeId
  )
    return null;

  const matrix = matrices.get(partId);
  if (!matrix) return null;
  const inv = mat3Inverse(matrix);
  const [x, y] = worldToLocal(world.x, world.y, inv);
  return { nodeId: partId, localPoint: { x, y } };
}
