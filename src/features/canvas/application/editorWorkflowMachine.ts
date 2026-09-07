import { setup } from "xstate";

import { workflowActions } from "./workflowActions.js";

import type {
  EditorWorkflowState,
  WorkflowEvent,
} from "../domain/workflowContracts.types.js";

/**
 * Editor workflow machine — application orchestration for canvas input.
 *
 * Models gesture/tool states with explicit command events:
 *   idle ↔ panning | draggingTransform | drawingBone | editingMesh | weightPainting | editingRig | editingGizmo
 *   idle ↔ marqueeSelecting | dragOverFiles | importingFiles
 *
 * This machine does NOT import any store, DOM, or Pixi code.
 * Side effects are emitted as action names for the integration layer to consume.
 *
 * The `emitCommands` action is a placeholder overridden by the Provider
 * to resolve and execute EditorCommands via the injected executor.
 */

/**
 * @typedef {{
 *   activeTool: string,
 *   selectionTarget: string,
 *   lastNonRigSelectionTarget: string | null,
 *   riggingMode: string,
 *   riggingTool: string,
 *   toolMode: string,
 *   meshEditMode: boolean,
 *   meshSubMode: string,
 *   weightPaintMode: boolean,
 *   activeSession: import('../domain/gestureSession.types.js').GestureSession | null,
 *   marqueeBox: { x: number, y: number, w: number, h: number } | null,
 *   importStatus: 'idle' | 'dragOver' | 'importing' | 'done' | 'failed',
 * }} EditorWorkflowContext
 */

export const editorWorkflowMachine = setup({
  types: {
    context: {} as EditorWorkflowState,
    events: {} as WorkflowEvent,
  },
  actions: workflowActions,
}).createMachine({
  id: "editorWorkflow",
  context: () => ({
    activeTool: "select",
    selectionTarget: "all",
    lastNonRigSelectionTarget: "all",
    riggingMode: "off",
    riggingTool: "select",
    toolMode: "select",
    meshEditMode: false,
    meshSubMode: "deform",
    weightPaintMode: false,
    activeSession: null,
    marqueeBox: null,
    importStatus: "idle",
  }),
  initial: "idle",
  states: {
    idle: {
      on: {
        POINTER_DOWN: [
          { guard: ({ event }) => event.intent === "pan", target: "panning" },
          {
            guard: ({ event }) => event.intent === "dragZoom",
            target: "draggingTransform",
          },
          {
            guard: ({ event }) => event.intent === "drawBone",
            target: "drawingBone",
          },
          {
            guard: ({ event }) => event.intent === "selectPart",
            target: "selecting",
          },
          {
            guard: ({ event }) =>
              [
                "meshEditAddVertex",
                "meshEditRemoveVertex",
                "startBrushDrag",
                "startVertexDrag",
              ].includes(event.intent),
            target: "editingMesh",
          },
          {
            guard: ({ event }) => event.intent === "startWeightPaint",
            target: "weightPainting",
          },
          {
            guard: ({ event }) => event.intent === "startDragZoom",
            target: "draggingTransform",
          },
        ],
        START_PAN: { target: "panning", actions: "startPanSession" },
        START_TRANSFORM_DRAG: {
          target: "draggingTransform",
          actions: "startTransformSession",
        },
        START_MESH_BRUSH: {
          target: "editingMesh",
          actions: "startMeshBrushSession",
        },
        START_WEIGHT_PAINT: {
          target: "weightPainting",
          actions: "startWeightPaintSession",
        },
        START_DRAW_BONE: {
          target: "drawingBone",
          actions: "startDrawBoneSession",
        },
        START_VERTEX_DRAG: {
          target: "editingMesh",
          actions: "startVertexDragSession",
        },
        START_MARQUEE: {
          target: "marqueeSelecting",
          actions: "startMarqueeSession",
        },
        START_GIZMO_MOVE: {
          target: "editingGizmo",
          actions: "startGizmoMoveSession",
        },
        START_GIZMO_ROTATE: {
          target: "editingGizmo",
          actions: "startGizmoRotateSession",
        },
        START_GIZMO_PIVOT: {
          target: "editingGizmo",
          actions: "startGizmoPivotSession",
        },
        START_SKELETON_JOINT: {
          target: "editingRig",
          actions: "startSkeletonJointSession",
        },
        START_SKELETON_BONE: {
          target: "editingRig",
          actions: "startSkeletonBoneSession",
        },
        START_SKELETON_TRACKPAD: {
          target: "editingRig",
          actions: "startSkeletonTrackpadSession",
        },
        START_SKELETON_ROTATE: {
          target: "editingRig",
          actions: "startSkeletonRotateSession",
        },
        SET_TOOL: { actions: ["setTool", "emitCommands"] },
        SET_SELECTION_TARGET: {
          actions: ["setSelectionTarget", "emitCommands"],
        },
        CYCLE_SELECTION_TARGET: {
          actions: ["cycleSelectionTarget", "emitCommands"],
        },
        SET_RIGGING_MODE: { actions: ["setRiggingModeAction", "emitCommands"] },
        SET_TOOL_MODE: { actions: ["setToolModeAction", "emitCommands"] },
        ENTER_MESH_EDIT: { actions: ["enterMeshEdit", "emitCommands"] },
        EXIT_MESH_EDIT: { actions: ["exitMeshEdit", "emitCommands"] },
        ENTER_RIG: { actions: "enterRig" },
        EXIT_RIG: { actions: "exitRig" },
        SET_RIGGING_TOOL: { actions: ["setRiggingToolAction", "emitCommands"] },
        ENTER_WEIGHT_PAINT: {
          actions: ["enterWeightPaintAction", "emitCommands"],
        },
        EXIT_WEIGHT_PAINT: {
          actions: ["exitWeightPaintAction", "emitCommands"],
        },
        SET_MESH_SUBMODE: { actions: ["setMeshSubModeAction", "emitCommands"] },
        SELECT_HIT: { actions: ["activateTransform", "emitCommands"] },
        SELECT_RIG_HIT: { actions: ["selectRigContext", "emitCommands"] },
        CLEAR_SELECTION: { actions: "emitCommands" },
        DRAG_FILES_ENTER: {
          target: "dragOverFiles",
          actions: ["setImportDragOver", "emitCommands"],
        },
        DROP_FILES: {
          target: "importingFiles",
          actions: ["setImporting", "emitCommands"],
        },
      },
    },
    selecting: {
      always: { target: "idle" },
    },
    marqueeSelecting: {
      on: {
        UPDATE_MARQUEE: { actions: ["updateMarqueeBox", "emitCommands"] },
        COMMIT_MARQUEE: {
          target: "idle",
          actions: ["clearSession", "clearMarqueeBox", "emitCommands"],
        },
        CANCEL_GESTURE: {
          target: "idle",
          actions: ["emitCommands", "clearSession", "clearMarqueeBox"],
        },
        CANCEL: {
          target: "idle",
          actions: ["clearSession", "clearMarqueeBox"],
        },
        MOVE_GESTURE: { actions: "updateSessionPayload" },
      },
    },
    dragOverFiles: {
      on: {
        DRAG_FILES_LEAVE: {
          target: "idle",
          actions: ["setImportIdle", "emitCommands"],
        },
        DROP_FILES: {
          target: "importingFiles",
          actions: ["setImporting", "emitCommands"],
        },
        CANCEL_GESTURE: {
          target: "idle",
          actions: ["setImportIdle", "emitCommands"],
        },
      },
    },
    importingFiles: {
      on: {
        IMPORT_DONE: {
          target: "idle",
          actions: ["setImportDone", "emitCommands"],
        },
        IMPORT_FAILED: {
          target: "idle",
          actions: ["setImportFailed", "emitCommands"],
        },
        CANCEL_GESTURE: {
          target: "idle",
          actions: ["setImportIdle", "emitCommands"],
        },
      },
    },
    panning: {
      on: {
        POINTER_UP: { target: "idle", actions: "clearSession" },
        CANCEL: { target: "idle", actions: "clearSession" },
        COMMIT_GESTURE: { target: "idle", actions: "clearSession" },
        CANCEL_GESTURE: { target: "idle", actions: "clearSession" },
        MOVE_GESTURE: { actions: "updateSessionPayload" },
      },
    },
    draggingTransform: {
      on: {
        POINTER_UP: { target: "idle", actions: "clearSession" },
        CANCEL: { target: "idle", actions: "clearSession" },
        COMMIT_GESTURE: { target: "idle", actions: "clearSession" },
        CANCEL_GESTURE: { target: "idle", actions: "clearSession" },
        MOVE_GESTURE: { actions: "updateSessionPayload" },
      },
    },
    drawingBone: {
      on: {
        SET_TOOL: {
          target: "idle",
          actions: ["setTool", "emitCommands", "clearSession"],
        },
        SET_SELECTION_TARGET: {
          target: "idle",
          actions: ["setSelectionTarget", "emitCommands", "clearSession"],
        },
        POINTER_UP: { target: "idle", actions: "clearSession" },
        CANCEL: { target: "idle", actions: "clearSession" },
        COMMIT_GESTURE: { target: "idle", actions: "clearSession" },
        CANCEL_GESTURE: { target: "idle", actions: "clearSession" },
        MOVE_GESTURE: { actions: "updateSessionPayload" },
      },
    },
    editingMesh: {
      on: {
        POINTER_UP: { target: "idle", actions: "clearSession" },
        CANCEL: { target: "idle", actions: "clearSession" },
        COMMIT_GESTURE: { target: "idle", actions: "clearSession" },
        CANCEL_GESTURE: { target: "idle", actions: "clearSession" },
        MOVE_GESTURE: { actions: "updateSessionPayload" },
        EXIT_MESH_EDIT: { target: "idle", actions: "clearSession" },
      },
    },
    weightPainting: {
      on: {
        POINTER_UP: { target: "idle", actions: "clearSession" },
        CANCEL: { target: "idle", actions: "clearSession" },
        COMMIT_GESTURE: { target: "idle", actions: "clearSession" },
        CANCEL_GESTURE: { target: "idle", actions: "clearSession" },
        MOVE_GESTURE: { actions: "updateSessionPayload" },
      },
    },
    editingRig: {
      on: {
        EXIT_RIG: { target: "idle", actions: "clearSession" },
        POINTER_UP: { target: "idle", actions: "clearSession" },
        CANCEL: { target: "idle", actions: "clearSession" },
        COMMIT_GESTURE: { target: "idle", actions: "clearSession" },
        CANCEL_GESTURE: { target: "idle", actions: "clearSession" },
        MOVE_GESTURE: { actions: "updateSessionPayload" },
      },
    },
    editingGizmo: {
      on: {
        POINTER_UP: { target: "idle", actions: "clearSession" },
        CANCEL: { target: "idle", actions: "clearSession" },
        COMMIT_GESTURE: { target: "idle", actions: "clearSession" },
        CANCEL_GESTURE: { target: "idle", actions: "clearSession" },
        MOVE_GESTURE: { actions: "updateSessionPayload" },
      },
    },
  },
});
