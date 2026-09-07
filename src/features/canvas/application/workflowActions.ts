import { assign } from "xstate";

import { createGestureSession } from "../domain/gestureSession.js";

import type { GestureKind } from "../domain/gestureSession.types.js";
import type {
  EditorWorkflowState,
  WorkflowEvent,
} from "../domain/workflowContracts.types.js";

const MESH_TOOLS = [
  "meshEdit",
  "meshDeform",
  "meshAdjust",
  "meshAddVertex",
  "meshRemoveVertex",
];

function workflowAssign(
  reducer: (args: {
    context: EditorWorkflowState;
    event: WorkflowEvent;
  }) => Partial<EditorWorkflowState>,
) {
  return assign<
    EditorWorkflowState,
    WorkflowEvent,
    undefined,
    WorkflowEvent,
    never
  >(reducer);
}

function readPayload(event: WorkflowEvent): Record<string, unknown> {
  return "payload" in event ? (event.payload ?? {}) : {};
}

function startSession(kind: GestureKind) {
  return workflowAssign(({ event }) => ({
    activeSession: createGestureSession(kind, readPayload(event)),
  }));
}

export const workflowActions = {
  setTool: workflowAssign(({ context, event }) => {
    if (event.type !== "SET_TOOL") return {};
    const { tool } = event;
    const rigForcing = ["drawBone", "drawIk", "pose"];
    const lastNonRigSelectionTarget =
      rigForcing.includes(tool) && context.selectionTarget !== "rig"
        ? context.selectionTarget
        : context.lastNonRigSelectionTarget;
    const selectionTarget =
      tool === "drawBone" || tool === "drawIk" || tool === "pose"
        ? "rig"
        : MESH_TOOLS.includes(tool) || tool === "weightPaint"
          ? "element"
          : tool === "select"
            ? context.selectionTarget === "rig" &&
              context.lastNonRigSelectionTarget !== null
              ? context.lastNonRigSelectionTarget
              : "all"
            : tool === "transform" &&
                context.selectionTarget === "rig" &&
                context.lastNonRigSelectionTarget !== null
              ? context.lastNonRigSelectionTarget
              : context.selectionTarget;
    const riggingMode =
      tool === "drawBone"
        ? "bones"
        : tool === "drawIk"
          ? "ik"
          : tool === "pose"
            ? "pose"
            : tool === "weightPaint"
              ? "weights"
              : MESH_TOOLS.includes(tool)
                ? "off"
                : tool === "transform"
                  ? selectionTarget === "element"
                    ? "off"
                    : "bones"
                  : tool === "select"
                    ? "bones"
                    : "off";
    return {
      activeTool: tool,
      lastNonRigSelectionTarget,
      selectionTarget,
      riggingMode,
      riggingTool: tool === "drawBone" ? "draw" : "select",
      toolMode:
        tool === "drawBone"
          ? "draw_bone"
          : tool === "meshAddVertex"
            ? "add_vertex"
            : tool === "meshRemoveVertex"
              ? "remove_vertex"
              : "select",
      meshEditMode: MESH_TOOLS.includes(tool),
      meshSubMode:
        tool === "meshAdjust" ||
        tool === "meshAddVertex" ||
        tool === "meshRemoveVertex"
          ? "adjust"
          : tool === "meshEdit" || tool === "meshDeform"
            ? "deform"
            : context.meshSubMode,
      weightPaintMode: tool === "weightPaint",
    };
  }),
  setSelectionTarget: workflowAssign(({ event }) =>
    event.type === "SET_SELECTION_TARGET"
      ? {
          activeTool: "select",
          selectionTarget: event.target,
          lastNonRigSelectionTarget:
            event.target === "rig" ? null : event.target,
          riggingMode: event.target === "element" ? "off" : "bones",
          riggingTool: "select",
          toolMode: "select",
          meshEditMode: false,
          weightPaintMode: false,
        }
      : {},
  ),
  cycleSelectionTarget: workflowAssign(({ context }) => {
    if (context.activeTool !== "select") return {};
    const selectionTarget =
      context.selectionTarget === "all"
        ? "element"
        : context.selectionTarget === "element"
          ? "rig"
          : "all";
    return {
      selectionTarget,
      lastNonRigSelectionTarget:
        context.selectionTarget === "element"
          ? null
          : context.selectionTarget === "rig"
            ? "all"
            : context.lastNonRigSelectionTarget,
      riggingMode: context.selectionTarget === "all" ? "off" : "bones",
    };
  }),
  setRiggingModeAction: workflowAssign(({ context, event }) => {
    if (event.type !== "SET_RIGGING_MODE") return {};
    const { riggingMode } = event;
    return {
      riggingMode,
      activeTool:
        riggingMode === "weights"
          ? "weightPaint"
          : riggingMode === "ik"
            ? "drawIk"
            : riggingMode === "pose"
              ? "pose"
              : riggingMode === "off"
                ? ["drawBone", "drawIk", "weightPaint"].includes(
                    context.activeTool,
                  )
                  ? "select"
                  : context.activeTool
                : "select",
      selectionTarget:
        riggingMode === "weights" || riggingMode === "off" ? "element" : "rig",
      riggingTool: riggingMode === "bones" ? context.riggingTool : "select",
      toolMode: "select",
      meshEditMode: false,
      weightPaintMode: riggingMode === "weights",
    };
  }),
  enterMeshEdit: workflowAssign(() => ({
    activeTool: "meshEdit",
    selectionTarget: "element",
    riggingMode: "off",
    riggingTool: "select",
    toolMode: "select",
    meshEditMode: true,
    weightPaintMode: false,
  })),
  exitMeshEdit: workflowAssign(() => ({
    activeTool: "select",
    toolMode: "select",
    meshEditMode: false,
  })),
  enterRig: workflowAssign(() => ({
    selectionTarget: "rig",
    riggingMode: "bones",
  })),
  exitRig: workflowAssign(() => ({
    selectionTarget: "element",
    riggingMode: "off",
  })),
  setRiggingToolAction: workflowAssign(({ event }) =>
    event.type === "SET_RIGGING_TOOL"
      ? {
          riggingTool: event.riggingTool,
          activeTool: event.riggingTool === "draw" ? "drawBone" : "select",
          selectionTarget: "rig",
          riggingMode: "bones",
          toolMode: event.riggingTool === "draw" ? "draw_bone" : "select",
          weightPaintMode: false,
        }
      : {},
  ),
  enterWeightPaintAction: workflowAssign(() => ({
    activeTool: "weightPaint",
    selectionTarget: "element",
    riggingMode: "weights",
    riggingTool: "select",
    meshEditMode: false,
    weightPaintMode: true,
  })),
  exitWeightPaintAction: workflowAssign(() => ({
    activeTool: "select",
    riggingMode: "off",
    weightPaintMode: false,
  })),
  setMeshSubModeAction: workflowAssign(({ event }) =>
    event.type === "SET_MESH_SUBMODE"
      ? {
          meshSubMode: event.meshSubMode,
          selectionTarget: "element",
          toolMode: "select",
        }
      : {},
  ),
  setToolModeAction: workflowAssign(({ context, event }) =>
    event.type === "SET_TOOL_MODE"
      ? {
          toolMode: event.toolMode,
          activeTool:
            event.toolMode === "select" && context.activeTool === "meshEdit"
              ? "select"
              : event.toolMode === "select"
                ? context.activeTool
                : "meshEdit",
          selectionTarget:
            event.toolMode === "select" ? context.selectionTarget : "element",
          meshEditMode: event.toolMode !== "select",
        }
      : {},
  ),
  selectRigContext: workflowAssign(({ context }) => ({
    activeTool: context.activeTool === "pose" ? "pose" : "transform",
    selectionTarget: context.selectionTarget === "all" ? "all" : "rig",
    riggingMode: "bones",
    riggingTool: "select",
    toolMode: "select",
    meshEditMode: false,
    weightPaintMode: false,
  })),
  activateTransform: workflowAssign(({ context }) => ({
    activeTool: "transform",
    riggingMode: context.selectionTarget === "element" ? "off" : "bones",
    riggingTool: "select",
    toolMode: "select",
    meshEditMode: false,
    weightPaintMode: false,
  })),
  emitCommands: workflowAssign(() => ({})),
  startPanSession: startSession("pan"),
  startTransformSession: startSession("dragZoom"),
  startVertexDragSession: startSession("vertexDrag"),
  startMeshBrushSession: startSession("meshBrush"),
  startWeightPaintSession: startSession("weightPaint"),
  startDrawBoneSession: startSession("drawBone"),
  startGizmoMoveSession: startSession("gizmoMove"),
  startGizmoRotateSession: startSession("gizmoRotate"),
  startGizmoPivotSession: startSession("gizmoPivot"),
  startSkeletonJointSession: startSession("skeletonJoint"),
  startSkeletonBoneSession: startSession("skeletonBone"),
  startSkeletonTrackpadSession: startSession("skeletonTrackpad"),
  startSkeletonRotateSession: startSession("skeletonRotate"),
  startMarqueeSession: workflowAssign(({ event }) =>
    event.type === "START_MARQUEE"
      ? {
          activeSession: createGestureSession("marquee", {
            origin: event.origin,
            target: event.target,
            modifiers: event.modifiers,
          }),
          marqueeBox: { x: event.origin.x, y: event.origin.y, w: 0, h: 0 },
        }
      : {},
  ),
  updateSessionPayload: workflowAssign(({ context, event }) =>
    event.type === "MOVE_GESTURE" && context.activeSession
      ? {
          activeSession: {
            ...context.activeSession,
            payload: { ...context.activeSession.payload, ...event.payload },
          },
        }
      : {},
  ),
  updateMarqueeBox: workflowAssign(({ event }) =>
    event.type === "UPDATE_MARQUEE" ? { marqueeBox: event.box } : {},
  ),
  clearMarqueeBox: workflowAssign(() => ({ marqueeBox: null })),
  clearSession: workflowAssign(() => ({ activeSession: null })),
  setImportDragOver: workflowAssign(() => ({ importStatus: "dragOver" })),
  setImportIdle: workflowAssign(() => ({ importStatus: "idle" })),
  setImporting: workflowAssign(() => ({ importStatus: "importing" })),
  setImportDone: workflowAssign(() => ({ importStatus: "done" })),
  setImportFailed: workflowAssign(() => ({ importStatus: "failed" })),
};
