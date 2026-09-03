import { useRef, useCallback, useState, useEffect, lazy, Suspense } from 'react';

import { useTheme } from '@/app/providers/theme/useTheme.js';

import { useEditorStore } from '@/store/editorStore';
import { useProjectStore } from '@/store/projectStore';
import { undo, redo, undoCount, redoCount, applyPatches } from '@/store/undoHistory';

import { EditorWorkflowContext } from '@/features/canvas';
import { useProjectSession, useRecoveryScheduler, RecoveryPrompt } from '@/features/projects';

import { EditorHeader } from './components/EditorHeader.jsx';
import { EditorModals } from './components/EditorModals.jsx';
import { EditorWorkspace } from './components/EditorWorkspace.jsx';
import { useBeforeUnloadWarning } from './hooks/useBeforeUnloadWarning.js';
import { useEditorModeController } from './hooks/useEditorModeController.js';

const ModeTransitionDialog = lazy(() =>
  import('./components/ModeTransitionDialog.jsx').then(m => ({ default: m.ModeTransitionDialog }))
);

export default function EditorLayout() {
  const remeshRef = useRef(null);
  const deleteMeshRef = useRef(null);
  const saveRef = useRef(null);
  const loadRef = useRef(null);
  const resetRef = useRef(null);
  const importRef = useRef(null);
  const exportCaptureRef = useRef(null);
  const thumbCaptureRef = useRef(null);
  const sourceIdentityRef = useRef({ sourceProjectId: null, sourceProjectName: null });

  const mode = useEditorStore(s => s.editorMode);
  const editorStarted = useEditorStore(s => s.editorStarted);

  const project = useProjectStore(s => s.project);
  const hasUnsavedChanges = useProjectStore(s => s.hasUnsavedChanges);

  const [exportModalOpen, setExportModalOpen] = useState(false);
  const [preferencesOpen, setPreferencesOpen] = useState(false);
  const [modularSpriteEditor, setModularSpriteEditor] = useState({ open: false, existingId: null });
  const [recoveryRecord, setRecoveryRecord] = useState(null);
  const [recoveryError, setRecoveryError] = useState(null);

  const getSourceIdentity = useCallback(() => sourceIdentityRef.current, []);
  const recovery = useRecoveryScheduler({ enabled: editorStarted, getSourceIdentity });
  const { clearRecovery, readRecovery, status: recoveryStatus } = recovery;

  const projectSession = useProjectSession({
    loadRef,
    resetRef,
    thumbCaptureRef,
    clearRecovery,
  });
  sourceIdentityRef.current = {
    sourceProjectId: projectSession.currentDbProjectId,
    sourceProjectName: projectSession.currentDbProjectName,
  };

  const {
    requestMode,
    transitionState,
    confirmCommit,
    confirmDiscard,
    confirmCancel,
  } = useEditorModeController();

  useTheme();
  useBeforeUnloadWarning(hasUnsavedChanges);

  const startEditor = useEditorStore(s => s.startEditor);

  useEffect(() => {
    let cancelled = false;
    readRecovery()
      .then((record) => {
        if (!cancelled && record) setRecoveryRecord(record);
      })
      .catch((error) => {
        if (!cancelled) console.error('[Recovery] Failed to read recovery:', error);
      });
    return () => { cancelled = true; };
  }, [readRecovery]);

  const handleRestoreRecovery = useCallback(async (record) => {
    if (!record?.archive || !loadRef.current) return false;
    const file = new File([record.archive], 'recovery.kk2d', { type: 'application/zip' });
    try {
      const result = await loadRef.current(file);
      if (!result?.success) throw result?.error ?? new Error('Recovery load failed');
      useProjectStore.getState().setHasUnsavedChanges(true);
      startEditor();
      const cleared = await clearRecovery();
      if (!cleared) {
        setRecoveryError('Project restored, but the recovery copy could not be removed. Try Discard again.');
        return false;
      }
      setRecoveryRecord(null);
      setRecoveryError(null);
      return true;
    } catch (err) {
      console.error('[Recovery] Failed to restore:', err);
      setRecoveryError('Recovery could not be restored. The recovery copy was kept.');
      return false;
    }
  }, [clearRecovery, startEditor]);

  const handleDiscardRecovery = useCallback(async () => {
    const cleared = await clearRecovery();
    if (!cleared) {
      setRecoveryError('Recovery could not be discarded. The recovery copy was kept.');
      return false;
    }
    setRecoveryRecord(null);
    setRecoveryError(null);
    return true;
  }, [clearRecovery]);

  const handleRemesh = useCallback((partId, opts) => {
    remeshRef.current?.(partId, opts);
  }, []);

  const handleDeleteMesh = useCallback((partId) => {
    deleteMeshRef.current?.(partId);
  }, []);

  const handleUndo = useCallback(() => {
    undo((inversePatches) => {
      const fullState = useProjectStore.getState();
      const restored = applyPatches(fullState, inversePatches);
      useProjectStore.getState().restoreProject(restored);
    });
  }, []);

  const handleRedo = useCallback(() => {
    redo((forwardPatches) => {
      const fullState = useProjectStore.getState();
      const restored = applyPatches(fullState, forwardPatches);
      useProjectStore.getState().restoreProject(restored);
    });
  }, []);

  const isAnimationMode = mode === 'animation';
  const canUndo = undoCount() > 0;
  const canRedo = redoCount() > 0;

  return (
    <EditorWorkflowContext.Provider>
      <div className="flex h-screen w-full flex-col bg-background text-foreground overflow-hidden">
        <EditorHeader
          projectSession={projectSession}
          mode={mode}
          requestMode={requestMode}
          canUndo={canUndo}
          canRedo={canRedo}
          onUndo={handleUndo}
          onRedo={handleRedo}
          onOpenExportModal={() => setExportModalOpen(true)}
          onOpenPreferences={() => setPreferencesOpen(true)}
        />

        <EditorWorkspace
          editorStarted={editorStarted}
          isAnimationMode={isAnimationMode}
          remeshRef={remeshRef}
          deleteMeshRef={deleteMeshRef}
          saveRef={saveRef}
          loadRef={loadRef}
          resetRef={resetRef}
          importRef={importRef}
          exportCaptureRef={exportCaptureRef}
          thumbCaptureRef={thumbCaptureRef}
          onRemesh={handleRemesh}
          onDeleteMesh={handleDeleteMesh}
          onLoadExampleProject={projectSession.handleLoadExampleProject}
          onImportModularSprite={() => setModularSpriteEditor({ open: true, existingId: null })}
          onEditModularSprite={(existingId) => setModularSpriteEditor({ open: true, existingId })}
        />

        <EditorModals
          exportModalOpen={exportModalOpen}
          setExportModalOpen={setExportModalOpen}
          preferencesOpen={preferencesOpen}
          setPreferencesOpen={setPreferencesOpen}
          projectSession={projectSession}
          project={project}
          exportCaptureRef={exportCaptureRef}
          thumbCaptureRef={thumbCaptureRef}
          importRef={importRef}
          modularSpriteEditor={modularSpriteEditor}
          setModularSpriteEditor={setModularSpriteEditor}
        />

        <Suspense fallback={null}>
          <ModeTransitionDialog
            open={!!transitionState}
            onCommit={confirmCommit}
            onDiscard={confirmDiscard}
            onCancel={confirmCancel}
            error={transitionState?.error}
          />
        </Suspense>

        <Suspense fallback={null}>
          <RecoveryPrompt
            record={recoveryRecord}
            error={recoveryError}
            onRestore={handleRestoreRecovery}
            onDiscard={handleDiscardRecovery}
          />
        </Suspense>

        <div className="sr-only" data-recovery-status={recoveryStatus} aria-live="polite">
          Recovery status: {recoveryStatus}
        </div>
        {recoveryStatus === 'failed' && (
          <div className="fixed bottom-3 right-3 z-50 rounded-md border border-destructive/40 bg-background px-3 py-2 text-sm text-destructive" role="status">
            Workspace recovery could not be saved. Use Save Project to protect your work.
          </div>
        )}
      </div>
    </EditorWorkflowContext.Provider>
  );
}
