import PropTypes from 'prop-types';
import { lazy, Suspense } from 'react';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

function loadExportModal() {
  return import('@/features/export/components/ExportModal').then(m => ({ default: m.ExportModal }));
}

function loadPreferencesModal() {
  return import('@/features/preferences/components/PreferencesModal').then(m => ({ default: m.PreferencesModal }));
}

function loadSaveModal() {
  return import('@/features/projects/components/SaveModal').then(m => ({ default: m.SaveModal }));
}

function loadLoadModal() {
  return import('@/features/projects/components/LoadModal').then(m => ({ default: m.LoadModal }));
}

function loadModularSpriteWizard() {
  return import('@/features/modular-sprite/wizard').then(m => ({ default: m.ModularSpriteWizard }));
}

const ExportModal = lazy(loadExportModal);
const PreferencesModal = lazy(loadPreferencesModal);
const SaveModal = lazy(loadSaveModal);
const LoadModal = lazy(loadLoadModal);
const ModularSpriteWizard = lazy(loadModularSpriteWizard);

export function EditorModals({
  exportModalOpen,
  setExportModalOpen,
  preferencesOpen,
  setPreferencesOpen,
  projectSession,
  project,
  exportCaptureRef,
  thumbCaptureRef,
  importRef,
  modularSpriteEditor,
  setModularSpriteEditor,
}) {
  return (
    <>
      {exportModalOpen && (
        <Suspense fallback={null}>
          <ExportModal
            open={exportModalOpen}
            onClose={() => setExportModalOpen(false)}
            captureRef={exportCaptureRef}
            projectName={projectSession.currentDbProjectName}
            projectId={projectSession.currentDbProjectId}
          />
        </Suspense>
      )}

      {preferencesOpen && (
        <Suspense fallback={null}>
          <PreferencesModal
            open={preferencesOpen}
            onOpenChange={setPreferencesOpen}
          />
        </Suspense>
      )}

      {projectSession.saveModalOpen && (
        <Suspense fallback={null}>
          <SaveModal
            open={projectSession.saveModalOpen}
            onOpenChange={projectSession.closeSaveModal}
            project={project}
            captureRef={thumbCaptureRef}
            currentDbProjectId={projectSession.currentDbProjectId}
            currentDbProjectName={projectSession.currentDbProjectName}
            onSavedToDb={projectSession.handleSavedToDb}
            onSaveSuccess={projectSession.handleSaveSuccess}
          />
        </Suspense>
      )}

      {projectSession.loadModalOpen && (
        <Suspense fallback={null}>
          <LoadModal
            open={projectSession.loadModalOpen}
            onOpenChange={projectSession.closeLoadModal}
            onLoadFromDb={projectSession.handleLoadFromDb}
            onLoadFromFile={projectSession.handleLoadFromFile}
          />
        </Suspense>
      )}

      {modularSpriteEditor.open && (
        <Suspense fallback={null}>
          <ModularSpriteWizard
            open={modularSpriteEditor.open}
            existingId={modularSpriteEditor.existingId}
            onOpenChange={(open) => setModularSpriteEditor(current => ({ ...current, open }))}
            onCommit={(request) => {
              if (!importRef.current?.commitModularSprite) throw new Error('Canvas import service is not ready');
              return importRef.current.commitModularSprite(request);
            }}
          />
        </Suspense>
      )}

      <AlertDialog open={projectSession.confirmWipe.open} onOpenChange={(open) => !open && projectSession.closeConfirmWipe()}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Replace current project?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete all existing layers, meshes, and
              animations in your current workspace. Unsaved changes will be lost.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={projectSession.handleConfirmWipe}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Replace Workspace
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={projectSession.confirmStore.open} onOpenChange={(open) => !open && projectSession.closeConfirmStore()}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Store imported project in Library?</AlertDialogTitle>
            <AlertDialogDescription>
              Would you like to save this project to your library so you can access it easily later?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => projectSession.finalizeLoadFile(projectSession.confirmStore.file, false)}>
              Skip
            </AlertDialogCancel>
            <AlertDialogAction onClick={() => projectSession.finalizeLoadFile(projectSession.confirmStore.file, true)}>
              Save to Library
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

const refShape = PropTypes.shape({ current: PropTypes.any });

EditorModals.propTypes = {
  exportModalOpen: PropTypes.bool.isRequired,
  setExportModalOpen: PropTypes.func.isRequired,
  preferencesOpen: PropTypes.bool.isRequired,
  setPreferencesOpen: PropTypes.func.isRequired,
  projectSession: PropTypes.shape({
    saveModalOpen: PropTypes.bool.isRequired,
    openSaveModal: PropTypes.func.isRequired,
    closeSaveModal: PropTypes.func.isRequired,
    loadModalOpen: PropTypes.bool.isRequired,
    openLoadModal: PropTypes.func.isRequired,
    closeLoadModal: PropTypes.func.isRequired,
    currentDbProjectId: PropTypes.string,
    currentDbProjectName: PropTypes.string,
    handleSavedToDb: PropTypes.func.isRequired,
    handleSaveSuccess: PropTypes.func,
    handleLoadRecord: PropTypes.func.isRequired,
    handleLoadFromDb: PropTypes.func.isRequired,
    handleLoadFromFile: PropTypes.func.isRequired,
    handleCheckStore: PropTypes.func.isRequired,
    finalizeLoadFile: PropTypes.func.isRequired,
    handleNewProject: PropTypes.func.isRequired,
    confirmWipe: PropTypes.shape({
      open: PropTypes.bool.isRequired,
      type: PropTypes.oneOf(['db', 'file', 'new']),
      data: PropTypes.any,
    }).isRequired,
    confirmStore: PropTypes.shape({
      open: PropTypes.bool.isRequired,
      file: PropTypes.any,
    }).isRequired,
    handleConfirmWipe: PropTypes.func.isRequired,
    closeConfirmWipe: PropTypes.func.isRequired,
    closeConfirmStore: PropTypes.func.isRequired,
  }).isRequired,
  project: PropTypes.object.isRequired,
  exportCaptureRef: refShape.isRequired,
  thumbCaptureRef: refShape.isRequired,
  importRef: refShape.isRequired,
  modularSpriteEditor: PropTypes.shape({
    open: PropTypes.bool.isRequired,
    existingId: PropTypes.string,
  }).isRequired,
  setModularSpriteEditor: PropTypes.func.isRequired,
};
