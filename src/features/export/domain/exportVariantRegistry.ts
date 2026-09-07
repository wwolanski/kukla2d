import type {
  ExportPipelineId,
  ExportVariantDefinition,
  ExportVariantId,
} from "@kukla2d/contracts";

import type {
  ExportFormat,
  ExportTypeId,
} from "./exportVariantRegistry.types.js";

interface ExportTypeDefinition {
  id: ExportTypeId;
  label: string;
  status: "active" | "unactive";
}

export const EXPORT_TYPES: readonly Readonly<ExportTypeDefinition>[] =
  Object.freeze([
    Object.freeze({
      id: "sequence",
      label: "Image sequence",
      status: "active",
    }),
    Object.freeze({
      id: "spritesheet",
      label: "Spritesheet",
      status: "active",
    }),
    Object.freeze({
      id: "animation",
      label: "Animated image",
      status: "active",
    }),
    Object.freeze({
      id: "live2d_project",
      label: "Live2D Project",
      status: "unactive",
    }),
    Object.freeze({
      id: "live2d",
      label: "Live2D Runtime",
      status: "unactive",
    }),
    Object.freeze({ id: "spine", label: "Spine 2D", status: "unactive" }),
    Object.freeze({
      id: "phaser_atlas",
      label: "Phaser 4.2.1",
      status: "active",
    }),
  ]);

export const EXPORT_VARIANTS: readonly Readonly<ExportVariantDefinition>[] =
  Object.freeze([
    Object.freeze({
      id: "png_sequence",
      type: "sequence",
      format: "png",
      formatLabel: "PNG",
      label: "PNG Sequence",
      status: "active",
      pipeline: "raster",
    }),
    Object.freeze({
      id: "png_spritesheet",
      type: "spritesheet",
      format: "png",
      formatLabel: "PNG",
      label: "PNG Spritesheet",
      status: "active",
      pipeline: "raster",
    }),
    Object.freeze({
      id: "gif",
      type: "animation",
      format: "gif",
      formatLabel: "GIF",
      label: "GIF",
      status: "active",
      pipeline: "raster",
    }),
    Object.freeze({
      id: "live2d_project",
      label: "Live2D Project",
      status: "unactive",
      pipeline: null,
    }),
    Object.freeze({
      id: "live2d",
      label: "Live2D Runtime",
      status: "unactive",
      pipeline: null,
    }),
    Object.freeze({
      id: "spine",
      label: "Spine JSON",
      status: "unactive",
      pipeline: null,
    }),
    Object.freeze({
      id: "phaser_atlas",
      label: "Phaser 4.2.1 — Texture Atlas (Baked)",
      status: "active",
      pipeline: "phaser_atlas",
    }),
  ]);

const VARIANT_MAP = new Map(EXPORT_VARIANTS.map((v) => [v.id, v]));

export function listExportTypes(): readonly Readonly<ExportTypeDefinition>[] {
  return EXPORT_TYPES;
}

export function listExportFormats(
  type: ExportTypeId,
): readonly Readonly<ExportVariantDefinition>[] {
  return EXPORT_VARIANTS.filter(
    (v) => v.status === "active" && v.type === type,
  );
}

export function getDefaultExportFormat(
  type: ExportTypeId,
): ExportFormat | null {
  return listExportFormats(type)[0]?.format ?? null;
}

export function getExportVariantForSelection(
  type: ExportTypeId,
  format: ExportFormat | null,
): Readonly<ExportVariantDefinition> | null {
  return (
    EXPORT_VARIANTS.find(
      (variant) =>
        variant.status === "active" &&
        variant.type === type &&
        variant.format === format,
    ) ?? null
  );
}

export function resolveExportVariantSelection(
  type: ExportTypeId,
  format: ExportFormat | null,
): Readonly<ExportVariantDefinition> {
  const variant = getExportVariantForSelection(type, format);
  if (!variant) throw new UnsupportedFormatError(`${type}/${format}`);
  return variant;
}

export function listExportVariants(): readonly Readonly<ExportVariantDefinition>[] {
  return EXPORT_VARIANTS;
}

export function getExportVariantDefinition(
  id: ExportVariantId,
): Readonly<ExportVariantDefinition> | null {
  return VARIANT_MAP.get(id) ?? null;
}

export class UnsupportedFormatError extends Error {
  readonly code = "UNSUPPORTED_FORMAT";

  constructor(id: string) {
    super(`UNSUPPORTED_FORMAT: ${id} is not an active export variant`);
    this.name = "UnsupportedFormatError";
  }
}

export function resolveActiveExportVariant(
  id: ExportVariantId,
): Readonly<ExportVariantDefinition> {
  const def = VARIANT_MAP.get(id);
  if (!def || def.status !== "active") throw new UnsupportedFormatError(id);
  return def;
}

export function resolveExportPipeline(id: ExportVariantId): ExportPipelineId {
  const def = VARIANT_MAP.get(id);
  if (!def || def.status !== "active" || def.pipeline === null) {
    throw new UnsupportedFormatError(id);
  }
  return def.pipeline;
}
