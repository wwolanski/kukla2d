import type {
  ExportAreaContract,
  RasterExportPlan,
  RasterExportVariantId,
} from "@kukla2d/contracts";

import { computeExportFrameSpecs } from "./exportFrameSpecs.js";
import { resolveExportPipeline } from "./exportVariantRegistry.js";

import type { ExportFrameAnimation } from "./exportFrameSpecs.types.js";

const RASTER_VARIANT_IDS = new Set<RasterExportVariantId>([
  "png_sequence",
  "png_spritesheet",
  "gif",
]);

interface CreateRasterExportPlanOptions {
  variantId: RasterExportVariantId;
  area: ExportAreaContract;
  fps: number;
  animations: ExportFrameAnimation[];
  frameIndex?: number;
  background?: { enabled: boolean; color: string };
  spriteSheet?: { columns?: number } | null;
}

export function createRasterExportPlan({
  variantId,
  area,
  fps,
  animations,
  background,
  spriteSheet,
}: CreateRasterExportPlanOptions): Readonly<RasterExportPlan> {
  if (!area || typeof area !== "object") {
    throw new TypeError("createRasterExportPlan: area must be an object");
  }
  if (
    !area.source ||
    !Number.isFinite(area.source.x) ||
    !Number.isFinite(area.source.y) ||
    !Number.isFinite(area.source.width) ||
    area.source.width <= 0 ||
    !Number.isFinite(area.source.height) ||
    area.source.height <= 0
  ) {
    throw new TypeError(
      "createRasterExportPlan: area.source must have finite x/y and positive width/height",
    );
  }
  if (!Number.isFinite(area.outputWidth) || area.outputWidth <= 0) {
    throw new TypeError("createRasterExportPlan: area.outputWidth must be > 0");
  }
  if (!Number.isFinite(area.outputHeight) || area.outputHeight <= 0) {
    throw new TypeError(
      "createRasterExportPlan: area.outputHeight must be > 0",
    );
  }
  if (!animations || !Array.isArray(animations) || animations.length === 0) {
    throw new RangeError(
      "createRasterExportPlan: animations must be a non-empty array",
    );
  }
  if (!variantId || !RASTER_VARIANT_IDS.has(variantId)) {
    throw new TypeError(
      `createRasterExportPlan: variantId must be a raster variant ID, got "${variantId}"`,
    );
  }
  resolveExportPipeline(variantId);

  const frameSpecs = computeExportFrameSpecs({
    animsToExport: animations,
    exportFps: fps,
  });

  if (frameSpecs.length === 0) {
    throw new RangeError(
      "createRasterExportPlan: no frames generated from animation specs",
    );
  }

  return Object.freeze({
    variantId,
    area: Object.freeze({
      source: Object.freeze({ ...area.source }),
      outputWidth: area.outputWidth,
      outputHeight: area.outputHeight,
    }),
    fps,
    animations,
    frameSpecs: Object.freeze(frameSpecs.map((f) => Object.freeze(f))),
    background: Object.freeze(
      background ?? { enabled: false, color: "#ffffff" },
    ),
    spriteSheet:
      variantId === "png_spritesheet"
        ? Object.freeze({
            columns: Math.max(1, Math.floor(Number(spriteSheet?.columns) || 1)),
          })
        : null,
  });
}
