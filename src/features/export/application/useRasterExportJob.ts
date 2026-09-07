import { useCallback } from "react";

import type {
  ExportAnimation,
  ExportArtifact,
  ProjectDocument,
  RasterExportVariantId,
} from "@kukla2d/contracts";

import { resolveActiveExportVariant } from "@/features/export/domain/exportVariantRegistry";
import { resolveProjectExportArea } from "@/features/export/domain/projectExportArea";
import { createRasterExportPlan } from "@/features/export/domain/rasterExportPlan";

import { errorMessage } from "./exportApplicationTypes.js";
import { runRasterExport } from "./runRasterExport.js";

import type {
  ExportEncoder,
  ExportOutputSink,
  ExportProgress,
} from "./exportApplicationTypes.types.js";
import type { CaptureFrame } from "../domain/frameCaptureTypes.types.js";
import type { Dispatch, RefObject, SetStateAction } from "react";

interface RasterExportJobOptions {
  captureRef: RefObject<CaptureFrame | null>;
  project: ProjectDocument;
  type: RasterExportVariantId;
  targetAnims: ExportAnimation[];
  exportFps: number;
  spriteSheetColumns: number;
  outputScale: number;
  bgMode: "transparent" | "custom";
  bgColor: string;
  exportDest: "download" | "folder" | "zip";
  projectName: string;
  setProgress: Dispatch<SetStateAction<ExportProgress | null>>;
  setIsExporting: Dispatch<SetStateAction<boolean>>;
  setExportError: Dispatch<SetStateAction<string | null>>;
  resolveEncoder?: (variantId: string) => ExportEncoder;
  writeArtifacts?: ExportOutputSink;
}

const missingEncoder = (): ExportEncoder => () =>
  Promise.reject(new Error("Export encoder was not configured"));
const missingOutputSink: ExportOutputSink = () =>
  Promise.reject(new Error("Export output sink was not configured"));

function useRasterExportJobImpl({
  captureRef,
  project,
  type,
  targetAnims,
  exportFps,
  spriteSheetColumns,
  outputScale,
  bgMode,
  bgColor,
  exportDest,
  projectName,
  setProgress,
  setIsExporting,
  setExportError,
  resolveEncoder = missingEncoder,
  writeArtifacts = missingOutputSink,
}: RasterExportJobOptions) {
  return useCallback(async () => {
    try {
      resolveActiveExportVariant(type);
    } catch {
      setExportError("UNSUPPORTED_FORMAT");
      return;
    }

    if (!captureRef?.current) {
      console.error("[Export] captureRef not available");
      return;
    }

    setIsExporting(true);
    setProgress({ current: 0, total: 1, label: "Preparing..." });

    try {
      const scale = outputScale / 100;
      const area = resolveProjectExportArea(project.canvas, { scale });
      const encoder = resolveEncoder(type);

      const plan = createRasterExportPlan({
        variantId: type,
        area,
        fps: exportFps,
        animations: targetAnims,
        background: { enabled: bgMode === "custom", color: bgColor },
        spriteSheet: { columns: spriteSheetColumns },
      });

      const outputSink = (artifacts: readonly ExportArtifact[]) =>
        writeArtifacts(artifacts, {
          destination: exportDest ?? "zip",
          projectName: projectName ?? "export",
        });

      const result = await runRasterExport({
        plan,
        encoder,
        outputSink,
        captureFrame: captureRef.current,
        // Raster capture stays lossless PNG. Selected format describes final encoder output.
        format: "png",
        onProgress: (p) => setProgress(p ? { ...p } : null),
      });

      if (!result.ok) {
        if ("cancelled" in result) {
          setProgress(null);
          setIsExporting(false);
          return;
        }
        setExportError(result.error?.message ?? "Export failed");
        setProgress(null);
        setIsExporting(false);
        return;
      }

      setProgress(null);
      setIsExporting(false);
    } catch (err) {
      console.error("[Export] Failed:", err);
      setExportError(errorMessage(err, "Export failed"));
      setProgress(null);
      setIsExporting(false);
    }
  }, [
    captureRef,
    project,
    type,
    targetAnims,
    exportFps,
    spriteSheetColumns,
    outputScale,
    bgMode,
    bgColor,
    exportDest,
    projectName,
    setProgress,
    setIsExporting,
    setExportError,
    resolveEncoder,
    writeArtifacts,
  ]);
}

export const useRasterExportJob = (
  ...args: Parameters<typeof useRasterExportJobImpl>
): ReturnType<typeof useRasterExportJobImpl> => useRasterExportJobImpl(...args);
