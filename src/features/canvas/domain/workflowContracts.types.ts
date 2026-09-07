import type { ProjectDocument } from "@kukla2d/contracts";

import type { GestureSession } from "./gestureSession.types.js";
import type { Draft } from "immer";

export interface ScreenRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface ModifierState {
  altKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
  metaKey: boolean;
}

type WorkflowSelectionTargetValue = "all" | "element" | "rig";
type WorkflowImportStatus =
  "idle" | "dragOver" | "importing" | "done" | "failed";
type GesturePayload = Record<string, unknown>;

export type WorkflowEvent =
  | { type: "POINTER_DOWN"; intent: string; partId?: string }
  | {
      type:
        | "POINTER_UP"
        | "CANCEL"
        | "CYCLE_SELECTION_TARGET"
        | "ENTER_MESH_EDIT"
        | "EXIT_MESH_EDIT"
        | "ENTER_RIG"
        | "EXIT_RIG"
        | "COMMIT_GESTURE"
        | "CANCEL_GESTURE"
        | "CLEAR_SELECTION"
        | "COMMIT_MARQUEE"
        | "DRAG_FILES_ENTER"
        | "DRAG_FILES_LEAVE"
        | "DROP_FILES"
        | "IMPORT_DONE"
        | "IMPORT_FAILED"
        | "ENTER_WEIGHT_PAINT"
        | "EXIT_WEIGHT_PAINT";
    }
  | { type: "SET_TOOL"; tool: string }
  | { type: "SET_SELECTION_TARGET"; target: WorkflowSelectionTargetValue }
  | { type: "SET_RIGGING_MODE"; riggingMode: string }
  | { type: "SET_TOOL_MODE"; toolMode: string }
  | { type: "SET_RIGGING_TOOL"; riggingTool: string }
  | { type: "SET_MESH_SUBMODE"; meshSubMode: string }
  | {
      type:
        | "START_PAN"
        | "START_TRANSFORM_DRAG"
        | "START_MESH_BRUSH"
        | "START_WEIGHT_PAINT"
        | "START_DRAW_BONE"
        | "START_VERTEX_DRAG"
        | "START_GIZMO_MOVE"
        | "START_GIZMO_ROTATE"
        | "START_GIZMO_PIVOT"
        | "START_SKELETON_JOINT"
        | "START_SKELETON_BONE"
        | "START_SKELETON_TRACKPAD"
        | "START_SKELETON_ROTATE";
      payload?: GesturePayload;
    }
  | { type: "MOVE_GESTURE"; payload: GesturePayload }
  | { type: "SELECT_HIT"; partId: string; replace?: boolean }
  | {
      type: "SELECT_RIG_HIT";
      boneIds: string[];
      elementIds?: string[] | undefined;
      constraintIds?: string[] | undefined;
      activeBoneId: string | null;
      activeConstraintId?: string | null | undefined;
      anchor?: string | null | undefined;
    }
  | {
      type: "START_MARQUEE";
      origin: { x: number; y: number };
      target?: WorkflowSelectionTargetValue;
      modifiers?: Partial<ModifierState>;
    }
  | { type: "UPDATE_MARQUEE"; box: ScreenRect };

export interface EditorWorkflowState {
  activeTool: string;
  selectionTarget: WorkflowSelectionTargetValue;
  lastNonRigSelectionTarget: WorkflowSelectionTargetValue | null;
  riggingMode: string;
  riggingTool: string;
  toolMode: string;
  meshEditMode: boolean;
  meshSubMode: string;
  weightPaintMode: boolean;
  activeSession: GestureSession | null;
  marqueeBox: ScreenRect | null;
  importStatus: WorkflowImportStatus;
}

interface ProjectVersionCounters {
  geometryVersion: number;
  transformVersion: number;
  textureVersion: number;
}

export type ProjectMutator = (
  project: Draft<ProjectDocument>,
  versionControl: Draft<ProjectVersionCounters>,
) => void;

type WorkflowEditorInteractionValue =
  | { kind: "idle" }
  | { kind: "pendingAssignBone"; boneId?: string; candidateNodeIds?: string[] }
  | { kind: "pendingPickIKBone"; constraintId: string; error?: string }
  | { kind: "pendingSuggestIKBone"; constraintId: string; boneId: string }
  | { kind: "ikNotice" | "canvasNotice"; message: string }
  | { kind: "pendingPickAutoMotionPart"; role: string }
  | {
      kind: "pendingPickAutoMotionPoint";
      role: string;
      targetNodeId: string | null;
    }
  | {
      kind: "autoMotionPickResult";
      role: string;
      nodeId: string;
      localPoint: { x: number; y: number };
      worldPoint: { x: number; y: number };
    };

export type EditorCommand =
  | { type: "setSelection"; payload: { ids: string[] }; sessionId?: number }
  | {
      type: "clearSelection";
      payload: { target?: WorkflowSelectionTargetValue };
      sessionId?: number;
    }
  | {
      type: "setRigSelection";
      payload: {
        boneIds?: string[] | undefined;
        elementIds?: string[] | undefined;
        constraintIds?: string[] | undefined;
        activeBoneId?: string | null | undefined;
        activeConstraintId?: string | null | undefined;
        anchor?: string | null | undefined;
      };
      sessionId?: number;
    }
  | {
      type: "setMarquee";
      payload: { box: ScreenRect | null };
      sessionId?: number;
    }
  | {
      type: "setDrawBonePreview";
      payload: {
        preview?: {
          startX: number;
          startY: number;
          endX: number;
          endY: number;
        } | null;
      };
      sessionId?: number;
    }
  | {
      type: "setInteraction";
      payload: { interaction?: WorkflowEditorInteractionValue | null };
      sessionId?: number;
    }
  | {
      type: "beginBatch";
      payload: { meta?: Record<string, unknown> | null };
      sessionId?: number;
    }
  | { type: "endBatch"; payload: Record<never, never>; sessionId?: number }
  | {
      type: "updateProject" | "autoKeyframe";
      payload: { mutator: ProjectMutator };
      sessionId?: number;
    }
  | {
      type: "updatePixiPreview" | "uploadPreview";
      payload: { overrides: Record<string, unknown> };
      sessionId?: number;
    }
  | {
      type: "uploadPixiResource";
      payload: { id: string; blob: Blob };
      sessionId?: number;
    }
  | {
      type: "markDirty" | "importFiles";
      payload: Record<string, unknown>;
      sessionId?: number;
    }
  | {
      type: "setHover";
      payload: { hit?: string | null; source?: "canvas" | "panel" };
      sessionId?: number;
    }
  | { type: "applyWorkflowUi"; payload: WorkflowUiPayload; sessionId?: number };

interface WorkflowUiPayload {
  showSkeleton?: boolean;
  clearRigFocus?: boolean;
  clearSelection?: boolean;
  clearHover?: boolean;
  clearBlendShape?: boolean;
  finishExportAreaMove?: boolean;
  resetRigOverlays?: boolean;
}
