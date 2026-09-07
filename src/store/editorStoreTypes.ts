import type { EditorStore } from "./editorStoreTypes.types.js";

export const editorSelectors = {
  selection: (state: EditorStore) => state.selection,
  hoverHit: (state: EditorStore) => state.hoverHit,
  activeBoneId: (state: EditorStore) => state.activeBoneId,
  activeConstraintId: (state: EditorStore) => state.activeConstraintId,
  editorMode: (state: EditorStore) => state.editorMode,
  showSkeleton: (state: EditorStore) => state.showSkeleton,
  view: (state: EditorStore) => state.view,
  canvasBackground: (state: EditorStore) => state.canvasBackground,
  overlays: (state: EditorStore) => state.overlays,
  interaction: (state: EditorStore) => state.interaction,
  interactionOwner: (state: EditorStore) => state.interactionOwner,
} as const;
