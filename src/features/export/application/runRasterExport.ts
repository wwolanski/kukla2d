import type {
  CapturedRasterFrame,
  ExportArtifact,
  RasterExportPlan,
} from "@kukla2d/contracts";

import { captureRasterFrames } from "./captureRasterFrames.js";
import { errorMessage } from "./exportApplicationTypes.js";

import type {
  ExportEncoder,
  ExportOutputSink,
  ExportProgress,
  ExportRunResult,
} from "./exportApplicationTypes.types.js";
import type { CaptureFrame } from "../domain/frameCaptureTypes.types.js";

interface AnimationFrameGroup {
  animationId: string;
  baseName: string;
  outputName: string;
  frames: CapturedRasterFrame[];
}

interface RunRasterExportOptions {
  plan: Readonly<RasterExportPlan>;
  encoder: ExportEncoder;
  outputSink: ExportOutputSink;
  captureFrame: CaptureFrame;
  format?: "png" | "webp" | undefined;
  onProgress?: ((progress: ExportProgress | null) => void) | undefined;
  signal?: AbortSignal | undefined;
}

function sanitizeOutputSegment(value: unknown): string {
  const source =
    typeof value === "string" || typeof value === "number"
      ? String(value)
      : "animation";
  return (
    source
      .replace(/[^a-zA-Z0-9_-]/g, "_")
      .replace(/_+/g, "_")
      .replace(/^_+|_+$/g, "") || "animation"
  );
}

function groupFramesByAnimation(
  frames: readonly CapturedRasterFrame[],
): AnimationFrameGroup[] {
  const groupsById = new Map<string, Omit<AnimationFrameGroup, "outputName">>();
  for (const frame of frames) {
    const animationId = String(frame.animationId);
    if (!groupsById.has(animationId)) {
      groupsById.set(animationId, {
        animationId,
        baseName: sanitizeOutputSegment(frame.animationName),
        frames: [],
      });
    }
    groupsById.get(animationId)!.frames.push(frame);
  }

  const allocatedNames = new Set<string>();
  return [...groupsById.values()].map((group) => {
    let outputName = group.baseName;
    if (allocatedNames.has(outputName)) {
      const suffix = sanitizeOutputSegment(group.animationId);
      outputName = `${group.baseName}_${suffix}`;
      let collisionIndex = 2;
      while (allocatedNames.has(outputName)) {
        outputName = `${group.baseName}_${suffix}_${collisionIndex}`;
        collisionIndex += 1;
      }
    }
    allocatedNames.add(outputName);
    return { ...group, outputName };
  });
}

export async function runRasterExport({
  plan,
  encoder,
  outputSink,
  captureFrame,
  format,
  onProgress,
  signal,
}: RunRasterExportOptions): Promise<ExportRunResult> {
  try {
    onProgress?.({
      current: 0,
      total: plan.frameSpecs.length,
      label: "Capturing frames...",
    });

    const captureResult = await captureRasterFrames({
      plan,
      captureFrame,
      format,
      onProgress,
      signal,
    });

    if (!captureResult.ok) {
      if ("cancelled" in captureResult) return { ok: false, cancelled: true };
      return { ok: false, error: captureResult.error };
    }

    const capturedFrames = captureResult.frames;
    onProgress?.({
      current: capturedFrames.length,
      total: capturedFrames.length,
      label: "Encoding...",
    });

    const allArtifacts: ExportArtifact[] = [];
    for (const group of groupFramesByAnimation(capturedFrames)) {
      if (signal?.aborted) return { ok: false, cancelled: true };

      onProgress?.({
        current: 0,
        total: 1,
        label: `Encoding ${group.outputName}...`,
      });
      const artifacts = await encoder({
        frames: group.frames,
        area: plan.area,
        fps: plan.fps,
        background: plan.background,
        animationName: group.outputName,
        spriteSheet: plan.spriteSheet,
        ...(onProgress ? { onProgress } : {}),
        ...(signal ? { signal } : {}),
      });

      if (signal?.aborted) return { ok: false, cancelled: true };
      allArtifacts.push(...artifacts);
    }

    onProgress?.({
      current: allArtifacts.length,
      total: allArtifacts.length,
      label: "Writing output...",
    });
    const sinkResult = await outputSink(allArtifacts);
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

    return { ok: true, artifacts: allArtifacts };
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
