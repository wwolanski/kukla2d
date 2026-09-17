import { useCallback } from "react";

import { isLibraryAssetDrag } from "@/domain/libraryAssetDrag.js";

import { useWorkflowActor } from "@/features/canvas/application/useWorkflowActor.js";
import type { ScreenRect } from "@/features/canvas/domain/workflowContracts.types.js";

import type { DragEvent, MouseEvent, RefObject, WheelEvent } from "react";

type WorkflowSelectionTarget = "all" | "element" | "rig";

interface CanvasInputController {
  handlers: {
    onWheel: (event: WheelEvent<HTMLElement>) => void;
    onContextMenu: (event: MouseEvent<HTMLElement>) => void;
    onPanelClick: () => void;
    onDragOver: (event: DragEvent<HTMLElement>) => void;
    onDragEnter: (event: DragEvent<HTMLElement>) => void;
    onDragLeave: () => void;
  };
  refs: Record<never, never>;
}

/**
 * Canvas input hook — Pixi-only runtime.
 *
 * DOM gesture handlers (pointer down/move/up/cancel, hover, brush circle)
 * are removed. PixiInteractionSystem handles all canvas gesture lifecycle via
 * Pixi events and shared workflow actor. This hook retains only non-gesture
 * DOM functions: DnD events, context menu, wheel (no-op for Pixi), and
 * file input panel click.
 */
export function useCanvasInput({
  fileInputRef,
}: {
  fileInputRef: RefObject<HTMLInputElement | null>;
}): CanvasInputController {
  const { send: sendWorkflowEvent } = useWorkflowActor();

  const onDragOver = useCallback((e: DragEvent<HTMLElement>) => {
    e.preventDefault();
    if (isLibraryAssetDrag(e.dataTransfer)) {
      e.dataTransfer.dropEffect = "copy";
    }
  }, []);

  const onDragEnter = useCallback(
    (e: DragEvent<HTMLElement>) => {
      e.preventDefault();
      if (isLibraryAssetDrag(e.dataTransfer)) return;
      sendWorkflowEvent({ type: "DRAG_FILES_ENTER" });
    },
    [sendWorkflowEvent],
  );

  const onDragLeave = useCallback(() => {
    sendWorkflowEvent({ type: "DRAG_FILES_LEAVE" });
  }, [sendWorkflowEvent]);

  const onContextMenu = useCallback((e: MouseEvent<HTMLElement>) => {
    e.preventDefault();
  }, []);

  const onWheel = useCallback((e: WheelEvent<HTMLElement>) => {
    e.preventDefault();
  }, []);

  const onPanelClick = useCallback(() => {
    fileInputRef.current?.click();
  }, [fileInputRef]);

  return {
    handlers: {
      onWheel,
      onContextMenu,
      onPanelClick,
      onDragOver,
      onDragEnter,
      onDragLeave,
    },
    refs: {},
  };
}

export function isMarqueeTiny(box: ScreenRect | null | undefined): boolean {
  return !box || Math.abs((box.w ?? 0) * (box.h ?? 0)) < 16;
}

export function shouldStartMarquee({
  activeTool,
  meshEditMode,
  weightPaintMode,
  shiftKey,
  ctrlOrMetaKey,
  selectionTarget,
  alphaHit,
}: {
  activeTool: string;
  meshEditMode: boolean;
  weightPaintMode: boolean;
  shiftKey: boolean;
  ctrlOrMetaKey: boolean;
  selectionTarget: WorkflowSelectionTarget;
  alphaHit: string | null;
}): boolean {
  const canMarquee =
    activeTool === "select" &&
    !meshEditMode &&
    !weightPaintMode &&
    !shiftKey &&
    !ctrlOrMetaKey;
  if (!canMarquee) return false;
  return selectionTarget === "rig" || !alphaHit;
}
