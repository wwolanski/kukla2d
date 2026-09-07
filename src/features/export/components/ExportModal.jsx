import { useCallback } from "react";

import { useAnimationStore } from "@/store/animationStore";
import { useProjectStore } from "@/store/projectStore";

import { useExportReadinessGate } from "@/features/export/application/useExportReadinessGate";
import { usePhaserAtlasExportForm } from "@/features/export/application/usePhaserAtlasExportForm";
import { usePhaserAtlasExportJob } from "@/features/export/application/usePhaserAtlasExportJob";
import { useRasterExportForm } from "@/features/export/application/useRasterExportForm";
import { useRasterExportJob } from "@/features/export/application/useRasterExportJob";
import { ExportProgress } from "@/features/export/components/ExportProgress";
import { ExportTypeOptions } from "@/features/export/components/ExportTypeOptions";
import { FrameExportOptions } from "@/features/export/components/FrameExportOptions";
import { PhaserAtlasExportOptions } from "@/features/export/components/PhaserAtlasExportOptions";
import { resolveActiveExportVariant } from "@/features/export/domain/exportVariantRegistry";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export function ExportModal({
  open,
  onClose,
  captureRef,
  projectName,
  projectId,
  resolveEncoder,
  phaserAtlasAdapter,
  writeArtifacts,
}) {
  const project = useProjectStore((s) => s.project);
  const animStore = useAnimationStore();

  const raster = useRasterExportForm({
    open,
    project,
    animStore,
    projectName,
    projectId,
  });
  const phaser = usePhaserAtlasExportForm({
    open,
    project,
    animStore,
    projectName,
  });

  const isPhaser = raster.frame.type === "phaser_atlas";
  const activeStatus = isPhaser ? phaser.status : raster.status;

  const handleRasterExport = useRasterExportJob({
    captureRef,
    project,
    type: raster.frame.variantId,
    targetAnims: raster.frame.targetAnims,
    exportFps: raster.frame.exportFps,
    spriteSheetColumns: raster.frame.spriteSheetColumns,
    outputScale: raster.frame.outputScale,
    bgMode: raster.frame.bgMode,
    bgColor: raster.frame.bgColor,
    exportDest: raster.frame.exportDest,
    projectName,
    setProgress: raster.status.setProgress,
    setIsExporting: raster.status.setIsExporting,
    setExportError: raster.status.setExportError,
    resolveEncoder,
    writeArtifacts,
  });

  const handlePhaserExport = usePhaserAtlasExportJob({
    captureRef,
    project,
    animations: phaser.frame.targetAnims,
    exportFps: phaser.frame.exportFps,
    outputScale: phaser.frame.outputScale,
    trim: phaser.frame.trim,
    padding: phaser.frame.padding,
    maxPageSize: phaser.frame.maxPageSize,
    loop: phaser.frame.loop,
    outputName: projectName ?? "phaser-export",
    exportDest: phaser.frame.exportDest,
    setProgress: phaser.status.setProgress,
    setIsExporting: phaser.status.setIsExporting,
    setExportError: phaser.status.setExportError,
    adapter: phaserAtlasAdapter,
    writeArtifacts,
  });

  const handleExport = isPhaser ? handlePhaserExport : handleRasterExport;

  const readinessGate = useExportReadinessGate({
    project,
    type: raster.frame.variantId,
    setExportError: activeStatus.setExportError,
  });

  const handleClose = useCallback(() => {
    readinessGate.cancelPending();
    if (isPhaser) {
      handlePhaserExport.cancel();
    }
    onClose();
  }, [readinessGate, isPhaser, handlePhaserExport, onClose]);

  const handleExportClick = () => {
    try {
      resolveActiveExportVariant(raster.frame.variantId);
    } catch {
      activeStatus.setExportError("UNSUPPORTED_FORMAT");
      return;
    }
    readinessGate.runWithGate(handleExport);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v && !activeStatus.isExporting) handleClose();
      }}
    >
      <DialogContent className="max-w-lg h-[min(720px,90vh)] !flex flex-col overflow-hidden">
        <DialogHeader className="shrink-0">
          <DialogTitle>Export</DialogTitle>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
          <ExportTypeOptions
            type={raster.frame.type}
            format={raster.frame.format}
            isExporting={activeStatus.isExporting}
            onTypeChange={(v) => {
              readinessGate.cancelPending();
              raster.frame.setType(v);
              activeStatus.setExportError(null);
            }}
            onFormatChange={raster.frame.setFormat}
          />

          {isPhaser ? (
            <PhaserAtlasExportOptions
              frame={phaser.frame}
              animations={project?.animations ?? []}
            />
          ) : (
            <FrameExportOptions
              frame={raster.frame}
              animations={project?.animations ?? []}
            />
          )}
        </div>

        {readinessGate.decision && (
          <ExportReadinessIssues
            decision={readinessGate.decision}
            onCancel={readinessGate.cancelPending}
            onContinue={readinessGate.continuePending}
            onClose={readinessGate.cancelPending}
          />
        )}

        <ExportProgress
          progress={activeStatus.progress}
          exportError={activeStatus.exportError}
          isExporting={activeStatus.isExporting}
          onClose={handleClose}
          onCancel={isPhaser ? handlePhaserExport.cancel : undefined}
          onExport={handleExportClick}
        />
      </DialogContent>
    </Dialog>
  );
}

function ExportReadinessIssues({ decision, onCancel, onContinue, onClose }) {
  const issues =
    decision.kind === "blocked"
      ? decision.report.errors
      : decision.report.warnings;
  const isBlocked = decision.kind === "blocked";
  return (
    <div className="space-y-2 rounded border border-amber-300 bg-amber-50 p-3 text-xs text-amber-950 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-100">
      <div className="font-medium">
        {isBlocked ? "Export blocked" : "Export warnings"}
      </div>
      <ul className="space-y-1">
        {issues.map((issue, index) => (
          <li key={`${issue.code}-${issue.path}-${index}`}>
            <span className="font-mono">{issue.code}</span>{" "}
            <span className="font-mono">{issue.path}</span>
            {": "}
            {issue.message}
          </li>
        ))}
      </ul>
      <div className="flex justify-end gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={isBlocked ? onClose : onCancel}
        >
          {isBlocked ? "Close" : "Cancel"}
        </Button>
        {!isBlocked && (
          <Button size="sm" onClick={onContinue}>
            Continue
          </Button>
        )}
      </div>
    </div>
  );
}
