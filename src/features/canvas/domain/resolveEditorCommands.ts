/**
 * resolveEditorCommands — pure mapping from (workflow event + machine context)
 * to an array of EditorCommand effects.
 *
 * C1: no React, Zustand, DOM, Pixi, or Worker imports.
 * R4: pure, deterministic, testable in isolation.
 */

import type {
  EditorCommand,
  EditorWorkflowState,
  WorkflowEvent,
} from "./workflowContracts.types.js";

/**
 * Resolve which EditorCommands should execute for a given event + context.
 *
 * @param {{ event: { type: string, [key: string]: unknown }, context: MachineContext }} params
 * @returns {Array<import('./workflowContracts.types.js').EditorCommand>}
 */
export function resolveEditorCommands({
  event,
  context,
}: {
  event: WorkflowEvent;
  context: EditorWorkflowState;
}): EditorCommand[] {
  switch (event.type) {
    case "SET_TOOL":
      return [
        {
          type: "applyWorkflowUi",
          payload: {
            showSkeleton: [
              "drawBone",
              "drawIk",
              "pose",
              "weightPaint",
            ].includes(event.tool),
            clearRigFocus: ["select", "weightPaint", "meshEdit"].includes(
              event.tool,
            ),
            clearSelection: event.tool === "select",
            clearHover: true,
            clearBlendShape: event.tool !== "meshEdit",
            finishExportAreaMove: true,
          },
        },
      ];

    case "SET_SELECTION_TARGET":
      return [
        {
          type: "applyWorkflowUi",
          payload: {
            showSkeleton: event.target !== "element",
            clearRigFocus: event.target === "element",
            clearBlendShape: true,
          },
        },
      ];

    case "CYCLE_SELECTION_TARGET":
      return [];

    case "SET_RIGGING_MODE":
      return [
        {
          type: "applyWorkflowUi",
          payload: {
            showSkeleton: event.riggingMode !== "off",
            clearBlendShape: true,
            resetRigOverlays: event.riggingMode !== "off",
          },
        },
      ];

    case "SET_TOOL_MODE":
      return [];

    case "ENTER_MESH_EDIT":
      return [];

    case "EXIT_MESH_EDIT":
      return [];

    case "SET_RIGGING_TOOL":
      return [
        {
          type: "applyWorkflowUi",
          payload: { showSkeleton: true, clearBlendShape: true },
        },
      ];

    case "ENTER_WEIGHT_PAINT":
      return [
        {
          type: "applyWorkflowUi",
          payload: { showSkeleton: true, clearBlendShape: true },
        },
      ];

    case "EXIT_WEIGHT_PAINT":
      return [];

    case "SET_MESH_SUBMODE":
      return [];

    case "SELECT_HIT":
      return [{ type: "setSelection", payload: { ids: [event.partId] } }];

    case "SELECT_RIG_HIT":
      return [
        {
          type: "setRigSelection",
          payload: {
            boneIds: event.boneIds,
            elementIds: event.elementIds,
            constraintIds: event.constraintIds,
            activeBoneId: event.activeBoneId,
            activeConstraintId: event.activeConstraintId,
            anchor: event.anchor,
          },
        },
      ];

    case "CLEAR_SELECTION":
      return [
        {
          type: "clearSelection",
          payload: { target: context.selectionTarget },
        },
      ];

    case "START_MARQUEE":
      if (!event.origin) return [];
      return [
        {
          type: "setMarquee",
          payload: {
            box: { x: event.origin.x, y: event.origin.y, w: 0, h: 0 },
          },
        },
      ];

    case "UPDATE_MARQUEE":
      return [{ type: "setMarquee", payload: { box: event.box } }];

    case "COMMIT_MARQUEE":
      return [{ type: "setMarquee", payload: { box: null } }];

    case "CANCEL_GESTURE":
      return context.marqueeBox
        ? [{ type: "setMarquee", payload: { box: null } }]
        : [];

    case "DRAG_FILES_ENTER":
    case "DRAG_FILES_LEAVE":
    case "DROP_FILES":
    case "IMPORT_DONE":
    case "IMPORT_FAILED":
      return [];

    case "CANCEL":
      return [];

    case "POINTER_DOWN":
    case "POINTER_UP":
    case "START_PAN":
    case "START_TRANSFORM_DRAG":
    case "START_MESH_BRUSH":
    case "START_WEIGHT_PAINT":
    case "START_DRAW_BONE":
    case "START_VERTEX_DRAG":
    case "START_GIZMO_MOVE":
    case "START_GIZMO_ROTATE":
    case "START_GIZMO_PIVOT":
    case "START_SKELETON_JOINT":
    case "START_SKELETON_BONE":
    case "START_SKELETON_TRACKPAD":
    case "START_SKELETON_ROTATE":
    case "COMMIT_GESTURE":
    case "MOVE_GESTURE":
      return [];

    default:
      return [];
  }
}
