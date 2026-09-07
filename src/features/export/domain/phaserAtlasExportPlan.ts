import type {
  ExportAreaContract,
  PhaserAtlasExportPlan,
} from "@kukla2d/contracts";

import { computeExportFrameSpecs } from "./exportFrameSpecs.js";
import {
  validatePhaserAtlasOptions,
  PHASER_ATLAS_DEFAULTS,
  PHASER_ATLAS_VARIANT_ID,
} from "./phaserAtlasContract.js";

import type { ExportFrameAnimation } from "./exportFrameSpecs.types.js";

interface CreatePhaserAtlasExportPlanOptions {
  area: ExportAreaContract;
  fps?: number;
  scale?: number;
  animations: ExportFrameAnimation[];
  trim?: boolean;
  padding?: number;
  maxPageSize?: number;
  loop?: boolean;
  outputName?: string;
  destination?: "zip" | "folder";
  background?: { enabled: boolean; color: string };
}

export function createPhaserAtlasExportPlan({
  area,
  fps,
  scale,
  animations,
  trim,
  padding,
  maxPageSize,
  loop,
  outputName,
  destination,
  background,
}: CreatePhaserAtlasExportPlanOptions): Readonly<PhaserAtlasExportPlan> {
  if (!area || typeof area !== "object") {
    throw new TypeError("createPhaserAtlasExportPlan: area must be an object");
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
      "createPhaserAtlasExportPlan: area.source must have finite x/y and positive width/height",
    );
  }
  if (!Number.isFinite(area.outputWidth) || area.outputWidth <= 0) {
    throw new TypeError(
      "createPhaserAtlasExportPlan: area.outputWidth must be > 0",
    );
  }
  if (!Number.isFinite(area.outputHeight) || area.outputHeight <= 0) {
    throw new TypeError(
      "createPhaserAtlasExportPlan: area.outputHeight must be > 0",
    );
  }

  const effectiveFps =
    typeof fps === "number" && Number.isFinite(fps)
      ? fps
      : PHASER_ATLAS_DEFAULTS.fps;
  const effectiveScale =
    typeof scale === "number" && Number.isFinite(scale)
      ? scale
      : PHASER_ATLAS_DEFAULTS.scale;
  const effectiveTrim =
    trim !== undefined ? Boolean(trim) : PHASER_ATLAS_DEFAULTS.trim;
  const effectivePadding =
    typeof padding === "number" && Number.isFinite(padding)
      ? Math.floor(padding)
      : PHASER_ATLAS_DEFAULTS.padding;
  const effectiveMaxPageSize =
    typeof maxPageSize === "number" && Number.isFinite(maxPageSize)
      ? maxPageSize
      : PHASER_ATLAS_DEFAULTS.maxPageSize;
  const effectiveLoop =
    loop !== undefined ? Boolean(loop) : PHASER_ATLAS_DEFAULTS.loop;
  const effectiveDest = destination === "folder" ? "folder" : "zip";

  if (background?.enabled) {
    throw new RangeError(
      "createPhaserAtlasExportPlan: opaque background is not supported; Phaser atlas export requires transparency",
    );
  }

  const validationErrors = validatePhaserAtlasOptions({
    fps: effectiveFps,
    scale: effectiveScale,
    padding: effectivePadding,
    maxPageSize: effectiveMaxPageSize,
    animations,
  });
  if (validationErrors.length > 0) {
    throw new RangeError(
      `createPhaserAtlasExportPlan: ${validationErrors.map((e) => e.message).join("; ")}`,
    );
  }

  const frameSpecs = computeExportFrameSpecs({
    animsToExport: animations,
    exportFps: effectiveFps,
  });

  if (frameSpecs.length === 0) {
    throw new RangeError(
      "createPhaserAtlasExportPlan: no frames generated from animation specs",
    );
  }

  return Object.freeze({
    variantId: PHASER_ATLAS_VARIANT_ID,
    area: Object.freeze({
      source: Object.freeze({ ...area.source }),
      outputWidth: area.outputWidth,
      outputHeight: area.outputHeight,
    }),
    fps: effectiveFps,
    scale: effectiveScale,
    animations: Object.freeze(
      animations.map((animation) => Object.freeze({ ...animation })),
    ),
    frameSpecs: Object.freeze(frameSpecs.map((f) => Object.freeze(f))),
    background: Object.freeze({ enabled: false, color: "#ffffff" }),
    trim: effectiveTrim,
    padding: effectivePadding,
    maxPageSize: effectiveMaxPageSize,
    loop: effectiveLoop,
    outputName: String(outputName ?? "phaser-export"),
    destination: effectiveDest,
  });
}
