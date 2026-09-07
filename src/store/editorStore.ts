import { create } from "zustand";

import { CANVAS_DEFAULTS } from "@/features/canvas";
import { BONE_TOOL_DEFAULTS } from "@/features/rigging";

import { editorSelectors } from "./editorStoreTypes.js";

import type { EditorActions, EditorStore } from "./editorStoreTypes.types.js";

type DrawBoneAutoAssignMode = "smart" | "classic";
type WeightPaintBrushMode = "add" | "subtract" | "replace" | "smooth";
type EditorState = Omit<EditorStore, keyof EditorActions>;

const DRAW_BONE_AUTO_ASSIGN_MODES = new Set<DrawBoneAutoAssignMode>([
  "smart",
  "classic",
]);
const WEIGHT_PAINT_BRUSH_MODES = new Set<WeightPaintBrushMode>([
  "add",
  "subtract",
  "replace",
  "smooth",
]);

function isDrawBoneAutoAssignMode(
  value: unknown,
): value is DrawBoneAutoAssignMode {
  return (
    typeof value === "string" &&
    DRAW_BONE_AUTO_ASSIGN_MODES.has(value as DrawBoneAutoAssignMode)
  );
}

function isWeightPaintBrushMode(value: unknown): value is WeightPaintBrushMode {
  return (
    typeof value === "string" &&
    WEIGHT_PAINT_BRUSH_MODES.has(value as WeightPaintBrushMode)
  );
}

/**
 * Editor store — single source of truth for editor UI state.
 *
 * State is organised into logical slices. Each slice is documented below.
 * Selectors that are read on hot paths (e.g. every pointer move) are exposed
 * as named hooks so callers can subscribe with stable references and avoid
 * re-rendering the whole tree on every update.
 *
 * Slices:
 *   - selection:  nodeIds selection, hover hit, active bone/constraint/blend-shape
 *   - mode:       active tool, tool sub-mode, selection target (element/rig),
 *                 rigging mode, mesh edit, weight paint, blend shape, skeleton edit
 *   - view:       viewport zoom/pan
 *   - layers:     which layer tab is active, expanded groups
 *   - overlays:   per-scene overlay toggles, mesh generation defaults
 *   - interaction: current interaction (idle / pending assign / etc.) — a
 *                  discriminated union, never mutating in place
 *
 * The store stays a single zustand store (not split) so that:
 *   - cross-slice actions (e.g. switching tool clears selection) stay atomic
 *   - all consumers keep using `useEditorStore(selector)` the same way
 *   - undo/redo doesn't have to know about store boundaries
 */

/* ─────────────────────────────────────────────────────────────────────────── */
/*  Slices — initial state only                                              */
/* ─────────────────────────────────────────────────────────────────────────── */

const selectionSlice = (): Pick<
  EditorState,
  | "selection"
  | "hoverHit"
  | "hoverSource"
  | "activeBoneId"
  | "activeConstraintId"
  | "armedParameterId"
  | "activeBlendShapeId"
  | "rigSelectionAnchor"
> => ({
  /** IDs of currently selected nodes (parts, groups, warp deformers, bones). */
  selection: [],
  /** ID under the cursor in the last pointer-move (for hover highlight). */
  hoverHit: null,
  /** Surface that owns hoverHit: canvas (passive) or panel (explicit). */
  hoverSource: null,
  /** Currently focused bone (when in rig mode). */
  activeBoneId: null,
  /** Currently focused IK constraint. */
  activeConstraintId: null,
  /** Parameter currently being scrubbed (drag-to-edit). */
  armedParameterId: null,
  /** Blend shape currently being edited (when blendShapeEditMode is on). */
  activeBlendShapeId: null,
  /**
   * Anchor bone id used as the range origin for Shift multi-select on the
   * workspace. Set when the user starts a Shift range; cleared when they
   * switch to a non-rig target.
   */
  rigSelectionAnchor: null,
});

const modeSlice = (): Pick<
  EditorState,
  | "drawBoneChainMode"
  | "drawBoneAutoAssign"
  | "drawBoneAutoAssignMode"
  | "weightPaintBoneId"
  | "weightPaintStrength"
  | "weightPaintBrushMode"
  | "weightPaintTargetValue"
  | "brushSize"
  | "brushHardness"
  | "blendShapeEditMode"
  | "showSkeleton"
  | "skeletonEditMode"
  | "editorMode"
  | "autoKeyframe"
> => ({
  /** Draw mode links each new bone to the previous/active bone when true. */
  drawBoneChainMode: BONE_TOOL_DEFAULTS.chainMode,
  /** Auto-assign drawn bones to image parts when true. */
  drawBoneAutoAssign: BONE_TOOL_DEFAULTS.autoAssign,
  /** Auto-assign mode: 'smart' (coverage-based) or 'classic' (all hits). */
  drawBoneAutoAssignMode: isDrawBoneAutoAssignMode(
    BONE_TOOL_DEFAULTS.autoAssignMode,
  )
    ? BONE_TOOL_DEFAULTS.autoAssignMode
    : "smart",
  /** Currently selected bone for weight painting. */
  weightPaintBoneId: null,
  /** Strength multiplier for weight paint. */
  weightPaintStrength: 1,
  /** Brush mode for weight painting: add | subtract | replace | smooth. */
  weightPaintBrushMode: "add",
  /** Target weight used in replace mode. */
  weightPaintTargetValue: 1,
  /** Brush diameter in screen pixels. */
  brushSize: 30,
  /** Brush falloff hardness in normalized [0, 1] range. */
  brushHardness: 1,
  /** Editing a blend shape's deltas. */
  blendShapeEditMode: false,
  /** Skeleton overlay is visible. */
  showSkeleton: true,
  /** Skeleton joints are draggable to reposition pivots. */
  skeletonEditMode: false,
  /** Animation vs staging mode. */
  editorMode: "staging", // 'staging' | 'animation'
  /** Auto-create keyframe when anim-mode property changes. */
  autoKeyframe: true,
});

const viewSlice = (): Pick<
  EditorState,
  "view" | "canvasBackground" | "dragState"
> => ({
  view: {
    zoom: 1,
    panX: 0,
    panY: 0,
  },
  canvasBackground: CANVAS_DEFAULTS.canvasBackground,
  dragState: {
    isDragging: false,
    partId: null,
    vertexIndex: null,
  },
});

const layersSlice = (): Pick<
  EditorState,
  "activeLayerTab" | "expandedGroups"
> => ({
  /** Which tab in the layers panel is active. */
  activeLayerTab: "library", // 'library' | 'depth' | 'groups'
  /** Group IDs expanded in the Groups tab. */
  expandedGroups: new Set(),
});

const overlaySlice = (): Pick<
  EditorState,
  | "overlays"
  | "meshDefaults"
  | "showExportArea"
  | "exportAreaMoveMode"
  | "exportAreaPopoverRequest"
> => ({
  /** Per-scene overlay toggles. */
  overlays: {
    showImage: true,
    showWireframe: false,
    showVertices: false,
    showEdgeOutline: false,
    irisClipping: true,
  },
  /** Default mesh generation parameters (used when no per-part override). */
  meshDefaults: {
    alphaThreshold: 5,
    smoothPasses: 0,
    gridSpacing: 30,
    edgePadding: 8,
    numEdgePoints: 80,
  },
  /** Export Area overlay visibility (session-only, not persisted). */
  showExportArea: false,
  /** Pointer mode for moving the persisted export rectangle. */
  exportAreaMoveMode: false,
  /** Monotonic request used to reopen the Export Area popover after Save. */
  exportAreaPopoverRequest: 0,
});

const interactionSlice = (): Pick<
  EditorState,
  "interaction" | "marqueeBox" | "drawBonePreview"
> => ({
  /**
   * Discriminated union describing the user's current interaction context.
   * `kind === 'idle'` means no in-flight interaction. Other kinds include:
   *   - 'pendingAssignBone' { boneId, candidateNodeIds }
   *   - 'pendingAttach' / etc. as the app grows.
   * Keep this small and JSON-serialisable so it's safe to log/debug.
   */
  interaction: { kind: "idle" },
  /** Active marquee selection rectangle in screen space, {x,y,w,h} or null. */
  marqueeBox: null,
  /** Transient bone currently being drawn, or null outside an active gesture. */
  drawBonePreview: null,
});

const sessionSlice = (): Pick<
  EditorState,
  "editorStarted" | "interactionOwner"
> => ({
  editorStarted: true,
  interactionOwner: null,
});

function createEditorInitialState(): EditorState {
  return {
    ...selectionSlice(),
    ...modeSlice(),
    ...viewSlice(),
    ...layersSlice(),
    ...overlaySlice(),
    ...interactionSlice(),
    ...sessionSlice(),
  };
}

/* ─────────────────────────────────────────────────────────────────────────── */
/*  The store                                                                */
/* ─────────────────────────────────────────────────────────────────────────── */

export const useEditorStore = create<EditorStore>()((set) => ({
  ...createEditorInitialState(),

  /* ── Selection ───────────────────────────────────────────────────────── */

  /**
   * Replace the selection. Also exits blend shape edit unless
   * the user re-selects the *same* part they were editing.
   */
  setSelection: (nodeIds) =>
    set((state) => {
      const sameHead = nodeIds.length > 0 && nodeIds[0] === state.selection[0];
      return {
        selection: nodeIds,
        interaction: { kind: "idle" },
        blendShapeEditMode: sameHead ? state.blendShapeEditMode : false,
        activeBlendShapeId: sameHead ? state.activeBlendShapeId : null,
      };
    }),

  clearSelection: () =>
    set({
      selection: [],
      activeBoneId: null,
      activeConstraintId: null,
      rigSelectionAnchor: null,
      interaction: { kind: "idle" },
    }),

  /**
   * Element-target selection. Atomic for part / group ids. Clears leftover
   * rig focus; mixed selection is created through `setRigSelection`.
   */
  setElementSelection: (nodeIds) =>
    set((state) => {
      const ids = Array.isArray(nodeIds) ? nodeIds : [];
      const sameHead = ids.length > 0 && ids[0] === state.selection[0];
      return {
        selection: ids,
        activeBoneId: null,
        activeConstraintId: null,
        rigSelectionAnchor: null,
        interaction: { kind: "idle" },
        blendShapeEditMode: sameHead ? state.blendShapeEditMode : false,
        activeBlendShapeId: sameHead ? state.activeBlendShapeId : null,
      };
    }),

  /**
   * Rig or ALL-target selection. Workflow mode remains owned by XState.
   *
   * @param {object} args
   * @param {string[]} [args.elementIds]
   * @param {string[]} [args.boneIds]
   * @param {string[]} [args.constraintIds]
   * @param {string|null} [args.activeBoneId]
   * @param {string|null} [args.activeConstraintId]
   */
  setRigSelection: ({
    elementIds = [],
    boneIds = [],
    constraintIds = [],
    activeBoneId = null,
    activeConstraintId = null,
  } = {}) =>
    set(() => {
      const ids = [...elementIds, ...boneIds, ...constraintIds];
      return {
        selection: ids,
        activeBoneId: activeBoneId ?? boneIds.at(-1) ?? null,
        activeConstraintId: activeConstraintId ?? constraintIds.at(-1) ?? null,
        showSkeleton: true,
        blendShapeEditMode: false,
        activeBlendShapeId: null,
        interaction: { kind: "idle" },
      };
    }),

  /** Drop every rig-side selection field. Selection is preserved as-is. */
  clearRigSelection: () =>
    set({
      activeBoneId: null,
      activeConstraintId: null,
      rigSelectionAnchor: null,
      selection: [],
      interaction: { kind: "idle" },
    }),

  /** Set the anchor bone used as the Shift-range origin. */
  setRigSelectionAnchor: (id) => set({ rigSelectionAnchor: id ?? null }),

  /** Set or clear the hover hit and its owning surface atomically. */
  setHoverHit: (hit, source = "canvas") =>
    set({
      hoverHit: hit,
      hoverSource: hit == null ? null : source,
    }),

  setArmedParameterId: (id) => set({ armedParameterId: id }),
  setActiveBoneId: (id) => set({ activeBoneId: id }),
  setActiveConstraintId: (id) => set({ activeConstraintId: id }),
  setMarqueeBox: (box) => set({ marqueeBox: box }),
  setDrawBonePreview: (preview) => set({ drawBonePreview: preview ?? null }),

  setDrawBoneChainMode: (on) => set({ drawBoneChainMode: !!on }),
  setDrawBoneAutoAssign: (on) => set({ drawBoneAutoAssign: !!on }),
  setDrawBoneAutoAssignMode: (mode) =>
    set({
      drawBoneAutoAssignMode: isDrawBoneAutoAssignMode(mode) ? mode : "smart",
    }),

  setWeightPaintBoneId: (id) => set({ weightPaintBoneId: id }),
  setWeightPaintStrength: (value) =>
    set({ weightPaintStrength: Math.max(0, Math.min(1, Number(value) || 0)) }),
  setWeightPaintBrushMode: (mode) =>
    set({
      weightPaintBrushMode: isWeightPaintBrushMode(mode) ? mode : "add",
    }),
  setWeightPaintTargetValue: (value) =>
    set({
      weightPaintTargetValue: Math.max(0, Math.min(1, Number(value) || 0)),
    }),

  setBrush: (partial) =>
    set((s) => ({
      brushSize: s.brushSize,
      brushHardness: s.brushHardness,
      ...partial,
    })),

  enterBlendShapeEditMode: (shapeId) =>
    set({
      blendShapeEditMode: true,
      activeBlendShapeId: shapeId,
    }),

  exitBlendShapeEditMode: () =>
    set({
      blendShapeEditMode: false,
      activeBlendShapeId: null,
    }),

  /* ── View ────────────────────────────────────────────────────────────── */

  setView: (view) => set((state) => ({ view: { ...state.view, ...view } })),

  setCanvasBackground: (bg) => set({ canvasBackground: bg }),

  setDragState: (ds) =>
    set((state) => ({ dragState: { ...state.dragState, ...ds } })),

  /* ── Layers ──────────────────────────────────────────────────────────── */

  setActiveLayerTab: (tab) => set({ activeLayerTab: tab }),

  toggleGroupExpand: (id) =>
    set((s) => {
      const next = new Set(s.expandedGroups);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return { expandedGroups: next };
    }),

  expandGroup: (id) =>
    set((s) => {
      if (s.expandedGroups.has(id)) return {};
      return { expandedGroups: new Set([...s.expandedGroups, id]) };
    }),

  setExpandedGroups: (ids) => set({ expandedGroups: new Set(ids) }),

  /* ── Overlays / mesh defaults ────────────────────────────────────────── */

  setShowExportArea: (on) =>
    set({
      showExportArea: !!on,
      ...(!on ? { exportAreaMoveMode: false } : {}),
    }),
  setExportAreaMoveMode: (on) =>
    set({
      exportAreaMoveMode: !!on,
      ...(on ? { showExportArea: true } : {}),
    }),
  requestExportAreaPopover: () =>
    set((state) => ({
      exportAreaPopoverRequest: state.exportAreaPopoverRequest + 1,
    })),

  setOverlays: (partial) =>
    set((state) => ({ overlays: { ...state.overlays, ...partial } })),
  setMeshDefaults: (partial) =>
    set((state) => ({ meshDefaults: { ...state.meshDefaults, ...partial } })),

  /* ── Editor mode (staging/animation) ─────────────────────────────────── */

  setEditorMode: (mode) =>
    set({ editorMode: mode, interaction: { kind: "idle" } }),
  setAutoKeyframe: (on) => set({ autoKeyframe: on }),

  setShowSkeleton: (on) =>
    set((state) => ({
      showSkeleton: on,
      skeletonEditMode: on ? state.skeletonEditMode : false,
    })),

  setSkeletonEditMode: (on) => set({ skeletonEditMode: on }),

  /* ── Interaction ─────────────────────────────────────────────────────── */

  setInteraction: (next) => set({ interaction: next ?? { kind: "idle" } }),

  /* ── Session ─────────────────────────────────────────────────────────── */

  startEditor: () => set({ editorStarted: true }),
  resetSession: () => set(createEditorInitialState()),

  setInteractionOwner: (owner) => set({ interactionOwner: owner }),
  clearInteractionOwner: (owner) =>
    set((state) =>
      state.interactionOwner === owner ? { interactionOwner: null } : {},
    ),
}));

type UseEditorStore = typeof useEditorStore;

/* ─────────────────────────────────────────────────────────────────────────── */
/*  Selector hooks — narrow subscriptions for hot paths.                     */
/*  Use these instead of `useEditorStore(s => s.someDeepObject.field)` to     */
/*  keep re-renders local.                                                    */
/* ─────────────────────────────────────────────────────────────────────────── */

export const useSelection = (): ReturnType<typeof editorSelectors.selection> =>
  useEditorStore(editorSelectors.selection);
export const useHoverHit = (): ReturnType<typeof editorSelectors.hoverHit> =>
  useEditorStore(editorSelectors.hoverHit);
export const useActiveBoneId = (): ReturnType<
  typeof editorSelectors.activeBoneId
> => useEditorStore(editorSelectors.activeBoneId);
export const useActiveConstraint = (): ReturnType<
  typeof editorSelectors.activeConstraintId
> => useEditorStore(editorSelectors.activeConstraintId);

export const useEditorMode = (): ReturnType<
  typeof editorSelectors.editorMode
> => useEditorStore(editorSelectors.editorMode);
export const useShowSkeleton = (): ReturnType<
  typeof editorSelectors.showSkeleton
> => useEditorStore(editorSelectors.showSkeleton);

export const useView = (): ReturnType<typeof editorSelectors.view> =>
  useEditorStore(editorSelectors.view);
export const useCanvasBackground = (): ReturnType<
  typeof editorSelectors.canvasBackground
> => useEditorStore(editorSelectors.canvasBackground);
export const useOverlays = (): ReturnType<typeof editorSelectors.overlays> =>
  useEditorStore(editorSelectors.overlays);
export const useInteraction = (): ReturnType<
  typeof editorSelectors.interaction
> => useEditorStore(editorSelectors.interaction);
export const useInteractionOwner = (): ReturnType<
  typeof editorSelectors.interactionOwner
> => useEditorStore(editorSelectors.interactionOwner);

/* ─────────────────────────────────────────────────────────────────────────── */
/*  Read-only snapshot — useful for pointer-move / picking hot paths that    */
/*  need a consistent view of the world without triggering React renders.    */
/* ─────────────────────────────────────────────────────────────────────────── */

export function readEditorState(): EditorStore {
  return useEditorStore.getState();
}

declare global {
  interface Window {
    __editorStore?: UseEditorStore;
  }
}

if (typeof window !== "undefined" && import.meta.env.DEV) {
  // Expose for devtools / debugging only. Tree-shaken in prod build.
  window.__editorStore = useEditorStore;
}
