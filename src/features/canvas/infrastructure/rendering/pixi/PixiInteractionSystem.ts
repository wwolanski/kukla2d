import type { BoneId, Mesh, ProjectDocument, Vertex } from "@kukla2d/contracts";

import type { GizmoFrame } from "@/features/canvas/domain/gizmoFrame.types.js";
import type { PixiPerformanceCounters } from "@/features/canvas/domain/pixiPerformanceMetrics.types.js";
import type { buildSkeletonFrame } from "@/features/canvas/domain/skeletonFrame.js";
import type { WarpLatticeFrame } from "@/features/canvas/domain/warpLatticeFrame.types.js";
import type {
  EditorCommand,
  ProjectMutator,
  WorkflowEvent,
} from "@/features/canvas/domain/workflowContracts.types.js";

import { bindPixiInteractionRuntimeEvents } from "./bindPixiInteractionRuntimeEvents.js";
import {
  startBoneDrag,
  startBoneRotate,
  startBoneLength,
} from "./PixiBoneTransformDrag.js";
import { handleCanvasGestureCancel } from "./PixiCanvasGestures.js";
import { PixiGestureSnapshot } from "./pixiGestureSnapshot.js";
import {
  handleDragMove as _handleDragMoveImpl,
  handleDragEnd,
} from "./PixiInputDrag.js";
import {
  startMoveDrag,
  startRotateDrag,
  startPivotDrag,
  startResizeDrag,
  startSkeletonDrag,
} from "./PixiInputDragStart.js";
import {
  createGizmoHandles,
  createWarpHandles,
  createSkeletonHandles,
  clearHandles,
  removeListener,
} from "./PixiInputHandles.js";
import { getPointerClientPosition } from "./PixiPointerBounds.js";
import { startPoseHandleDrag } from "./PixiPoseGestures.js";
import { startWarpDrag } from "./PixiWarpGestures.js";

import type {
  EditorRuntimePort,
  FramePoseSnapshot,
  PixiInteractionSystemOptions,
  PointerInput,
} from "./pixiInteractionContracts.types.js";
import type {
  BoundListener,
  DragState,
} from "./pixiInteractionDragContracts.types.js";
import type { PoseHandleFrame } from "./PixiPoseGestures.types.js";
import type { PixiViewportBridge } from "./PixiViewportBridge.js";
import type {
  CanvasAnimationRuntimePort,
  CanvasDraftPoseValue,
} from "../../../application/canvasRenderer.types.js";
import type { Container, FederatedPointerEvent } from "pixi.js";
import type { RefObject } from "react";

interface WorkflowActor {
  send(event: WorkflowEvent): unknown;
}

interface AnimationAuthoringPort {
  beginGesture(): string;
  previewPartial(
    targetId: string,
    partial: CanvasDraftPoseValue,
    meta?: Record<string, unknown>,
  ): unknown;
  commitGesture(meta?: Record<string, unknown>): void;
  endGesture(): void;
  cancelGesture(): void;
}

type SkeletonFrame = NonNullable<ReturnType<typeof buildSkeletonFrame>>;

/**
 * PixiInteractionSystem — Pixi-only interaction runtime.
 * Requires a shared workflow actor ref and executeCommand from the application
 * layer; does NOT create a local XState actor or fallback command effects.
 */
export class PixiInteractionSystem {
  readonly viewportBridge: PixiViewportBridge;
  readonly overlayLayer: Container;
  readonly projectRef: RefObject<ProjectDocument>;
  readonly editorRef: RefObject<EditorRuntimePort>;
  readonly animationRef: RefObject<CanvasAnimationRuntimePort>;
  readonly updateProject: (mutator: ProjectMutator) => void;
  readonly setSelection: (ids: string[]) => void;
  readonly markDirty: () => void;
  readonly imageDataByPartId: Map<string, ImageData>;
  readonly executeCommand: (command: EditorCommand) => void;
  readonly uploadMesh: (partId: string, mesh: Mesh) => void;
  readonly uploadPositions: (
    partId: string,
    vertices: Vertex[],
    uvs?: ArrayLike<number>,
  ) => void;
  readonly animationAuthoringAdapter: AnimationAuthoringPort | null;
  _moveHandle: Container | null = null;
  _rotateHandle: Container | null = null;
  _pivotHandle: Container | null = null;
  _moveArea: Container | null = null;
  _resizeHandles: Container[] = [];
  _warpHandles: Container[] = [];
  _skeletonHandles: Container[] = [];
  _boneBodyHandle: Container | null = null;
  _boneRotateHandle: Container | null = null;
  _boneLengthHandle: Container | null = null;
  _poseHandle: Container | null = null;
  _dragState: DragState | null = null;
  _boundListeners: BoundListener[] = [];
  _eventDisposer: (() => void) | null = null;
  _pendingDragEvent: PointerInput | null = null;
  _dragMoveRaf: number | null = null;
  _previewPoseOverrides = new Map<string, CanvasDraftPoseValue>();
  _poseHandleExtensions = new Map<string, unknown>();
  _viewportDragPaused = false;
  _brushWorldPos: { x: number; y: number; visible: boolean } | null = null;
  _drawBonePreview: {
    startX: number;
    startY: number;
    endX: number;
    endY: number;
  } | null = null;
  private readonly _gestureSnapshot = new PixiGestureSnapshot();
  _framePose: FramePoseSnapshot | null = null;
  _commandBatchOpen = false;
  _workflowActor: WorkflowActor | null;
  readonly _metrics: PixiPerformanceCounters | null;

  constructor({
    viewportBridge,
    overlayLayer,
    projectRef,
    editorRef,
    animationRef,
    updateProject,
    setSelection,
    markDirty,
    workflowActor,
    metrics,
    imageDataByPartId,
    executeCommand,
    uploadMesh,
    uploadPositions,
    animationAuthoringAdapter,
  }: PixiInteractionSystemOptions) {
    if (!workflowActor) {
      throw new Error("PixiInteractionSystem requires a workflowActor ref");
    }
    if (!executeCommand) {
      throw new Error(
        "PixiInteractionSystem requires an executeCommand function",
      );
    }
    this.viewportBridge = viewportBridge;
    this.overlayLayer = overlayLayer;
    this.projectRef = projectRef;
    this.editorRef = editorRef;
    this.animationRef = animationRef;
    this.updateProject = updateProject;
    this.setSelection = setSelection;
    this.markDirty = markDirty;
    this.imageDataByPartId = imageDataByPartId ?? new Map<string, ImageData>();
    this.executeCommand = executeCommand;
    this.uploadMesh = uploadMesh;
    this.uploadPositions = uploadPositions;
    this.animationAuthoringAdapter = animationAuthoringAdapter ?? null;

    this._workflowActor = workflowActor;
    this._metrics = metrics ?? null;
  }

  updateHandles({
    gizmoFrame,
    warpFrame,
    skeletonFrame,
    zoom,
  }: {
    gizmoFrame?: GizmoFrame | null;
    warpFrame?: WarpLatticeFrame | null;
    skeletonFrame?: SkeletonFrame | null;
    zoom: number;
  }): void {
    const editor = this.editorRef.current;
    if (
      this._dragState?.type === "drawBone" &&
      editor?.activeTool !== "drawBone"
    ) {
      handleCanvasGestureCancel(this);
    }
    if (
      this._dragState?.type === "exportAreaMove" &&
      !editor?.exportAreaMoveMode
    ) {
      handleDragEnd(this);
    }
    if (this._dragState) return;
    clearHandles(this);
    if (
      editor?.interaction?.kind === "pendingPickIKBone" ||
      editor?.interaction?.kind === "pendingPickAutoMotionPart"
    )
      return;
    if (editor?.exportAreaMoveMode) return;
    if (gizmoFrame?.visible && editor?.activeTool !== "pose") {
      createGizmoHandles(this, gizmoFrame, zoom);
    }
    if (warpFrame?.visible && warpFrame.gridPoints?.length) {
      createWarpHandles(this, warpFrame, zoom);
    }

    const canTransformRig =
      ["transform", "pose"].includes(editor?.activeTool ?? "") &&
      ["all", "rig"].includes(editor?.selectionTarget ?? "");
    if (canTransformRig && skeletonFrame?.joints?.length) {
      createSkeletonHandles(this, skeletonFrame, zoom);
    }
  }

  readPreviewPoseOverrides(): Map<string, CanvasDraftPoseValue> | null {
    return this._previewPoseOverrides.size ? this._previewPoseOverrides : null;
  }

  readPoseHandleExtensions(): Map<string, unknown> {
    return this._poseHandleExtensions;
  }

  updateFramePose(framePose: FramePoseSnapshot | null): void {
    this._framePose = framePose;
  }

  readFramePose(): FramePoseSnapshot | null {
    return this._framePose;
  }

  isDragging(): boolean {
    return !!this._dragState;
  }

  getBrushWorldPos(): { x: number; y: number; visible: boolean } | null {
    return this._brushWorldPos;
  }

  getDrawBonePreview(): {
    startX: number;
    startY: number;
    endX: number;
    endY: number;
  } | null {
    return this._drawBonePreview;
  }

  _setPreviewPose(nodeId: string, partial: CanvasDraftPoseValue): void {
    const existing = this._previewPoseOverrides.get(nodeId) ?? {};
    this._previewPoseOverrides.set(nodeId, { ...existing, ...partial });
  }

  _clearPreviewPose(): void {
    this._previewPoseOverrides.clear();
  }

  _pauseViewportDrag(): void {
    if (this._viewportDragPaused) return;
    this.viewportBridge?.viewport?.plugins?.pause?.("drag");
    this._viewportDragPaused = true;
  }

  _resumeViewportDrag(): void {
    if (!this._viewportDragPaused) return;
    this.viewportBridge?.viewport?.plugins?.resume?.("drag");
    this._viewportDragPaused = false;
  }

  _setDragState(state: DragState): void {
    this._captureGestureSnapshot();
    this._dragState = state;
    this._pauseViewportDrag();
  }

  _captureGestureSnapshot(): void {
    this._gestureSnapshot.capture(this);
  }

  _restoreGestureSnapshot(): void {
    this._gestureSnapshot.restore(this);
  }

  _clearGestureSnapshot(): void {
    this._gestureSnapshot.clear();
  }

  _sendWorkflow(event: WorkflowEvent): void {
    if (this._workflowActor) this._workflowActor.send(event);
  }

  _executeCommand(command: EditorCommand): void {
    this.executeCommand(command);
  }

  _beginCommandBatch(meta: Record<string, unknown> | null): void {
    if (this._commandBatchOpen) return;
    this._commandBatchOpen = true;
    this._executeCommand({ type: "beginBatch", payload: { meta } });
  }

  _endCommandBatch(): void {
    if (!this._commandBatchOpen) return;
    this._commandBatchOpen = false;
    this._executeCommand({ type: "endBatch", payload: {} });
  }

  _eventWorldPosition(e: PointerInput): { x: number; y: number } | null {
    const canvas = this.viewportBridge?.app?.canvas;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const client: unknown = getPointerClientPosition(e, rect);
    if (
      !client ||
      typeof client !== "object" ||
      !("clientX" in client) ||
      typeof client.clientX !== "number" ||
      !("clientY" in client) ||
      typeof client.clientY !== "number"
    )
      return null;
    const { clientX, clientY } = client;
    if (typeof this.viewportBridge?.toWorld === "function") {
      return this.viewportBridge.toWorld(
        clientX - rect.left,
        clientY - rect.top,
      );
    }
    const view = this.editorRef.current?.view;
    const zoom = Math.max(view?.zoom || 1, 0.001);
    return {
      x: (clientX - rect.left - (view?.panX ?? 0)) / zoom,
      y: (clientY - rect.top - (view?.panY ?? 0)) / zoom,
    };
  }

  _startMoveDrag(e: PointerInput): void {
    startMoveDrag(this, e);
  }
  _startRotateDrag(e: PointerInput): void {
    startRotateDrag(this, e);
  }
  _startPivotDrag(e: PointerInput): void {
    startPivotDrag(this, e);
  }
  _startResizeDrag(
    e: PointerInput,
    cornerIndex: number,
    frame: Parameters<typeof startResizeDrag>[3],
  ): void {
    startResizeDrag(this, e, cornerIndex, frame);
  }
  _startWarpDrag(ptIndex: number): void {
    startWarpDrag(this, ptIndex);
  }
  _startSkeletonDrag(jointIndex: number): void {
    startSkeletonDrag(this, jointIndex);
  }
  _startBoneDrag(e: PointerInput, boneId: BoneId): void {
    startBoneDrag(this, e, boneId);
  }
  _startBoneRotate(e: PointerInput): void {
    startBoneRotate(this, e);
  }
  _startBoneLength(e: PointerInput): void {
    startBoneLength(this, e);
  }
  _startPoseHandleDrag(e: PointerInput, frame: PoseHandleFrame): void {
    startPoseHandleDrag(this, e, frame);
  }
  _onDragMove(e: PointerInput): void {
    _handleDragMoveImpl(this, e);
  }
  _onDragEnd(): void {
    handleDragEnd(this);
  }

  bind(): void {
    this._eventDisposer?.();
    this._eventDisposer = bindPixiInteractionRuntimeEvents(this);
  }

  _cancelGesture(): void {
    if (!this._dragState) return;
    if (handleCanvasGestureCancel(this)) return;
    if (this._dragMoveRaf !== null) {
      cancelAnimationFrame(this._dragMoveRaf);
      this._dragMoveRaf = null;
    }
    this._pendingDragEvent = null;
    this._restoreGestureSnapshot();
    if (this.animationAuthoringAdapter?.cancelGesture) {
      this.animationAuthoringAdapter.cancelGesture();
    }
    this._dragState = null;
    this._clearPreviewPose();
    this._resumeViewportDrag();
    this._endCommandBatch();
    this._sendWorkflow({ type: "CANCEL_GESTURE" });
    this.markDirty?.();
  }

  _updateBrushWorldPos(e: FederatedPointerEvent): void {
    const editorState = this.editorRef.current;
    const wantsBrush =
      editorState &&
      (editorState.weightPaintMode ||
        (editorState.meshEditMode && editorState.meshSubMode === "deform") ||
        editorState.blendShapeEditMode);
    if (!wantsBrush) {
      const hadBrush = this._brushWorldPos !== null;
      this._brushWorldPos = null;
      if (hadBrush) this.markDirty?.();
      return;
    }
    const pos = this._eventWorldPosition(e);
    if (pos) {
      this._brushWorldPos = { x: pos.x, y: pos.y, visible: true };
      this.markDirty?.();
    }
  }

  dispose(): void {
    this._cancelGesture();
    this._pendingDragEvent = null;
    this._clearPreviewPose();
    this._brushWorldPos = null;
    this._drawBonePreview = null;
    this._framePose = null;
    this._resumeViewportDrag();
    this._eventDisposer?.();
    this._eventDisposer = null;
    for (const entry of this._boundListeners) removeListener(entry);
    this._boundListeners = [];
    clearHandles(this);
    this._workflowActor = null;
  }
}
