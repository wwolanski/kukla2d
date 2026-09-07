import { useCallback, useState } from "react";

import { saveToDb } from "@/io/projectDb";
import { formatProjectError } from "@/io/projectErrorMessages";
import {
  PROJECT_ARCHIVE_FORMAT_ID,
  PROJECT_ARCHIVE_VERSION,
  PROJECT_FILE_EXTENSION,
  buildProjectFileName,
  stripProjectExtension,
} from "@/io/projectFormat";

import { useEditorStore } from "@/store/editorStore";
import { useProjectStore } from "@/store/projectStore";

import { toast } from "@/components/ui/use-toast";

import type { StoredProjectRecord } from "@/io/projectDb.types.js";

type ProjectLoadOutcome =
  { success: true } | { success: false; error: unknown };

type ConfirmWipeState =
  | { open: false; type: null; data: null }
  | { open: true; type: "new"; data: null }
  | { open: true; type: "file"; data: File }
  | { open: true; type: "example"; data: File }
  | { open: true; type: "db"; data: StoredProjectRecord };

interface ConfirmStoreState {
  open: boolean;
  file: File | null;
}

interface ProjectSessionOptions {
  loadRef: { current: ((file: File) => Promise<ProjectLoadOutcome>) | null };
  resetRef: { current: (() => void) | null };
  thumbCaptureRef: { current: (() => string) | null };
  clearRecovery?: () => void;
}

const INITIAL_CONFIRM_WIPE: ConfirmWipeState = {
  open: false,
  type: null,
  data: null,
};
const INITIAL_CONFIRM_STORE: ConfirmStoreState = { open: false, file: null };

function clearSessionState(
  setCurrentDbProjectId: (value: string | null) => void,
  setCurrentDbProjectName: (value: string | null) => void,
) {
  setCurrentDbProjectId(null);
  setCurrentDbProjectName(null);
}

function showProjectLoadError(error: unknown) {
  toast({
    variant: "destructive",
    title: "Project load failed",
    description: formatProjectError(error),
  });
}

function useProjectSessionImpl({
  loadRef,
  resetRef,
  thumbCaptureRef,
  clearRecovery,
}: ProjectSessionOptions) {
  const startEditor = useEditorStore(
    (s: { startEditor: () => void }) => s.startEditor,
  );
  const setActiveLayerTab = useEditorStore(
    (s: { setActiveLayerTab?: (tab: "groups") => void }) => s.setActiveLayerTab,
  );
  const nodes = useProjectStore(
    (s: { project: { nodes: unknown[] } }) => s.project.nodes,
  );
  const hasUnsavedChanges = useProjectStore(
    (s: { hasUnsavedChanges: boolean }) => s.hasUnsavedChanges,
  );
  const hasNodes = nodes.length > 0;
  const shouldConfirmReplace = hasUnsavedChanges || hasNodes;

  const [saveModalOpen, setSaveModalOpen] = useState(false);
  const [loadModalOpen, setLoadModalOpen] = useState(false);
  const [currentDbProjectId, setCurrentDbProjectId] = useState<string | null>(
    null,
  );
  const [currentDbProjectName, setCurrentDbProjectName] = useState<
    string | null
  >(null);
  const [confirmWipe, setConfirmWipe] =
    useState<ConfirmWipeState>(INITIAL_CONFIRM_WIPE);
  const [confirmStore, setConfirmStore] = useState<ConfirmStoreState>(
    INITIAL_CONFIRM_STORE,
  );

  const openSaveModal = useCallback(() => setSaveModalOpen(true), []);
  const closeSaveModal = useCallback(() => setSaveModalOpen(false), []);
  const openLoadModal = useCallback(() => setLoadModalOpen(true), []);
  const closeLoadModal = useCallback(() => setLoadModalOpen(false), []);

  const handleSavedToDb = useCallback(
    (id: string, name: string) => {
      setCurrentDbProjectId(id);
      setCurrentDbProjectName(name);
      clearRecovery?.();
    },
    [clearRecovery],
  );

  const handleSaveSuccess = useCallback(() => {
    clearRecovery?.();
  }, [clearRecovery]);

  const handleLoadRecord = useCallback(
    async (record: StoredProjectRecord) => {
      const file = new File([record.blob], buildProjectFileName(record.name), {
        type: "application/zip",
      });
      const result = await loadRef.current?.(file);
      if (result && !result.success) {
        console.error("Failed to load project:", result.error);
        showProjectLoadError(result.error);
        return;
      }
      startEditor();
      setCurrentDbProjectId(record.id);
      setCurrentDbProjectName(record.name);
      clearRecovery?.();
    },
    [loadRef, startEditor, clearRecovery],
  );

  const handleCheckStore = useCallback((file: File) => {
    setConfirmStore({ open: true, file });
  }, []);

  const loadExampleProject = useCallback(
    async (file: File) => {
      const result = await loadRef.current?.(file);
      if (result && !result.success) {
        console.error("Failed to load example project:", result.error);
        showProjectLoadError(result.error);
        return;
      }
      startEditor();
      setActiveLayerTab?.("groups");
      clearSessionState(setCurrentDbProjectId, setCurrentDbProjectName);
      clearRecovery?.();
    },
    [clearRecovery, loadRef, setActiveLayerTab, startEditor],
  );

  const handleLoadExampleProject = useCallback(
    (file: File) => {
      if (shouldConfirmReplace) {
        setConfirmWipe({ open: true, type: "example", data: file });
        return;
      }
      void loadExampleProject(file);
    },
    [loadExampleProject, shouldConfirmReplace],
  );

  const finalizeLoadFile = useCallback(
    async (file: File, shouldStore: boolean) => {
      setConfirmStore({ open: false, file: null });

      const result = await loadRef.current?.(file);
      if (result && !result.success) {
        console.error("Failed to load project:", result.error);
        showProjectLoadError(result.error);
        return;
      }
      startEditor();
      clearRecovery?.();

      if (shouldStore) {
        try {
          const name = stripProjectExtension(file.name);
          const blob = file.slice();
          const thumbnail = thumbCaptureRef.current?.() || "";
          const id = await saveToDb(null, name, blob, thumbnail, {
            formatId: PROJECT_ARCHIVE_FORMAT_ID,
            formatVersion: PROJECT_ARCHIVE_VERSION,
            extension: PROJECT_FILE_EXTENSION,
            author: useProjectStore.getState().project.author,
          });
          setCurrentDbProjectId(id);
          setCurrentDbProjectName(name);
        } catch (err) {
          console.error("[EditorLayout] Failed to auto-store project:", err);
          toast({
            variant: "destructive",
            title: "Library save failed",
            description: formatProjectError(err),
          });
        }
        return;
      }

      clearSessionState(setCurrentDbProjectId, setCurrentDbProjectName);
    },
    [loadRef, startEditor, thumbCaptureRef, clearRecovery],
  );

  const handleLoadFromDb = useCallback(
    (record: StoredProjectRecord) => {
      if (shouldConfirmReplace) {
        setConfirmWipe({ open: true, type: "db", data: record });
        return;
      }
      void handleLoadRecord(record);
    },
    [handleLoadRecord, shouldConfirmReplace],
  );

  const handleLoadFromFile = useCallback(
    (file: File) => {
      if (shouldConfirmReplace) {
        setConfirmWipe({ open: true, type: "file", data: file });
        return;
      }
      handleCheckStore(file);
    },
    [handleCheckStore, shouldConfirmReplace],
  );

  const startNewProject = useCallback(() => {
    resetRef.current?.();
    startEditor();
    clearSessionState(setCurrentDbProjectId, setCurrentDbProjectName);
    clearRecovery?.();
  }, [resetRef, startEditor, clearRecovery]);

  const handleNewProject = useCallback(() => {
    if (shouldConfirmReplace) {
      setConfirmWipe({ open: true, type: "new", data: null });
      return;
    }
    startNewProject();
  }, [shouldConfirmReplace, startNewProject]);

  const handleConfirmWipe = useCallback(async () => {
    if (confirmWipe.type === "db") {
      await handleLoadRecord(confirmWipe.data);
    } else if (confirmWipe.type === "file") {
      handleCheckStore(confirmWipe.data);
    } else if (confirmWipe.type === "example") {
      await loadExampleProject(confirmWipe.data);
    } else if (confirmWipe.type === "new") {
      startNewProject();
    }

    setConfirmWipe(INITIAL_CONFIRM_WIPE);
  }, [
    confirmWipe,
    handleCheckStore,
    handleLoadRecord,
    loadExampleProject,
    startNewProject,
  ]);

  const closeConfirmWipe = useCallback(() => {
    setConfirmWipe((prev) => ({
      ...prev,
      open: false,
      type: null,
      data: null,
    }));
  }, []);

  const closeConfirmStore = useCallback(() => {
    setConfirmStore((prev) => ({ ...prev, open: false }));
  }, []);

  return {
    saveModalOpen,
    openSaveModal,
    closeSaveModal,
    loadModalOpen,
    openLoadModal,
    closeLoadModal,
    currentDbProjectId,
    currentDbProjectName,
    handleSavedToDb,
    handleSaveSuccess,
    handleLoadRecord,
    handleLoadFromDb,
    handleLoadFromFile,
    handleLoadExampleProject,
    handleCheckStore,
    finalizeLoadFile,
    handleNewProject,
    confirmWipe,
    confirmStore,
    handleConfirmWipe,
    closeConfirmWipe,
    closeConfirmStore,
  };
}

export const useProjectSession = (
  ...args: Parameters<typeof useProjectSessionImpl>
): ReturnType<typeof useProjectSessionImpl> => useProjectSessionImpl(...args);
