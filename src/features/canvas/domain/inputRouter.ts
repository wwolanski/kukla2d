/**
 * Pure pointer-event dispatcher for canvas input actions.
 *
 * Priority order preserved from the original canvas pointer handler:
 *  1. middle/right → pan
 *  2. ctrl+middle/right    → drag zoom
 *  3. draw bone tool       → startDrawBone
 *  4. rig selection target → select only rig overlay hits; canvas alpha picking disabled
 *  5. mesh edit / weight paint + selected part → meshEditAddVertex / meshEditRemoveVertex / startWeightPaint / startBrushDrag / startVertexDrag
 *  6. alpha picking        → selectPart (or no-op when no part was hit)
 *  7. fallback             → clearSelection
 *
 * The function consumes a snapshot and returns an action without mutations.
 */

interface PointerRouterEditorState {
  activeTool?: string;
  toolMode?: string;
  selectionTarget?: string;
  selection?: readonly string[];
}

interface PointerDownInput {
  button: number;
  ctrlKey: boolean;
  editorState?: PointerRouterEditorState;
  toolMode?: string;
  meshEditMode?: boolean;
  weightPaintMode?: boolean;
  alphaHit?: string | null;
}

type PointerDownAction =
  | { type: "startDragZoom" }
  | { type: "startPan" }
  | { type: "startDrawBone" }
  | { type: "clearSelection" }
  | { type: "meshEditAddVertex" }
  | { type: "meshEditRemoveVertex" }
  | { type: "startBrushDrag" }
  | { type: "startVertexDrag" }
  | { type: "startWeightPaint" }
  | { type: "selectPart"; partId: string };

const PAN_BUTTONS: ReadonlySet<number> = new Set([1, 2]);
const ZOOM_BUTTONS: ReadonlySet<number> = new Set([1, 2]);

export function routePointerDown(input: PointerDownInput): PointerDownAction {
  const {
    button,
    ctrlKey,
    editorState,
    toolMode,
    meshEditMode,
    weightPaintMode,
  } = input;
  const activeTool = editorState?.activeTool;
  const selectionTarget = editorState?.selectionTarget ?? "element";

  // 1) drag zoom wins over pan when ctrl is held
  if (ctrlKey && ZOOM_BUTTONS.has(button)) {
    return { type: "startDragZoom" };
  }
  // 2) pan
  if (PAN_BUTTONS.has(button)) {
    return { type: "startPan" };
  }
  // 3) draw bone tool
  if (
    activeTool === "drawBone" ||
    editorState?.toolMode === "draw_bone" ||
    toolMode === "draw_bone"
  ) {
    return { type: "startDrawBone" };
  }
  // 4) rig selection owns rig hits; background click clears selection.
  if (activeTool === "drawIk" || selectionTarget === "rig")
    return { type: "clearSelection" };
  // 5) mesh / weight edit when there's a selected part
  const selection = editorState?.selection ?? [];
  if ((meshEditMode || weightPaintMode) && selection.length > 0) {
    if (meshEditMode) {
      if (toolMode === "add_vertex") return { type: "meshEditAddVertex" };
      if (toolMode === "remove_vertex") return { type: "meshEditRemoveVertex" };
      if (toolMode === "deform" || toolMode === "move")
        return { type: "startBrushDrag" };
      // default to vertex drag
      return { type: "startVertexDrag" };
    }
    if (weightPaintMode) {
      return { type: "startWeightPaint" };
    }
  }
  // 6) alpha picking
  if (input.alphaHit) {
    return { type: "selectPart", partId: input.alphaHit };
  }
  // 7) fallback
  return { type: "clearSelection" };
}
