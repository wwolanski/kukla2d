import type { PointerInput } from "./pixiInteractionContracts.types.js";
import type { DragState } from "./pixiInteractionDragContracts.types.js";
import type { PixiInteractionSystem } from "./PixiInteractionSystem.js";

interface WorldPoint {
  x: number;
  y: number;
}

export function handleExportAreaPointerDown(
  adapter: PixiInteractionSystem,
  event: PointerInput,
  world: WorldPoint,
): boolean {
  const editor = adapter.editorRef.current;
  if (!editor.exportAreaMoveMode) return false;

  const canvas = adapter.projectRef.current.canvas ?? {};
  const x = Number(canvas.x ?? 0);
  const y = Number(canvas.y ?? 0);
  const width = Number(canvas.width ?? 0);
  const height = Number(canvas.height ?? 0);
  const inside =
    Number.isFinite(x) &&
    Number.isFinite(y) &&
    Number.isFinite(width) &&
    width > 0 &&
    Number.isFinite(height) &&
    height > 0 &&
    world.x >= x &&
    world.x <= x + width &&
    world.y >= y &&
    world.y <= y + height;

  if (inside) {
    adapter._beginCommandBatch({
      name: "Move export area",
      type: "exportArea",
    });
    adapter._setDragState({
      type: "exportAreaMove",
      startWorldX: world.x,
      startWorldY: world.y,
      startX: x,
      startY: y,
    });
    adapter._sendWorkflow({
      type: "START_TRANSFORM_DRAG",
      payload: { mode: "exportAreaMove" },
    });
    event.stopPropagation?.();
  }

  // Move mode owns pointer input, including clicks outside the rectangle.
  return true;
}

export function handleExportAreaDragMove(
  adapter: PixiInteractionSystem,
  event: PointerInput,
  drag: DragState,
): boolean {
  if (drag.type !== "exportAreaMove") return false;
  const worldPos = adapter._eventWorldPosition(event);
  if (!worldPos) return true;
  const x = drag.startX + worldPos.x - drag.startWorldX;
  const y = drag.startY + worldPos.y - drag.startWorldY;
  adapter._executeCommand({
    type: "updateProject",
    payload: {
      mutator: (project) => {
        if (!project.canvas) return;
        project.canvas.x = x;
        project.canvas.y = y;
        project.canvas.fitSource = null;
      },
    },
  });
  adapter.markDirty?.();
  return true;
}
