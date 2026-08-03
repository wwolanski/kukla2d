import { useCallback, useState } from 'react';

import { useAnimationStore } from '@/store/animationStore';
import { useEditorStore } from '@/store/editorStore';

import { useCanvasViewportController } from '@/features/canvas/application/useCanvasViewportController.js';
import CanvasDialogs from '@/features/canvas/components/CanvasDialogs.jsx';
import CanvasFailureFallback from '@/features/canvas/components/CanvasFailureFallback.jsx';
import CanvasSurface from '@/features/canvas/components/CanvasSurface.jsx';
import OverlayLayer from '@/features/canvas/components/OverlayLayer.jsx';

import { Button } from '@/components/ui/button';

export default function CanvasViewport({
  remeshRef, deleteMeshRef,
  saveRef, loadRef, resetRef,
  exportCaptureRef, thumbCaptureRef,
  importRef,
}) {
  const [confirmWipeOpen, setConfirmWipeOpen] = useState(false);
  const [pendingFile, setPendingFile] = useState(null);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const draftPose = useAnimationStore(s => s.draftPose);
  const currentEditorMode = useEditorStore(s => s.editorMode);
  const canvasBackground = useEditorStore(s => s.canvasBackground);
  const setCanvasBackground = useEditorStore(s => s.setCanvasBackground);
  const showSkeleton = useEditorStore(s => s.showSkeleton);
  const setShowSkeleton = useEditorStore(s => s.setShowSkeleton);
  const showExportArea = useEditorStore(s => s.showExportArea);
  const setShowExportArea = useEditorStore(s => s.setShowExportArea);
  const exportAreaMoveMode = useEditorStore(s => s.exportAreaMoveMode);
  const viewport = useCanvasViewportController({
    remeshRef, deleteMeshRef, saveRef, loadRef, resetRef, exportCaptureRef, thumbCaptureRef,
    importRef,
    confirmWipeOpen, setConfirmWipeOpen, pendingFile, setPendingFile,
    confirmDeleteOpen, setConfirmDeleteOpen,
  });
  const ctrl = viewport.canvas;

  const { editorState, project } = ctrl.store;
  const inputHandlers = ctrl.input.handlers;
  const importHooks = ctrl.import;
  const fileInputRef = ctrl.refs.fileInputRef;
  const canvasFailure = ctrl.canvasFailure;
  const retryCanvas = ctrl.retryCanvas;
  const hasSavedPose = Object.keys(project.defaultPose ?? {}).length > 0;
  const toolCursor = exportAreaMoveMode
    ? 'move'
    : editorState.activeTool === 'select'
    ? 'default'
    : ['transform', 'pose'].includes(editorState.activeTool)
      ? 'move'
      : 'crosshair';

  const handleCanvasContextMenu = useCallback((e) => {
    e.preventDefault();
    inputHandlers.onContextMenu?.(e);
  }, [inputHandlers]);

  return (
    <CanvasSurface
      canvasRef={ctrl.refs.canvasRef}
      handlers={{
        onWheel: inputHandlers.onWheel,
        onContextMenu: handleCanvasContextMenu,
      }}
      toolCursor={toolCursor}
      editorState={editorState}
      canvasBackground={canvasBackground}
      editorMode={currentEditorMode}
      showSkeleton={showSkeleton}
      showExportArea={showExportArea}
      onBackgroundChange={setCanvasBackground}
      onToggleArmature={() => setShowSkeleton(!showSkeleton)}
      onToggleExportArea={() => setShowExportArea(!showExportArea)}
      onDrop={importHooks.onDrop}
      onDragOver={inputHandlers.onDragOver}
      onDragEnter={inputHandlers.onDragEnter}
      onDragLeave={inputHandlers.onDragLeave}
    >
      <input
        type="file"
        ref={fileInputRef}
        onChange={importHooks.handleFileChange}
        accept=".kk2d,.psd,image/*"
        multiple
        className="hidden"
      />

      {canvasFailure && (
        <CanvasFailureFallback
          failure={canvasFailure}
          onRetry={retryCanvas}
          recoveryArchive={viewport.recoveryArchive}
        />
      )}

      <OverlayLayer
        view={editorState.view}
      />

      <CanvasDialogs
        confirmWipeOpen={confirmWipeOpen}
        setConfirmWipeOpen={setConfirmWipeOpen}
        handleConfirmWipe={importHooks.handleConfirmWipe}
        handleImportPsdToLibrary={importHooks.handleImportPsdToLibrary}
        canImportPendingPsdToLibrary={pendingFile?.name.toLowerCase().endsWith('.psd') ?? false}
        confirmDeleteOpen={confirmDeleteOpen}
        setConfirmDeleteOpen={setConfirmDeleteOpen}
        deleteIntent={viewport.deleteIntent}
        handleConfirmDelete={viewport.confirmDelete}
      />

      {exportAreaMoveMode && (
        <div
          className="absolute bottom-4 left-1/2 z-40 flex -translate-x-1/2 items-center gap-2 rounded-lg border border-primary/50 bg-background/95 p-2 shadow-lg backdrop-blur"
          data-export-area-move-controls="true"
          onPointerDown={(event) => event.stopPropagation()}
        >
          <span className="px-1 text-[11px] text-muted-foreground">
            Move Export Area: drag the dashed box on the canvas, then save.
          </span>
          <Button
            type="button"
            size="sm"
            onClick={viewport.saveExportAreaMove}
          >
            Save
          </Button>
        </div>
      )}

      {!exportAreaMoveMode && currentEditorMode !== 'animation'
        && (editorState.activeTool === 'pose' || draftPose.size > 0 || hasSavedPose) && (
        <div
          className="absolute bottom-4 left-1/2 z-40 flex -translate-x-1/2 items-center gap-2 rounded-lg border border-border bg-background/90 p-2 shadow-lg backdrop-blur"
          onPointerDown={(event) => event.stopPropagation()}
        >
          <span className="px-1 text-[11px] text-muted-foreground">
            {editorState.activeTool === 'pose'
              ? 'Pose: preview, then apply as setup.'
              : 'Unsaved pose changes.'}
          </span>
          <Button
            type="button"
            size="sm"
            variant="destructive"
            disabled={draftPose.size === 0 && !hasSavedPose}
            onClick={viewport.resetPose}
          >
            Reset pose
          </Button>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            disabled={draftPose.size === 0 && !hasSavedPose}
            onClick={viewport.applyDefaultPose}
          >
            Apply as setup
          </Button>
        </div>
      )}
    </CanvasSurface>
  );
}
