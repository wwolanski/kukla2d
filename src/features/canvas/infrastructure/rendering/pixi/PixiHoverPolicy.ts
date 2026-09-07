import {
  hasActiveCanvasElement,
  HOVER_SOURCE_CANVAS,
} from "@/domain/hoverPolicy.js";

import type { EditorRuntimePort } from "./pixiInteractionContracts.types.js";
import type { PixiInteractionSystem } from "./PixiInteractionSystem.js";

export function suppressPassiveCanvasHover(
  adapter: PixiInteractionSystem,
  editorState: Pick<EditorRuntimePort, "hoverHit" | "hoverSource">,
): boolean {
  if (!hasActiveCanvasElement(editorState)) return false;
  if (
    editorState.hoverHit != null &&
    editorState.hoverSource === HOVER_SOURCE_CANVAS
  ) {
    adapter._executeCommand({ type: "setHover", payload: { hit: null } });
    adapter.markDirty?.();
  }
  return true;
}
