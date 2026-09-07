import type {
  BakeReportEntry,
  CapturedFrame,
  EncodeResult,
  PackageOptions,
} from "@kukla2d/adapter-phaser-atlas";
import type { PhaserAtlasExportPlan } from "@kukla2d/contracts";

import type { ProjectReadinessReport } from "@/domain/projectReadiness.types.js";

import { captureRasterFrames } from "./captureRasterFrames.js";
import { errorMessage } from "./exportApplicationTypes.js";

import type {
  ExportOutputSink,
  ExportProgress,
  ExportRunResult,
} from "./exportApplicationTypes.types.js";
import type { CaptureFrame } from "../domain/frameCaptureTypes.types.js";

type PhaserAtlasAdapter = (
  frames: readonly CapturedFrame[],
  options: PackageOptions,
) => Promise<EncodeResult>;

interface RunPhaserAtlasExportOptions {
  plan: Readonly<PhaserAtlasExportPlan>;
  captureFrame: CaptureFrame;
  adapter: PhaserAtlasAdapter;
  outputSink: ExportOutputSink;
  readinessReport?: ProjectReadinessReport | null | undefined;
  onProgress?: ((progress: ExportProgress | null) => void) | undefined;
  signal?: AbortSignal | undefined;
}

export async function runPhaserAtlasExport({
  plan,
  captureFrame,
  adapter,
  outputSink,
  readinessReport,
  onProgress,
  signal,
}: RunPhaserAtlasExportOptions): Promise<ExportRunResult> {
  try {
    onProgress?.({
      current: 0,
      total: plan.frameSpecs.length,
      label: "Preparing...",
    });

    const captureResult = await captureRasterFrames({
      plan,
      captureFrame,
      format: "png",
      onProgress: (p) => {
        if (p) {
          onProgress?.({
            current: p.current,
            total: p.total,
            label: `Capturing: ${p.label}`,
          });
        }
      },
      ...(signal ? { signal } : {}),
    });

    if (!captureResult.ok) {
      if ("cancelled" in captureResult) return { ok: false, cancelled: true };
      return { ok: false, error: captureResult.error };
    }

    const capturedFrames = captureResult.frames;
    if (signal?.aborted) return { ok: false, cancelled: true };

    onProgress?.({ current: 0, total: 1, label: "Trimming & packing..." });

    const adapterInput: CapturedFrame[] = capturedFrames.map((f) => ({
      identity: `${f.animationName}-${f.animationId}/${String(f.frameIndex).padStart(4, "0")}`,
      animId: f.animationId,
      animName: f.animationName,
      frameIndex: f.frameIndex,
      dataUrl: f.dataUrl,
      sourceWidth: f.width,
      sourceHeight: f.height,
    }));

    const adapterResult = await adapter(adapterInput, {
      fps: plan.fps,
      scale: plan.scale,
      trim: plan.trim,
      padding: plan.padding,
      maxPageSize: plan.maxPageSize,
      loop: plan.loop,
      outputName: plan.outputName,
      destination: plan.destination,
      textureKey: plan.outputName,
      animations: plan.animations.map((a) => ({
        id: a.id,
        name: a.name,
        ...(a.duration === undefined ? {} : { duration: a.duration }),
        ...(a.fps === undefined ? {} : { fps: a.fps }),
        ...(a.markers === undefined ? {} : { markers: a.markers }),
      })),
      bakeIssues: [
        ...(readinessReport?.errors ?? []).map((entry): BakeReportEntry => ({
          ...entry,
          classification: entry.classification ?? "blocked",
        })),
        ...(readinessReport?.warnings ?? []).map((entry): BakeReportEntry => ({
          ...entry,
          classification: entry.classification ?? "warning",
        })),
      ],
      ...(signal ? { signal } : {}),
      onProgress: (p) => {
        if (p) onProgress?.({ current: 0, total: 1, label: p.label });
      },
    });

    if (!adapterResult.ok) {
      if (adapterResult.code === "PHASER_ATLAS_CANCELLED")
        return { ok: false, cancelled: true };
      return {
        ok: false,
        error: { code: adapterResult.code, message: adapterResult.message },
      };
    }

    const artifacts = adapterResult.artifacts;
    if (!artifacts || artifacts.length === 0) {
      return {
        ok: false,
        error: {
          code: "EMPTY_PACKAGE",
          message: "Adapter produced no artifacts",
        },
      };
    }

    if (signal?.aborted) return { ok: false, cancelled: true };

    onProgress?.({ current: 0, total: 1, label: "Writing output..." });

    const sinkResult = await outputSink(artifacts, {
      destination: plan.destination,
      projectName: plan.outputName,
    });

    if (sinkResult?.ok === false) {
      if ("cancelled" in sinkResult) return { ok: false, cancelled: true };
      return {
        ok: false,
        error: sinkResult.error ?? {
          code: "OUTPUT_FAILED",
          message: "Failed to write export artifacts",
        },
      };
    }

    onProgress?.({ current: 1, total: 1, label: "Done" });
    return { ok: true, artifacts };
  } catch (err) {
    return {
      ok: false,
      error: {
        code: "EXPORT_FAILED",
        message: errorMessage(err, "Export failed"),
      },
    };
  }
}
