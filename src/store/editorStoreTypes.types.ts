type HoverSource = "canvas" | "panel";
type EditorMode = "staging" | "animation";
type LayerTab = "library" | "depth" | "groups";
type InteractionOwner = "canvas" | "timeline";

interface ViewportState {
  zoom: number;
  panX: number;
  panY: number;
}

interface DragState {
  isDragging: boolean;
  partId: string | null;
  vertexIndex: number | null;
}

interface EditorOverlays {
  showImage: boolean;
  showWireframe: boolean;
  showVertices: boolean;
  showEdgeOutline: boolean;
  irisClipping: boolean;
}

interface MeshDefaults {
  alphaThreshold: number;
  smoothPasses: number;
  gridSpacing: number;
  edgePadding: number;
  numEdgePoints: number;
}

interface ScreenRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface CanvasPoint {
  x: number;
  y: number;
}

interface DrawBonePreview {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
}

type EditorInteraction =
  | { kind: "idle" }
  | { kind: "pendingAssignBone"; boneId?: string; candidateNodeIds?: string[] }
  | { kind: "pendingPickIKBone"; constraintId: string; error?: string }
  | { kind: "pendingSuggestIKBone"; constraintId: string; boneId: string }
  | { kind: "ikNotice"; message: string }
  | { kind: "canvasNotice"; message: string }
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
      localPoint: CanvasPoint;
      worldPoint: CanvasPoint;
    };

interface RigSelectionInput {
  elementIds?: string[];
  boneIds?: string[];
  constraintIds?: string[];
  activeBoneId?: string | null;
  activeConstraintId?: string | null;
}

interface EditorState {
  selection: string[];
  hoverHit: string | null;
  hoverSource: HoverSource | null;
  activeBoneId: string | null;
  activeConstraintId: string | null;
  armedParameterId: string | null;
  activeBlendShapeId: string | null;
  rigSelectionAnchor: string | null;
  drawBoneChainMode: boolean;
  drawBoneAutoAssign: boolean;
  drawBoneAutoAssignMode: "smart" | "classic";
  weightPaintBoneId: string | null;
  weightPaintStrength: number;
  weightPaintBrushMode: "add" | "subtract" | "replace" | "smooth";
  weightPaintTargetValue: number;
  brushSize: number;
  brushHardness: number;
  blendShapeEditMode: boolean;
  showSkeleton: boolean;
  skeletonEditMode: boolean;
  editorMode: EditorMode;
  autoKeyframe: boolean;
  view: ViewportState;
  canvasBackground: string;
  dragState: DragState;
  activeLayerTab: LayerTab;
  expandedGroups: Set<string>;
  overlays: EditorOverlays;
  meshDefaults: MeshDefaults;
  showExportArea: boolean;
  exportAreaMoveMode: boolean;
  exportAreaPopoverRequest: number;
  interaction: EditorInteraction;
  marqueeBox: ScreenRect | null;
  drawBonePreview: DrawBonePreview | null;
  editorStarted: boolean;
  interactionOwner: InteractionOwner | null;
}

export interface EditorActions {
  setSelection: (nodeIds: string[]) => void;
  clearSelection: () => void;
  setElementSelection: (nodeIds: string[]) => void;
  setRigSelection: (selection?: RigSelectionInput) => void;
  clearRigSelection: () => void;
  setRigSelectionAnchor: (id: string | null | undefined) => void;
  setHoverHit: (hit: string | null, source?: HoverSource) => void;
  setArmedParameterId: (id: string | null) => void;
  setActiveBoneId: (id: string | null) => void;
  setActiveConstraintId: (id: string | null) => void;
  setMarqueeBox: (box: ScreenRect | null) => void;
  setDrawBonePreview: (preview: DrawBonePreview | null | undefined) => void;
  setDrawBoneChainMode: (on: unknown) => void;
  setDrawBoneAutoAssign: (on: unknown) => void;
  setDrawBoneAutoAssignMode: (mode: unknown) => void;
  setWeightPaintBoneId: (id: string | null) => void;
  setWeightPaintStrength: (value: unknown) => void;
  setWeightPaintBrushMode: (mode: unknown) => void;
  setWeightPaintTargetValue: (value: unknown) => void;
  setBrush: (
    partial: Partial<Pick<EditorState, "brushSize" | "brushHardness">>,
  ) => void;
  enterBlendShapeEditMode: (shapeId: string) => void;
  exitBlendShapeEditMode: () => void;
  setView: (view: Partial<ViewportState>) => void;
  setCanvasBackground: (background: string) => void;
  setDragState: (dragState: Partial<DragState>) => void;
  setActiveLayerTab: (tab: LayerTab) => void;
  toggleGroupExpand: (id: string) => void;
  expandGroup: (id: string) => void;
  setExpandedGroups: (ids: Iterable<string>) => void;
  setShowExportArea: (on: unknown) => void;
  setExportAreaMoveMode: (on: unknown) => void;
  requestExportAreaPopover: () => void;
  setOverlays: (partial: Partial<EditorOverlays>) => void;
  setMeshDefaults: (partial: Partial<MeshDefaults>) => void;
  setEditorMode: (mode: EditorMode) => void;
  setAutoKeyframe: (on: boolean) => void;
  setShowSkeleton: (on: boolean) => void;
  setSkeletonEditMode: (on: boolean) => void;
  setInteraction: (interaction: EditorInteraction | null | undefined) => void;
  startEditor: () => void;
  resetSession: () => void;
  setInteractionOwner: (owner: InteractionOwner) => void;
  clearInteractionOwner: (owner: InteractionOwner) => void;
}

export type EditorStore = EditorState & EditorActions;
