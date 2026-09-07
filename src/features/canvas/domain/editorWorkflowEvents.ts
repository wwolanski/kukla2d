import type { WorkflowEvent } from "./workflowContracts.types.js";

interface RouterResult {
  type: string;
  partId?: string;
}

type GestureCommandEvent = {
  type:
    | "START_PAN"
    | "START_TRANSFORM_DRAG"
    | "START_DRAW_BONE"
    | "START_MESH_BRUSH"
    | "START_VERTEX_DRAG"
    | "START_WEIGHT_PAINT";
  payload?: Record<string, unknown>;
};
type PointerDownEvent = Extract<WorkflowEvent, { type: "POINTER_DOWN" }>;
type SelectionEvent =
  { type: "SELECT_HIT"; partId: string } | { type: "CLEAR_SELECTION" };

const ROUTER_TO_COMMAND = {
  startPan: "START_PAN",
  startDragZoom: "START_TRANSFORM_DRAG",
  startDrawBone: "START_DRAW_BONE",
  startBrushDrag: "START_MESH_BRUSH",
  startVertexDrag: "START_VERTEX_DRAG",
  startWeightPaint: "START_WEIGHT_PAINT",
} as const;

const ROUTER_TO_INTENT = {
  startPan: "pan",
  startDragZoom: "dragZoom",
  startDrawBone: "drawBone",
  selectPart: "selectPart",
  meshEditAddVertex: "meshEditAddVertex",
  meshEditRemoveVertex: "meshEditRemoveVertex",
  startBrushDrag: "startBrushDrag",
  startVertexDrag: "startVertexDrag",
  startWeightPaint: "startWeightPaint",
  clearSelection: "clearSelection",
} as const;

function hasOwnKey<T extends object>(
  record: T,
  key: PropertyKey,
): key is keyof T {
  return Object.prototype.hasOwnProperty.call(record, key);
}

export function routerResultToCommandEvent(
  routerResult: RouterResult,
): GestureCommandEvent | null {
  if (!hasOwnKey(ROUTER_TO_COMMAND, routerResult.type)) return null;
  const type = ROUTER_TO_COMMAND[routerResult.type];
  return routerResult.partId === undefined
    ? { type }
    : { type, payload: { partId: routerResult.partId } };
}

export function routerResultToMachineEvent(
  routerResult: RouterResult,
): PointerDownEvent | null {
  if (!hasOwnKey(ROUTER_TO_INTENT, routerResult.type)) return null;
  const base: PointerDownEvent = {
    type: "POINTER_DOWN",
    intent: ROUTER_TO_INTENT[routerResult.type],
  };
  return routerResult.partId === undefined
    ? base
    : { ...base, partId: routerResult.partId };
}

export function routerResultToSelectionEvent(
  routerResult: RouterResult,
): SelectionEvent | null {
  if (routerResult.type === "selectPart" && routerResult.partId !== undefined) {
    return { type: "SELECT_HIT", partId: routerResult.partId };
  }
  return routerResult.type === "clearSelection"
    ? { type: "CLEAR_SELECTION" }
    : null;
}
