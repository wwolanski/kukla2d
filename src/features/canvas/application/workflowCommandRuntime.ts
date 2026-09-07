/**
 * Workflow command runtime — application-layer executor for EditorCommand effects.
 *
 * Translates EditorCommand (pure domain) into concrete store/runtime calls.
 * Handles undo batch wrapping for document mutations.
 *
 * C2: no domain/** imports of React/Zustand/DOM/Pixi.
 */
import type { EditorStore } from "@/store/editorStoreTypes.types.js";
import type { ProjectStore } from "@/store/project/projectStoreTypes.types.js";
import { beginBatch, endBatch } from "@/store/undoHistory";

import type { EditorCommand } from "@/features/canvas/domain/workflowContracts.types.js";

import type { StoreApi } from "zustand";

interface CommandDeps {
  editorStore: StoreApi<EditorStore>;
  projectStore: StoreApi<ProjectStore>;
  pixiRuntime: {
    uploadResource?: (id: string, blob: Blob) => void;
    updatePreview?: (overrides: Record<string, unknown>) => void;
  } | null;
  editorMode: EditorStore["editorMode"] | undefined;
}

/**
 * @typedef {{
 *   editorStore: import('@/store/editorStore').UseEditorStore,
 *   projectStore: import('@/store/projectStore').UseProjectStore,
 *   pixiRuntime: import('./workflowCommandRuntime.js').PixiRuntime | null,
 *   editorMode: string,
 * }} CommandDeps
 */

/**
 * @typedef {{
 *   uploadResource?: (id: string, blob: Blob) => void,
 *   updatePreview?: (overrides: Record<string, unknown>) => void,
 * }} PixiRuntime
 */

/**
 * Execute a single EditorCommand against the provided dependencies.
 *
 * @param {import('@/features/canvas/domain/workflowContracts.types.js').EditorCommand} command
 * @param {CommandDeps} deps
 */
export function executeCommand(
  command: EditorCommand,
  deps: CommandDeps,
): void {
  const {
    editorStore,
    projectStore,
    pixiRuntime: injectedPixi,
    editorMode,
  } = deps;
  const pixiRuntime = injectedPixi;
  const { type, payload } = command;

  switch (type) {
    case "setSelection": {
      const ids = payload.ids ?? [];
      editorStore.getState().setElementSelection(ids);
      break;
    }

    case "clearSelection": {
      const editorState = editorStore.getState();
      if (payload.target === "rig") {
        editorState.clearRigSelection();
      } else {
        editorState.setElementSelection([]);
      }
      break;
    }

    case "setRigSelection": {
      editorStore.getState().setRigSelection({
        elementIds: payload.elementIds ?? [],
        boneIds: payload.boneIds ?? [],
        constraintIds: payload.constraintIds ?? [],
        activeBoneId: payload.activeBoneId ?? null,
        activeConstraintId: payload.activeConstraintId ?? null,
      });
      if (payload.anchor !== undefined) {
        editorStore.getState().setRigSelectionAnchor(payload.anchor);
      }
      break;
    }

    case "setMarquee": {
      editorStore.getState().setMarqueeBox(payload.box ?? null);
      break;
    }

    case "setDrawBonePreview": {
      editorStore.getState().setDrawBonePreview(payload.preview ?? null);
      break;
    }

    case "setInteraction": {
      editorStore.getState().setInteraction(payload.interaction ?? null);
      break;
    }

    case "beginBatch": {
      const project = projectStore.getState().project;
      const meta = payload.meta;
      beginBatch(
        project,
        meta && (typeof meta.name === "string" || typeof meta.type === "string")
          ? {
              ...(typeof meta.name === "string" ? { name: meta.name } : {}),
              ...(typeof meta.type === "string" ? { type: meta.type } : {}),
            }
          : null,
      );
      break;
    }

    case "endBatch": {
      endBatch();
      break;
    }

    case "updateProject": {
      const mutator = payload.mutator;
      if (typeof mutator === "function") {
        projectStore.getState().updateProject(mutator);
      }
      break;
    }

    case "updatePixiPreview": {
      pixiRuntime?.updatePreview?.(payload.overrides ?? {});
      break;
    }

    case "uploadPixiResource": {
      pixiRuntime?.uploadResource?.(payload.id, payload.blob);
      break;
    }

    case "markDirty": {
      projectStore.getState().setHasUnsavedChanges(true);
      break;
    }

    case "autoKeyframe": {
      if (editorMode === "animation") {
        projectStore.getState().updateProject(payload.mutator);
      }
      break;
    }

    case "setHover": {
      editorStore
        .getState()
        .setHoverHit(payload.hit ?? null, payload.source ?? "canvas");
      break;
    }

    case "applyWorkflowUi": {
      editorStore.setState((state: EditorStore) => ({
        ...(payload.showSkeleton ? { showSkeleton: true } : {}),
        ...(payload.clearRigFocus
          ? {
              activeBoneId: null,
              activeConstraintId: null,
              rigSelectionAnchor: null,
            }
          : {}),
        ...(payload.clearSelection ? { selection: [] } : {}),
        ...(payload.clearHover ? { hoverHit: null, hoverSource: null } : {}),
        ...(payload.finishExportAreaMove ? { exportAreaMoveMode: false } : {}),
        ...(payload.clearBlendShape
          ? {
              blendShapeEditMode: false,
              activeBlendShapeId: null,
            }
          : {}),
        ...(payload.resetRigOverlays
          ? {
              skeletonEditMode: false,
              overlays: {
                ...state.overlays,
                showImage: true,
                showWireframe: false,
                showVertices: false,
                showEdgeOutline: false,
              },
            }
          : {}),
        interaction: { kind: "idle" },
      }));
      break;
    }

    case "uploadPreview": {
      if (
        payload.overrides &&
        typeof pixiRuntime?.updatePreview === "function"
      ) {
        pixiRuntime.updatePreview(payload.overrides);
      }
      break;
    }

    case "importFiles": {
      break;
    }

    default: {
      const exhaustive: never = type;
      throw new Error(
        `[EditorCommandExecutor] Unknown command type: ${JSON.stringify(exhaustive)}`,
      );
    }
  }
}

/**
 * Execute a batch of commands. Wraps document mutations in beginBatch/endBatch.
 *
 * @param {Array<import('@/features/canvas/domain/workflowContracts.types.js').EditorCommand>} commands
 * @param {CommandDeps} deps
 */
export function executeCommandBatch(
  commands: readonly EditorCommand[],
  deps: CommandDeps,
): void {
  const hasDocumentMutation = commands.some(
    (command) =>
      command.type === "updateProject" || command.type === "autoKeyframe",
  );

  if (hasDocumentMutation) {
    const project = deps.projectStore.getState().project;
    beginBatch(project, { name: "workflow batch", type: "batch" });
  }

  try {
    for (const cmd of commands) {
      executeCommand(cmd, deps);
    }
  } finally {
    if (hasDocumentMutation) {
      endBatch();
    }
  }
}
