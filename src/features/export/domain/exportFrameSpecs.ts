import type { RasterFrameSpec } from "@kukla2d/contracts";

import type { ExportFrameAnimation } from "./exportFrameSpecs.types.js";

interface ComputeExportFrameSpecsOptions {
  animsToExport: readonly ExportFrameAnimation[];
  exportFps: number;
}

export function sanitizeName(name: string | null | undefined): string {
  const candidate = name ?? "animation";
  if (!candidate || candidate.length === 0) return "animation";
  return (
    candidate
      .replace(/[^a-zA-Z0-9_-]/g, "_")
      .replace(/_+/g, "_")
      .replace(/^_+|_+$/g, "") || "animation"
  );
}

export function computeExportFrameSpecs({
  animsToExport,
  exportFps,
}: ComputeExportFrameSpecsOptions): RasterFrameSpec[] {
  if (animsToExport.length === 0) {
    throw new RangeError(
      "computeExportFrameSpecs: animsToExport must be a non-empty array",
    );
  }
  if (!Number.isFinite(exportFps) || exportFps <= 0) {
    throw new RangeError(
      `computeExportFrameSpecs: exportFps must be > 0, got ${exportFps}`,
    );
  }

  const specs: RasterFrameSpec[] = [];
  for (const animation of animsToExport) {
    const durationMs = animation.duration ?? 2000;
    const sanitized = sanitizeName(animation.name);

    const totalFrames = Math.max(
      1,
      Math.round((durationMs / 1000) * exportFps),
    );
    for (let f = 0; f < totalFrames; f++) {
      specs.push({
        animId: animation.id,
        animName: sanitized,
        frameIndex: f,
        timeMs: (f / exportFps) * 1000,
      });
    }
  }

  return specs;
}
