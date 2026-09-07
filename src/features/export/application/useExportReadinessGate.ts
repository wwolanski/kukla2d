import { useCallback, useRef, useState } from "react";

import type { ProjectDocument } from "@kukla2d/contracts";

import { analyzeProjectReadiness } from "@/domain/projectReadiness.js";
import type {
  ProjectReadinessIssue,
  ProjectReadinessReport,
  ProjectReadinessTarget,
} from "@/domain/projectReadiness.types.js";

type ExportReadinessDecision =
  | {
      kind: "blocked";
      target: ProjectReadinessTarget;
      report: ProjectReadinessReport;
    }
  | {
      kind: "confirm";
      target: ProjectReadinessTarget;
      report: ProjectReadinessReport;
    }
  | {
      kind: "ready";
      target: ProjectReadinessTarget;
      report: ProjectReadinessReport;
    };

type ReadinessExecution<T> = (report: ProjectReadinessReport) => T;

interface ExportReadinessGate {
  decision: ExportReadinessDecision | null;
  runWithGate: (execute: ReadinessExecution<unknown>) => unknown;
  continuePending: () => unknown;
  cancelPending: () => void;
}

interface PendingReadiness<T = unknown> {
  target: ProjectReadinessTarget;
  report: ProjectReadinessReport;
  execute: ReadinessExecution<T>;
}

interface UseExportReadinessGateOptions {
  project: ProjectDocument;
  type: string;
  setExportError?: (message: string | null) => void;
}

export function resolveExportReadinessTarget(
  type: string,
): ProjectReadinessTarget {
  if (type === "phaser_atlas") return "phaser_atlas";
  return "frames";
}

export function formatReadinessIssues(
  issues: readonly ProjectReadinessIssue[],
): string {
  return issues
    .map((issue) => `[${issue.code}] ${issue.path}: ${issue.message}`)
    .join("\n");
}

export function decideExportReadiness(
  project: ProjectDocument,
  target: ProjectReadinessTarget,
): ExportReadinessDecision {
  const report = analyzeProjectReadiness(project, target);
  if (report.errors.length > 0) return { kind: "blocked", target, report };
  if (report.warnings.length > 0) return { kind: "confirm", target, report };
  return { kind: "ready", target, report };
}

export function useExportReadinessGate({
  project,
  type,
  setExportError,
}: UseExportReadinessGateOptions): ExportReadinessGate {
  const pendingRef = useRef<PendingReadiness | null>(null);
  const [decision, setDecision] = useState<ExportReadinessDecision | null>(
    null,
  );

  const cancelPending = useCallback(() => {
    pendingRef.current = null;
    setDecision(null);
  }, []);

  const runWithGate = useCallback(
    (execute: ReadinessExecution<unknown>): unknown => {
      const target = resolveExportReadinessTarget(type);
      const nextDecision = decideExportReadiness(project, target);
      setExportError?.(null);

      if (nextDecision.kind === "blocked") {
        pendingRef.current = null;
        setDecision(nextDecision);
        setExportError?.(formatReadinessIssues(nextDecision.report.errors));
        return undefined;
      }

      if (nextDecision.kind === "confirm") {
        pendingRef.current = { target, report: nextDecision.report, execute };
        setDecision(nextDecision);
        return undefined;
      }

      pendingRef.current = null;
      setDecision(null);
      return execute(nextDecision.report);
    },
    [project, type, setExportError],
  );

  const continuePending = useCallback(() => {
    const pending = pendingRef.current;
    if (!pending) return undefined;
    pendingRef.current = null;
    setDecision(null);
    return pending.execute(pending.report);
  }, []);

  return {
    decision,
    runWithGate,
    continuePending,
    cancelPending,
  };
}
