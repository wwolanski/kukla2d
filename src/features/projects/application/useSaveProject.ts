import { useState, useEffect, useCallback } from "react";

import type { ProjectDocument } from "@kukla2d/contracts";

import { saveToDb } from "@/io/projectDb";
import {
  PROJECT_ARCHIVE_FORMAT_ID,
  PROJECT_ARCHIVE_VERSION,
  PROJECT_FILE_EXTENSION,
  buildProjectFileName,
} from "@/io/projectFormat";

import { useAnimationStore } from "@/store/animationStore";
import { useProjectStore } from "@/store/projectStore";

import { analyzeProjectReadiness } from "@/domain/projectReadiness.js";
import type { ProjectReadinessIssue } from "@/domain/projectReadiness.types.js";

import type { StoredProjectRecord } from "@/io/projectDb.types.js";

type SaveMode = "library" | "download";
type SaveAction = () => void;

interface UseSaveProjectProps {
  open: boolean;
  project: ProjectDocument;
  captureRef: React.MutableRefObject<(() => string) | null>;
  currentDbProjectId: string | null;
  currentDbProjectName: string | null;
  onSavedToDb: (id: string, name: string) => void;
  onSaveSuccess?: () => void;
  onOpenChange: (open: boolean) => void;
}

interface UseSaveProjectResult {
  name: string;
  author: string;
  saveMode: SaveMode;
  isSaving: boolean;
  overwriteProject: StoredProjectRecord | null;
  libraryProjects: StoredProjectRecord[];
  preflightErrors: ProjectReadinessIssue[] | null;
  preflightWarnings: ProjectReadinessIssue[] | null;
  saveError: Error | null;
  setName: (name: string) => void;
  setAuthor: (author: string) => void;
  setSaveMode: (mode: SaveMode) => void;
  handleSaveNew: () => void;
  handleOverwrite: (project: StoredProjectRecord) => void;
  confirmOverwrite: () => void;
  continueAfterWarnings: () => void;
  setOverwriteProject: (project: StoredProjectRecord | null) => void;
  setPreflightErrors: (errors: ProjectReadinessIssue[] | null) => void;
  setPreflightWarnings: (warnings: ProjectReadinessIssue[] | null) => void;
  setLibraryProjects: (projects: StoredProjectRecord[]) => void;
  setSaveError: (error: Error | null) => void;
}

export function useSaveProject({
  open,
  project,
  captureRef,
  currentDbProjectId,
  currentDbProjectName,
  onSavedToDb,
  onSaveSuccess,
  onOpenChange,
}: UseSaveProjectProps): UseSaveProjectResult {
  const [name, setName] = useState("");
  const [author, setAuthor] = useState("");
  const [saveMode, setSaveMode] = useState<SaveMode>("library");
  const [isSaving, setIsSaving] = useState(false);
  const [overwriteProject, setOverwriteProject] =
    useState<StoredProjectRecord | null>(null);
  const [libraryProjects, setLibraryProjects] = useState<StoredProjectRecord[]>(
    [],
  );
  const [preflightErrors, setPreflightErrors] = useState<
    ProjectReadinessIssue[] | null
  >(null);
  const [preflightWarnings, setPreflightWarnings] = useState<
    ProjectReadinessIssue[] | null
  >(null);
  const [pendingSave, setPendingSave] = useState<SaveAction | null>(null);
  const [saveError, setSaveError] = useState<Error | null>(null);

  useEffect(() => {
    if (open) {
      setName(currentDbProjectName || "Untitled Project");
      setAuthor(project.author ?? "");
      setSaveMode(currentDbProjectId ? "library" : "library");
      setIsSaving(false);
      setPreflightErrors(null);
      setPreflightWarnings(null);
      setPendingSave(null);
      setSaveError(null);
    }
  }, [open, currentDbProjectId, currentDbProjectName, project.author]);

  const runPreflight = useCallback(
    (saveAction: SaveAction): boolean => {
      const report = analyzeProjectReadiness(project, "stretch");
      if (report.errors.length > 0) {
        setPreflightErrors(report.errors);
        return false;
      }
      if (report.warnings.length > 0) {
        setPreflightWarnings(report.warnings);
        setPendingSave(saveAction);
        return false;
      }
      return true;
    },
    [project],
  );

  const executeSave = useCallback(
    async (idToUse: string | null, nameToUse: string, mode: SaveMode) => {
      setIsSaving(true);
      setSaveError(null);
      try {
        const { saveProject } = await import("@/io/projectFile");
        const authorToUse = author.trim();
        const activeAnimationId =
          useAnimationStore.getState().activeAnimationId;
        const projectToSave: ProjectDocument = {
          ...project,
          author: authorToUse,
          lastActiveAnimationId: project.animations.some(
            (animation) => animation.id === activeAnimationId,
          )
            ? activeAnimationId
            : null,
        };
        const blob = await saveProject(projectToSave);

        if (mode === "download") {
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = buildProjectFileName(nameToUse.trim());
          a.click();
          URL.revokeObjectURL(url);
          useProjectStore.getState().setHasUnsavedChanges(false);
          onSaveSuccess?.();
          onOpenChange(false);
        } else {
          const thumbnail = captureRef.current?.() || "";
          const savedId = await saveToDb(
            idToUse,
            nameToUse.trim(),
            blob,
            thumbnail,
            {
              formatId: PROJECT_ARCHIVE_FORMAT_ID,
              formatVersion: PROJECT_ARCHIVE_VERSION,
              extension: PROJECT_FILE_EXTENSION,
              author: authorToUse,
            },
          );
          onSavedToDb(savedId, nameToUse.trim());
          onSaveSuccess?.();
          useProjectStore.getState().setHasUnsavedChanges(false);
          onOpenChange(false);
        }
        useProjectStore.getState().updateProject(
          (draft) => {
            draft.author = projectToSave.author;
            draft.lastActiveAnimationId = projectToSave.lastActiveAnimationId;
          },
          { skipHistory: true },
        );
      } catch (err) {
        console.error("Failed to save project:", err);
        setSaveError(err instanceof Error ? err : new Error(String(err)));
      } finally {
        setIsSaving(false);
      }
    },
    [project, author, captureRef, onSavedToDb, onSaveSuccess, onOpenChange],
  );

  const handleSaveNew = useCallback(() => {
    if (!name.trim()) return;

    const doSave = () => {
      if (saveMode === "library") {
        const existing = libraryProjects.find(
          (p) => p.name.toLowerCase() === name.trim().toLowerCase(),
        );
        if (existing) {
          setOverwriteProject(existing);
          return;
        }
      }
      void executeSave(
        saveMode === "library" ? currentDbProjectId : null,
        name,
        saveMode,
      );
    };

    if (!runPreflight(doSave)) return;
    doSave();
  }, [
    name,
    saveMode,
    currentDbProjectId,
    libraryProjects,
    executeSave,
    runPreflight,
  ]);

  const handleOverwrite = useCallback((p: StoredProjectRecord) => {
    setOverwriteProject(p);
  }, []);

  const confirmOverwrite = useCallback(() => {
    if (!overwriteProject) return;
    const doOverwrite = () => {
      void executeSave(overwriteProject.id, overwriteProject.name, "library");
      setOverwriteProject(null);
    };
    if (!runPreflight(doOverwrite)) return;
    doOverwrite();
  }, [overwriteProject, executeSave, runPreflight]);

  const continueAfterWarnings = useCallback(() => {
    setPreflightWarnings(null);
    if (pendingSave) {
      pendingSave();
      setPendingSave(null);
    }
  }, [pendingSave]);

  return {
    name,
    author,
    saveMode,
    isSaving,
    overwriteProject,
    libraryProjects,
    preflightErrors,
    preflightWarnings,
    saveError,
    setName,
    setAuthor,
    setSaveMode,
    handleSaveNew,
    handleOverwrite,
    confirmOverwrite,
    continueAfterWarnings,
    setOverwriteProject,
    setPreflightErrors,
    setPreflightWarnings,
    setLibraryProjects,
    setSaveError,
  };
}
