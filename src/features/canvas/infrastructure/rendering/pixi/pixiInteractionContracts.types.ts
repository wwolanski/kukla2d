import type {
  Bone,
  Mesh,
  Node,
  ProjectDocument,
  Vertex,
} from "@kukla2d/contracts";

import type { PoseOverrides } from "@/domain/animationEngine.types.js";

import type { PixiPerformanceCounters } from "@/features/canvas/domain/pixiPerformanceMetrics.types.js";
import type {
  EditorCommand,
  ProjectMutator,
  WorkflowEvent,
} from "@/features/canvas/domain/workflowContracts.types.js";

import type { PixiViewportBridge } from "./PixiViewportBridge.js";
import type {
  CanvasAnimationRuntimePort,
  CanvasDraftPoseValue,
} from "../../../application/canvasRenderer.types.js";
import type { Container } from "pixi.js";
import type { RefObject } from "react";

type WorkflowEditorInteraction =
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

export interface EditorRuntimePort {
  activeTool?: string;
  toolMode?: string;
  riggingTool?: string;
  selection: string[];
  selectionTarget?: "all" | "element" | "rig";
  rigSelectionAnchor: string | null;
  activeBoneId: string | null;
  activeConstraintId: string | null;
  activeBlendShapeId: string | null;
  exportAreaMoveMode: boolean;
  interaction: WorkflowEditorInteraction | null;
  view: { zoom: number; panX: number; panY: number };
  weightPaintMode?: boolean;
  weightPaintBoneId: string | null;
  weightPaintStrength: number;
  weightPaintBrushMode: "add" | "subtract" | "replace" | "smooth";
  weightPaintTargetValue: number;
  brushSize: number;
  brushHardness: number;
  meshEditMode?: boolean;
  meshSubMode?: string;
  blendShapeEditMode: boolean;
  skeletonEditMode: boolean;
  drawBoneChainMode: boolean;
  drawBoneAutoAssign: boolean;
  drawBoneAutoAssignMode: "smart" | "classic";
  editorMode: "staging" | "animation";
  autoKeyframe: boolean;
  hoverHit: string | null;
  hoverSource: "canvas" | "panel" | null;
}

export interface PointerInput {
  button?: number;
  clientX: number;
  clientY: number;
  altKey?: boolean;
  ctrlKey?: boolean;
  shiftKey?: boolean;
  metaKey?: boolean;
  global?: { x: number; y: number };
  nativeEvent?: unknown;
  originalEvent?: unknown;
  stopPropagation?(): void;
}

export interface FramePoseSnapshot {
  poseOverrides: PoseOverrides | null;
  effectiveNodes: Node[];
  effectiveBones: Bone[];
  preLinkedNodes?: Node[];
}

export interface PixiInteractionSystemOptions {
  viewportBridge: PixiViewportBridge;
  overlayLayer: Container;
  projectRef: RefObject<ProjectDocument>;
  editorRef: RefObject<EditorRuntimePort>;
  animationRef: RefObject<CanvasAnimationRuntimePort>;
  updateProject: (mutator: ProjectMutator) => void;
  setSelection: (ids: string[]) => void;
  markDirty: () => void;
  workflowActor: {
    send(event: WorkflowEvent): unknown;
  };
  metrics?: PixiPerformanceCounters;
  imageDataByPartId?: Map<string, ImageData>;
  executeCommand: (command: EditorCommand) => void;
  uploadMesh: (partId: string, mesh: Mesh) => void;
  uploadPositions: (
    partId: string,
    vertices: Vertex[],
    uvs?: ArrayLike<number>,
  ) => void;
  animationAuthoringAdapter?: {
    beginGesture(): string;
    previewPartial(
      targetId: string,
      partial: CanvasDraftPoseValue,
      meta?: Record<string, unknown>,
    ): unknown;
    commitGesture(meta?: Record<string, unknown>): void;
    endGesture(): void;
    cancelGesture(): void;
  } | null;
}
