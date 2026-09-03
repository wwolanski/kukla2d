import { useCallback, useEffect, useState } from 'react';

import { readRecovery } from '@/io/projectDb';

import { useAnimationStore } from '@/store/animationStore';
import { useEditorStore } from '@/store/editorStore';
import { useProjectStore } from '@/store/projectStore';

import type { DeleteSelectionIntent } from '@/domain/deleteCommands';
import { ACTION_IDS, editorModePolicy } from '@/domain/editorModePolicy';

import { toast } from '@/components/ui/use-toast';

import { useCanvasController } from './useCanvasController.js';
import { useExportAreaMoveSession } from './useExportAreaMoveSession.js';
import { bakeDefaultPoseIntoSetup } from '../domain/poseBake.js';





import type { Dispatch, RefObject, SetStateAction } from 'react';

type ImperativeRef = RefObject<unknown> | undefined;

interface CanvasImportHandle {
  openFilePicker(): void;
  importFiles: ReturnType<typeof useCanvasController>['import']['importFiles'];
  commitModularSprite: ReturnType<typeof useCanvasController>['import']['commitModularSprite'];
}

interface CanvasViewportControllerOptions {
  remeshRef?: ImperativeRef;
  deleteMeshRef?: ImperativeRef;
  saveRef?: ImperativeRef;
  loadRef?: ImperativeRef;
  resetRef?: ImperativeRef;
  exportCaptureRef?: ImperativeRef;
  thumbCaptureRef?: ImperativeRef;
  importRef?: RefObject<CanvasImportHandle | null>;
  confirmWipeOpen: boolean;
  setConfirmWipeOpen: Dispatch<SetStateAction<boolean>>;
  pendingFile: File | null;
  setPendingFile: Dispatch<SetStateAction<File | null>>;
  confirmDeleteOpen: boolean;
  setConfirmDeleteOpen: Dispatch<SetStateAction<boolean>>;
}
export interface CanvasViewportController {
  canvas: ReturnType<typeof useCanvasController>;
  deleteIntent: DeleteSelectionIntent | null;
  confirmDelete: () => void;
  recoveryArchive: Blob | null;
  resetPose: () => void;
  applyDefaultPose: () => void;
  saveExportAreaMove: () => void;
}

export function useCanvasViewportController({
  remeshRef,
  deleteMeshRef,
  saveRef,
  loadRef,
  resetRef,
  exportCaptureRef,
  thumbCaptureRef,
  importRef,
  confirmWipeOpen,
  setConfirmWipeOpen,
  pendingFile,
  setPendingFile,
  confirmDeleteOpen,
  setConfirmDeleteOpen,
}: CanvasViewportControllerOptions): CanvasViewportController {
  const [deleteIntent, setDeleteIntent] = useState<DeleteSelectionIntent | null>(null);
  const [recoveryArchive, setRecoveryArchive] = useState<Blob | null>(null);

  const requestDelete = useCallback(() => {
    const editor = useEditorStore.getState();
    const projectStore = useProjectStore.getState();
    const { project } = projectStore;
    const selection = editor.selection ?? [];
    const nodeIds = selection.filter(id => project.nodes.some(node => node.id === id));
    const boneIds = editor.activeBoneId
      ? [editor.activeBoneId, ...selection.filter(id => project.bones.some(bone => bone.id === id))]
      : selection.filter(id => project.bones.some(bone => bone.id === id));
    const constraintIds = editor.activeConstraintId
      ? [editor.activeConstraintId, ...selection.filter(id => project.constraints.some(constraint => constraint.id === id))]
      : selection.filter(id => project.constraints.some(constraint => constraint.id === id));

    const intent = projectStore.buildDeleteSelectionIntent({
      nodeIds: [...new Set(nodeIds)],
      boneIds: [...new Set(boneIds)],
      constraintIds: [...new Set(constraintIds)],
    });
    if (intent.isEmpty) return;

    if (boneIds.length > 0 || constraintIds.length > 0) {
      const decision = editorModePolicy({
        mode: editor.editorMode,
        actionId: ACTION_IDS.BONE_DELETE,
        targetKind: 'bone',
      });
      if (!decision.allowed) {
        toast({
          variant: 'destructive',
          title: 'Delete unavailable in Animation mode',
          description: 'Switch to Staging mode to delete bones or IK constraints.',
        });
        return;
      }
    }

    setDeleteIntent(intent);
    setConfirmDeleteOpen(true);
  }, [setConfirmDeleteOpen]);

  const canvas = useCanvasController({
    remeshRef,
    deleteMeshRef,
    saveRef,
    loadRef,
    resetRef,
    exportCaptureRef,
    thumbCaptureRef,
    setConfirmWipeOpen,
    pendingFile,
    setPendingFile,
    onRequestDelete: requestDelete,
  });

  const confirmDelete = useCallback(() => {
    if (!deleteIntent || deleteIntent.isEmpty) {
      setConfirmDeleteOpen(false);
      setDeleteIntent(null);
      return;
    }
    useProjectStore.getState().deleteSelection(deleteIntent);
    useEditorStore.getState().clearSelection();
    setConfirmDeleteOpen(false);
    setDeleteIntent(null);
  }, [deleteIntent, setConfirmDeleteOpen]);

  useEffect(() => {
    if (!canvas.canvasFailure) {
      setRecoveryArchive(null);
      return undefined;
    }
    let active = true;
    void readRecovery()
      .then(record => {
        if (active) setRecoveryArchive(record?.archive ?? null);
      })
      .catch(() => {
        if (active) setRecoveryArchive(null);
      });
    return () => {
      active = false;
    };
  }, [canvas.canvasFailure]);

  useEffect(() => {
    if (!importRef) return undefined;
    importRef.current = {
      openFilePicker: canvas.input.handlers.onPanelClick,
      importFiles: canvas.import.importFiles,
      commitModularSprite: canvas.import.commitModularSprite,
    };
    return () => {
      importRef.current = null;
    };
  }, [canvas.import.commitModularSprite, canvas.import.importFiles, canvas.input.handlers.onPanelClick, importRef]);

  const resetPose = useCallback(() => {
    const projectStore = useProjectStore.getState();
    if (Object.keys(projectStore.project.defaultPose).length > 0) {
      projectStore.updateProject(project => {
        project.defaultPose = {};
      });
    }
    useAnimationStore.getState().clearDraftPose();
    canvas.markDirty();
  }, [canvas.markDirty]);

  const applyDefaultPose = useCallback(() => {
    const draftPose = useAnimationStore.getState().draftPose;
    useProjectStore.getState().updateProject((project, versionControl) => {
      if (!bakeDefaultPoseIntoSetup(project, draftPose)) return;
      versionControl.transformVersion++;
      versionControl.geometryVersion++;
    });
    useAnimationStore.getState().clearDraftPose();
    canvas.markDirty();
  }, [canvas.markDirty]);

  const finishExportAreaMove = useCallback(() => {
    useEditorStore.getState().setExportAreaMoveMode(false);
  }, []);

  const saveExportAreaMove = useCallback(() => {
    const editor = useEditorStore.getState();
    editor.setExportAreaMoveMode(false);
    editor.requestExportAreaPopover();
  }, []);

  const exportAreaMoveMode = useEditorStore(state => state.exportAreaMoveMode);
  const activeTool = canvas.store.editorState.activeTool;
  const editorMode = useEditorStore(state => state.editorMode);
  useExportAreaMoveSession({
    active: exportAreaMoveMode,
    activeTool,
    editorMode,
    finish: finishExportAreaMove,
  });

  useEffect(() => {
    if (exportAreaMoveMode && (confirmWipeOpen || confirmDeleteOpen)) {
      finishExportAreaMove();
    }
  }, [confirmDeleteOpen, confirmWipeOpen, exportAreaMoveMode, finishExportAreaMove]);

  return {
    canvas,
    deleteIntent,
    confirmDelete,
    recoveryArchive,
    resetPose,
    applyDefaultPose,
    saveExportAreaMove,
  };
}
