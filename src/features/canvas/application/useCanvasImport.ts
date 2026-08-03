import { useCallback } from 'react';

import type { ProjectDocument, ProjectResourceOwner } from '@kukla2d/contracts';

import { formatProjectError } from '@/io/projectErrorMessages';
import { hasProjectFileExtension } from '@/io/projectFormat';

import type { AnimationStore } from '@/store/animationStoreTypes';
import { useImportSettingsStore } from '@/store/importSettingsStore';
import type { ProjectStore } from '@/store/project/projectStoreTypes';

import type { WorkflowEvent } from '@/features/canvas/domain/workflowContracts.js';

import { toast } from '@/components/ui/use-toast';

import { placeLibraryAsset } from './placeLibraryAsset.js';
import { useCanvasAssetImport } from './useCanvasAssetImport.js';
import { useCanvasFileRouting } from './useCanvasFileRouting.js';
import { useCanvasProjectLifecycle } from './useCanvasProjectLifecycle.js';
import { useCanvasProjectSave } from './useCanvasProjectSave.js';

import type { CanvasEditorSnapshot, CanvasSceneGateway, CanvasTextureCache, MutableRef } from './canvasApplicationTypes.js';
import type { CanvasDropEvent } from './handleCanvasDrop.js';
import type { ChangeEvent, Dispatch, DragEvent, SetStateAction } from 'react';

interface CanvasImportArgs {
  projectRef: MutableRef<ProjectDocument>;
  canvasRef: MutableRef<HTMLCanvasElement | null>;
  editorRef: MutableRef<CanvasEditorSnapshot>;
  updateProject: ProjectStore['updateProject'];
  resetProject: ProjectStore['resetProject'];
  centerView: (width: number, height: number) => void;
  sceneGatewayRef: MutableRef<CanvasSceneGateway | null>;
  textureCache: CanvasTextureCache;
  markDirty: () => void;
  setConfirmWipeOpen: Dispatch<SetStateAction<boolean>>;
  pendingFile: File | null;
  setPendingFile: Dispatch<SetStateAction<File | null>>;
  animRef: MutableRef<AnimationStore>;
  sendWorkflowEvent?: (event: WorkflowEvent) => void;
  resourceOwnerRef: MutableRef<ProjectResourceOwner>;
}

export interface CanvasImportController {
  importPng: (file: File) => Promise<void>;
  processPsdFile: (file: File, libraryOnly?: boolean) => Promise<void>;
  importPsdFile: (file: File) => Promise<void>;
  importStretchFile: (file: File) => Promise<void>;
  handleSave: () => Promise<void>;
  handleLoadProject: (file: File) => Promise<{ success: true } | { success: false; error: unknown }>;
  handleConfirmWipe: () => Promise<void>;
  handleImportPsdToLibrary: () => Promise<void>;
  handleReset: () => void;
  importFiles: (fileList: FileList | readonly File[] | null) => Promise<void>;
  onDrop: (event: DragEvent<HTMLElement>) => void;
  handleFileChange: (event: ChangeEvent<HTMLInputElement>) => Promise<void>;
}

function notifyProjectError(title: string, error: unknown): void {
  toast({ variant: 'destructive', title, description: formatProjectError(error) });
}

export function useCanvasImport(args: CanvasImportArgs): CanvasImportController {
  const {
    projectRef, canvasRef, editorRef, updateProject, resetProject, centerView,
    sceneGatewayRef, textureCache, markDirty, setConfirmWipeOpen, pendingFile,
    setPendingFile, animRef, sendWorkflowEvent, resourceOwnerRef,
  } = args;
  const { importPng, processPsdFile } = useCanvasAssetImport({
    projectRef,
    updateProject,
    centerView,
    sceneGatewayRef,
    textureCache,
    markDirty,
    resourceOwnerRef,
    notifyError: notifyProjectError,
  });
  const handlePlaceLibraryAsset = useCallback((assetId: string, event: CanvasDropEvent) => placeLibraryAsset({
    assetId, event, projectRef, canvasRef, editorRef, updateProject, markDirty, sceneGatewayRef, textureCache,
  }), [canvasRef, editorRef, markDirty, projectRef, sceneGatewayRef, textureCache, updateProject]);
  const handleSave = useCanvasProjectSave(projectRef, error => {
    console.error('Failed to save project:', error);
    notifyProjectError('Project save failed', error);
  });
  const { handleLoadProject, handleReset } = useCanvasProjectLifecycle({
    centerView,
    markDirty,
    resetProject,
    resourceOwnerRef,
    sceneGatewayRef,
    textureCache,
    imageDataMapRef: { current: textureCache.__internal.imageDataByPartId },
  });
  const importPsdFile = useCallback(async (file: File): Promise<void> => {
    const autoAddToCanvas = useImportSettingsStore.getState().autoAddToCanvas;
    if (autoAddToCanvas && projectRef.current.nodes.length > 0) {
      setPendingFile(file);
      setConfirmWipeOpen(true);
      return;
    }
    await processPsdFile(file);
  }, [processPsdFile, projectRef, setConfirmWipeOpen, setPendingFile]);
  const importStretchFile = useCallback(async (file: File): Promise<void> => {
    if (projectRef.current.nodes.length > 0) {
      setPendingFile(file);
      setConfirmWipeOpen(true);
      return;
    }
    const result = await handleLoadProject(file);
    if (!result.success) {
      console.error('Failed to load project:', result.error);
      notifyProjectError('Project load failed', result.error);
    }
  }, [handleLoadProject, projectRef, setConfirmWipeOpen, setPendingFile]);
  const handleConfirmWipe = useCallback(async (): Promise<void> => {
    if (pendingFile) {
      if (hasProjectFileExtension(pendingFile.name)) {
        const result = await handleLoadProject(pendingFile);
        if (!result.success) {
          console.error('Failed to load project:', result.error);
          notifyProjectError('Project load failed', result.error);
        } else animRef.current?.resetPlayback?.();
      } else {
        resetProject();
        animRef.current?.resetPlayback?.();
        await processPsdFile(pendingFile);
      }
      setPendingFile(null);
    }
    setConfirmWipeOpen(false);
  }, [animRef, handleLoadProject, pendingFile, processPsdFile, resetProject, setConfirmWipeOpen, setPendingFile]);
  const handleImportPsdToLibrary = useCallback(async (): Promise<void> => {
    if (pendingFile?.name.toLowerCase().endsWith('.psd')) {
      await processPsdFile(pendingFile, true);
    }
    setPendingFile(null);
    setConfirmWipeOpen(false);
  }, [pendingFile, processPsdFile, setConfirmWipeOpen, setPendingFile]);
  const { importFiles, onDrop: routeDrop, handleFileChange } = useCanvasFileRouting({
    importPng,
    importPsdFile,
    importStretchFile,
    placeLibraryAsset: handlePlaceLibraryAsset,
    ...(sendWorkflowEvent === undefined ? {} : { sendWorkflowEvent }),
    notifyError: error => {
      console.error('Failed to import file(s):', error);
      notifyProjectError('Import failed', error);
    },
  });
  const onDrop = useCallback((event: DragEvent<HTMLElement>): void => { void routeDrop(event); }, [routeDrop]);
  return {
    importPng, processPsdFile, importPsdFile, importStretchFile, handleSave,
    handleLoadProject, handleConfirmWipe, handleImportPsdToLibrary, handleReset, importFiles, onDrop, handleFileChange,
  };
}
