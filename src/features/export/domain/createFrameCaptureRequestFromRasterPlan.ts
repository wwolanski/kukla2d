/**
 * Frame capture request mapper — 3C.
 *
 * Builds a valid K5 FrameCaptureRequest from a resolved export area and frame spec.
 * Ensures crop = source area, output dimensions = scaled area (R1/R2).
 */

import type { ExportAreaContract, RasterFrameSpec } from "@kukla2d/contracts";

import { createFrameCaptureRequest } from "@/features/canvas";

interface FrameCaptureRequest {
  animationId: string | null;
  timeMs: number;
  width: number;
  height: number;
  format: "png" | "jpg" | "webp";
  quality: number;
  background: { enabled: boolean; color: string };
  crop: { x: number; y: number; width?: number; height?: number } | null;
}

interface RasterFrameCaptureOptions {
  area: ExportAreaContract;
  frameSpec: RasterFrameSpec;
  format?: "png" | "webp";
  bgEnabled?: boolean;
  bgColor?: string;
}

export function createFrameCaptureRequestFromRasterPlan({
  area,
  frameSpec,
  format,
  bgEnabled,
  bgColor,
}: RasterFrameCaptureOptions): FrameCaptureRequest {
  if (!area || !frameSpec) {
    throw new TypeError(
      "createFrameCaptureRequestFromRasterPlan: area and frameSpec required",
    );
  }

  const crop = {
    x: area.source.x,
    y: area.source.y,
    width: area.source.width,
    height: area.source.height,
  };

  return createFrameCaptureRequest({
    animationId: frameSpec.animId,
    timeMs: frameSpec.timeMs,
    width: area.outputWidth,
    height: area.outputHeight,
    format: format ?? "png",
    quality: 0.92,
    bgEnabled: bgEnabled ?? true,
    bgColor: bgColor ?? "#ffffff",
    crop,
  });
}
