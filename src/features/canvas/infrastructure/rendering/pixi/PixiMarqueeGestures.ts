import { computeWorldMatrices } from "@/domain/transforms";

import {
  selectBonesInRect,
  selectConstraintsInRect,
  selectElementsInRect,
} from "@/features/canvas/domain/picking.js";
import type { ModifierState } from "@/features/canvas/domain/workflowContracts.types.js";

import { getAdapterEffectiveRigState } from "./PixiInputState.js";

import type {
  EditorRuntimePort,
  PointerInput,
} from "./pixiInteractionContracts.types.js";
import type { DragState } from "./pixiInteractionDragContracts.types.js";
import type { PixiInteractionSystem } from "./PixiInteractionSystem.js";

type MarqueeDrag = Extract<DragState, { type: "marquee" }>;

interface WorldPoint {
  x: number;
  y: number;
}

export function shouldStartMarquee(
  editorState: EditorRuntimePort,
  event: PointerInput,
  alphaHit: string | null,
): boolean {
  return (
    ["select", "transform", "pose"].includes(editorState.activeTool ?? "") &&
    !editorState.meshEditMode &&
    !editorState.weightPaintMode &&
    !event.shiftKey &&
    !(event.ctrlKey || event.metaKey) &&
    !alphaHit
  );
}

export function startMarquee(
  adapter: PixiInteractionSystem,
  event: PointerInput,
  world: WorldPoint,
): void {
  const editorState = adapter.editorRef.current;
  const screen = screenPoint(event, world, editorState.view);
  adapter._setDragState({
    type: "marquee",
    target: editorState.selectionTarget ?? "element",
    startWorldX: world.x,
    startWorldY: world.y,
    curWorldX: world.x,
    curWorldY: world.y,
    startScreenX: screen.x,
    startScreenY: screen.y,
  });
  adapter._sendWorkflow({
    type: "START_MARQUEE",
    origin: screen,
    target: editorState.selectionTarget ?? "element",
    modifiers: pointerModifiers(event),
  });
}

export function updateMarquee(
  adapter: PixiInteractionSystem,
  drag: MarqueeDrag,
  event: PointerInput,
  world: WorldPoint,
): void {
  const screen = screenPoint(event, world, adapter.editorRef.current.view);
  drag.curWorldX = world.x;
  drag.curWorldY = world.y;
  adapter._sendWorkflow({
    type: "UPDATE_MARQUEE",
    box: {
      x: Math.min(drag.startScreenX, screen.x),
      y: Math.min(drag.startScreenY, screen.y),
      w: Math.abs(screen.x - drag.startScreenX),
      h: Math.abs(screen.y - drag.startScreenY),
    },
  });
  adapter.markDirty?.();
}

export function commitMarquee(
  adapter: PixiInteractionSystem,
  drag: MarqueeDrag,
): void {
  const minX = Math.min(drag.startWorldX, drag.curWorldX);
  const minY = Math.min(drag.startWorldY, drag.curWorldY);
  const maxX = Math.max(drag.startWorldX, drag.curWorldX);
  const maxY = Math.max(drag.startWorldY, drag.curWorldY);
  if ((maxX - minX) * (maxY - minY) < 16) {
    adapter._executeCommand({ type: "clearSelection", payload: {} });
    return;
  }
  const project = adapter.projectRef.current;
  const { nodes, bones, poseOverrides } = getAdapterEffectiveRigState(adapter);
  const constraints = (project.constraints ?? []).map((constraint) => ({
    ...constraint,
    ...(poseOverrides?.get?.(constraint.id) ?? {}),
  }));
  if (drag.target === "rig" || drag.target === "all") {
    const rect = { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
    const boneIds = selectBonesInRect({ bones, rect });
    const constraintIds = selectConstraintsInRect({ constraints, bones, rect });
    const elementIds =
      drag.target === "all"
        ? selectElementsInRect({
            nodes,
            worldMatrices: computeWorldMatrices(nodes),
            rect,
          })
        : [];
    adapter._executeCommand({
      type: "setRigSelection",
      payload: {
        elementIds,
        boneIds,
        constraintIds,
        activeBoneId: boneIds.at(-1) ?? null,
        activeConstraintId: constraintIds.at(-1) ?? null,
        anchor: boneIds[0] ?? constraintIds[0] ?? null,
      },
    });
    return;
  }
  const ids = selectElementsInRect({
    nodes,
    worldMatrices: computeWorldMatrices(nodes),
    rect: { x: minX, y: minY, w: maxX - minX, h: maxY - minY },
  });
  adapter._executeCommand({ type: "setSelection", payload: { ids } });
}

function pointerModifiers(event: PointerInput): ModifierState {
  return {
    shiftKey: !!event.shiftKey,
    ctrlKey: !!event.ctrlKey,
    altKey: !!event.altKey,
    metaKey: !!event.metaKey,
  };
}

function screenPoint(
  event: PointerInput,
  world: WorldPoint,
  view: EditorRuntimePort["view"],
): WorldPoint {
  const global = event.global;
  if (global && Number.isFinite(global.x) && Number.isFinite(global.y))
    return { x: global.x, y: global.y };
  return {
    x: world.x * (view?.zoom || 1) + (view?.panX || 0),
    y: world.y * (view?.zoom || 1) + (view?.panY || 0),
  };
}
