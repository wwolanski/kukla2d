import type {
  CapturedRasterFrame,
  ExportAreaContract,
  RasterFrameSpec,
} from "@kukla2d/contracts";

import { createFrameCaptureRequestFromRasterPlan } from "@/features/export/domain/createFrameCaptureRequestFromRasterPlan";

import type { ExportProgress } from "./exportApplicationTypes.types.js";
import type { CaptureFrame } from "../domain/frameCaptureTypes.types.js";

interface CaptureRasterFramesOptions {
  plan: Readonly<{
    area: ExportAreaContract;
    background: { enabled: boolean; color: string };
    frameSpecs: readonly RasterFrameSpec[];
  }>;
  captureFrame: CaptureFrame;
  format?: "png" | "webp" | undefined;
  onProgress?: ((progress: ExportProgress | null) => void) | undefined;
  signal?: AbortSignal | undefined;
}

type CaptureRasterFramesResult =
  | { ok: true; frames: CapturedRasterFrame[] }
  | { ok: false; cancelled: true }
  | { ok: false; error: { code: string; message: string } };

export async function captureRasterFrames({
  plan,
  captureFrame,
  format,
  onProgress,
  signal,
}: CaptureRasterFramesOptions): Promise<CaptureRasterFramesResult> {
  if (!plan || !plan.frameSpecs) {
    return {
      ok: false,
      error: { code: "INVALID_PLAN", message: "Invalid raster export plan" },
    };
  }

  const frames: CapturedRasterFrame[] = [];
  const total = plan.frameSpecs.length;

  for (let i = 0; i < total; i++) {
    if (signal?.aborted) {
      return { ok: false, cancelled: true };
    }

    const spec = plan.frameSpecs[i]!;
    onProgress?.({
      current: i + 1,
      total,
      label: `${spec.animName} — frame ${spec.frameIndex + 1}`,
    });

    const request = createFrameCaptureRequestFromRasterPlan({
      area: plan.area,
      frameSpec: spec,
      format: format ?? "png",
      bgEnabled: plan.background.enabled,
      bgColor: plan.background.color,
    });

    const result = captureFrame(request);
    if (!result || !result.ok) {
      return {
        ok: false,
        error: result?.error ?? {
          code: "CAPTURE_FAILED",
          message: "Capture returned no result",
        },
      };
    }

    frames.push({
      animationId: spec.animId,
      animationName: spec.animName,
      frameIndex: spec.frameIndex,
      timeMs: spec.timeMs,
      width: result.width,
      height: result.height,
      dataUrl: result.dataUrl,
    });

    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  }

  return { ok: true, frames };
}
