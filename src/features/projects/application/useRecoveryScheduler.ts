import { useEffect, useRef, useCallback, useMemo, useState } from "react";

import type { ProjectDocument } from "@kukla2d/contracts";

import { useProjectStore } from "@/store/projectStore";

import { useRecoveryRepository } from "./useRecoveryRepository.js";

import type { RecoveryRecord } from "@/io/projectDb.types.js";

const DEBOUNCE_MS = 3000;

type RecoveryStatus = "idle" | "scheduled" | "saving" | "saved" | "failed";

interface SourceIdentity {
  sourceProjectId: string | null;
  sourceProjectName: string | null;
}

interface RecoverySnapshot {
  project: ProjectDocument;
  sourceProjectId: string | null;
  sourceProjectName: string | null;
}

interface SchedulerOptions {
  enabled?: boolean;
  getSourceIdentity?: () => SourceIdentity;
}

interface SchedulerResult {
  status: RecoveryStatus;
  scheduleSave: () => void;
  clearRecovery: () => Promise<boolean>;
  forceSave: () => Promise<void>;
  readRecovery: () => Promise<RecoveryRecord | null>;
}

export function useRecoveryScheduler({
  enabled = true,
  getSourceIdentity,
}: SchedulerOptions = {}): SchedulerResult {
  const repository = useRecoveryRepository();
  const [status, setStatus] = useState<RecoveryStatus>("idle");
  const revisionRef = useRef(0);
  const pendingRevisionRef = useRef<number | null>(null);
  const inflightRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const snapshotRef = useRef<RecoverySnapshot | null>(null);
  const mountedRef = useRef(true);
  const clearGenerationRef = useRef(0);
  const activeSaveRef = useRef<Promise<void> | null>(null);

  const scheduleSnapshot = useCallback(() => {
    const state = useProjectStore.getState() as {
      project: ProjectDocument;
      hasUnsavedChanges: boolean;
    };
    if (!state.hasUnsavedChanges) return;
    const identity = getSourceIdentity?.() ?? ({} as SourceIdentity);
    snapshotRef.current = {
      project: state.project,
      sourceProjectId: identity.sourceProjectId ?? null,
      sourceProjectName: identity.sourceProjectName ?? null,
    };
    return true;
  }, [getSourceIdentity]);

  const runSave = useCallback(async (): Promise<void> => {
    if (inflightRef.current) {
      pendingRevisionRef.current = revisionRef.current;
      return activeSaveRef.current!;
    }

    inflightRef.current = true;
    setStatus("saving");
    const saveOperation = (async (): Promise<void> => {
      try {
        const { saveProject } = await import("@/io/projectFile");
        while (mountedRef.current) {
          const snapshot = snapshotRef.current;
          if (!snapshot) {
            setStatus("idle");
            return;
          }

          const revision = revisionRef.current;
          const clearGeneration = clearGenerationRef.current;
          pendingRevisionRef.current = null;
          const archive = await saveProject(snapshot.project);
          if (
            !mountedRef.current ||
            clearGenerationRef.current !== clearGeneration
          )
            return;

          if (
            pendingRevisionRef.current !== null &&
            pendingRevisionRef.current > revision
          ) {
            continue;
          }

          await repository.write({
            id: "workspace-recovery",
            archive,
            savedAt: Date.now(),
            sourceProjectId: snapshot.sourceProjectId,
            sourceProjectName: snapshot.sourceProjectName,
            documentVersion: snapshot.project.version,
            revision,
          });
          if (
            !mountedRef.current ||
            clearGenerationRef.current !== clearGeneration
          )
            return;

          if (
            pendingRevisionRef.current !== null &&
            pendingRevisionRef.current > revision
          ) {
            continue;
          }
          setStatus("saved");
          return;
        }
      } catch (error) {
        console.error("[Recovery] Failed to save workspace recovery:", error);
        if (mountedRef.current) setStatus("failed");
      } finally {
        inflightRef.current = false;
        activeSaveRef.current = null;
        if (
          mountedRef.current &&
          pendingRevisionRef.current !== null &&
          snapshotRef.current
        ) {
          pendingRevisionRef.current = null;
          void runSave();
        }
      }
    })();
    activeSaveRef.current = saveOperation;
    return saveOperation;
  }, [repository]);

  const scheduleSave = useCallback(() => {
    if (!enabled) return;

    if (!scheduleSnapshot()) return;
    revisionRef.current += 1;
    setStatus("scheduled");

    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      void runSave();
    }, DEBOUNCE_MS);
  }, [enabled, scheduleSnapshot, runSave]);

  const clearRecovery = useCallback(async (): Promise<boolean> => {
    clearGenerationRef.current += 1;
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    snapshotRef.current = null;
    pendingRevisionRef.current = null;
    revisionRef.current = 0;
    setStatus("idle");
    try {
      await repository.clear();
      return true;
    } catch (error) {
      console.error("[Recovery] Failed to clear workspace recovery:", error);
      if (mountedRef.current) setStatus("failed");
      return false;
    }
  }, [repository]);

  const forceSave = useCallback(async (): Promise<void> => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (!scheduleSnapshot()) return;
    revisionRef.current += 1;
    await runSave();
  }, [scheduleSnapshot, runSave]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  useEffect(() => {
    if (!enabled) return;
    const previousState = useProjectStore.getState() as {
      project: ProjectDocument;
      hasUnsavedChanges: boolean;
    };
    if (previousState.hasUnsavedChanges) scheduleSave();
    const unsub = useProjectStore.subscribe((state) => {
      const s = state as {
        project: ProjectDocument;
        hasUnsavedChanges: boolean;
      };
      const dirty = s.hasUnsavedChanges;
      if (
        dirty &&
        (!previousState.hasUnsavedChanges ||
          s.project !== previousState.project)
      ) {
        scheduleSave();
      }
      previousState.project = s.project;
      previousState.hasUnsavedChanges = s.hasUnsavedChanges;
    });
    return unsub;
  }, [enabled, scheduleSave]);

  return useMemo(
    () => ({
      status,
      scheduleSave,
      clearRecovery,
      forceSave,
      readRecovery: repository.read,
    }),
    [status, scheduleSave, clearRecovery, forceSave, repository.read],
  );
}
