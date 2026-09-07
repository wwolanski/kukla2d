import { useCallback, useRef, useState } from "react";

import { createDragSession, updateDragTarget } from "../domain/dragSession.js";

import type {
  DragSession,
  DragSourceKind,
  DragTargetKind,
  DropPosition,
} from "../domain/dragSession.types.js";

interface DragSessionController {
  session: DragSession | null;
  onDragStart: (
    event: React.DragEvent,
    sourceKind: DragSourceKind,
    sourceId: string,
  ) => void;
  onDragOver: (
    targetKind: DragTargetKind,
    targetId: string,
    dropPosition: DropPosition,
  ) => void;
  clearSession: () => void;
}

export function useDragSession(
  getDragImage?: () => HTMLCanvasElement | null,
): DragSessionController {
  const [session, setSession] = useState<DragSession | null>(null);
  const ref = useRef<DragSession | null>(null);

  const onDragStart = useCallback(
    (e: React.DragEvent, sourceKind: DragSourceKind, sourceId: string) => {
      const next = createDragSession(sourceKind, sourceId);
      ref.current = next;
      setSession(next);
      e.dataTransfer.effectAllowed = "move";
      const ghost = getDragImage?.();
      if (ghost) e.dataTransfer.setDragImage(ghost, 0, 0);
    },
    [getDragImage],
  );

  const onDragOver = useCallback(
    (
      targetKind: DragTargetKind,
      targetId: string,
      dropPosition: DropPosition,
    ) => {
      setSession((prev) => {
        if (!prev) return prev;
        if (
          prev.targetKind === targetKind &&
          prev.targetId === targetId &&
          prev.dropPosition === dropPosition
        )
          return prev;
        return updateDragTarget(prev, targetKind, targetId, dropPosition);
      });
    },
    [],
  );

  const clearSession = useCallback(() => {
    ref.current = null;
    setSession(null);
  }, []);

  return { session, onDragStart, onDragOver, clearSession };
}
