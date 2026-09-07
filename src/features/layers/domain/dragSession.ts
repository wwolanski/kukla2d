import type {
  DragSession,
  DragSourceKind,
  DragTargetKind,
  DropPosition,
} from "./dragSession.types.js";

interface DropPositionInput {
  clientY?: number;
  top?: number;
  height?: number;
}

export function createDragSession(
  sourceKind: DragSourceKind,
  sourceId: string,
): DragSession {
  return {
    sourceKind,
    sourceId,
    targetKind: null,
    targetId: null,
    dropPosition: null,
  };
}

export function updateDragTarget(
  session: DragSession,
  targetKind: DragTargetKind,
  targetId: string,
  dropPosition: DropPosition,
): DragSession {
  return { ...session, targetKind, targetId, dropPosition };
}

export function computeDropPosition(
  dto: DropPositionInput | null | undefined,
  defaultPosition: DropPosition = "inside",
): DropPosition {
  const { clientY, top, height } = dto ?? {};
  if (
    typeof clientY !== "number" ||
    typeof top !== "number" ||
    typeof height !== "number" ||
    height <= 0
  )
    return defaultPosition;
  const y = clientY - top;
  const ratio = y / height;
  if (ratio < 0.25) return "before";
  if (ratio > 0.75) return "after";
  return defaultPosition;
}

export const DRAG_DROP_EFFECTS = {
  copy: "copy",
  move: "move",
  none: "none",
} as const satisfies Record<string, DataTransfer["dropEffect"]>;
