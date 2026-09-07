/**
 * Export Area size presets — K3 contract (Plan 34, R3).
 *
 * Frozen use-case/resolution catalog. Labels describe aspect ratio and
 * resolution intent, never engine/program compatibility (C5, ADR-34-1).
 * Patch helpers return ONLY {width,height} — origin and visibility are
 * never touched (C4, R4).
 */

/**
 * @typedef {'square-256'|'square-512'|'square-1024'|'pixel-16-9'|'hd-720'|'full-hd'|'portrait-720'|'classic-4-3'} ExportAreaPresetId
 */

/**
 * @typedef {Object} ExportAreaPreset
 * @property {ExportAreaPresetId} id
 * @property {string} label
 * @property {number} width
 * @property {number} height
 * @property {'Square'|'Landscape'|'Portrait'|'Classic'} group
 */

import type { Canvas } from "@kukla2d/contracts";

type ExportAreaPresetId = Exclude<NonNullable<Canvas["presetId"]>, "custom">;
type ExportAreaPresetGroup = "Square" | "Landscape" | "Portrait" | "Classic";

interface ExportAreaPreset {
  id: ExportAreaPresetId;
  label: string;
  width: number;
  height: number;
  group: ExportAreaPresetGroup;
}

export const EXPORT_AREA_PRESETS: readonly Readonly<ExportAreaPreset>[] =
  Object.freeze([
    {
      id: "square-256",
      label: "256 × 256",
      width: 256,
      height: 256,
      group: "Square",
    },
    {
      id: "square-512",
      label: "512 × 512",
      width: 512,
      height: 512,
      group: "Square",
    },
    {
      id: "square-1024",
      label: "1024 × 1024",
      width: 1024,
      height: 1024,
      group: "Square",
    },
    {
      id: "pixel-16-9",
      label: "640 × 360 (16:9)",
      width: 640,
      height: 360,
      group: "Landscape",
    },
    {
      id: "hd-720",
      label: "1280 × 720",
      width: 1280,
      height: 720,
      group: "Landscape",
    },
    {
      id: "full-hd",
      label: "1920 × 1080",
      width: 1920,
      height: 1080,
      group: "Landscape",
    },
    {
      id: "portrait-720",
      label: "720 × 1280",
      width: 720,
      height: 1280,
      group: "Portrait",
    },
    {
      id: "classic-4-3",
      label: "800 × 600 (4:3)",
      width: 800,
      height: 600,
      group: "Classic",
    },
  ]);

const PRESET_BY_ID = new Map(EXPORT_AREA_PRESETS.map((p) => [p.id, p]));

(() => {
  const ids = EXPORT_AREA_PRESETS.map((p) => p.id);
  if (new Set(ids).size !== ids.length) {
    throw new Error("exportAreaPresets: duplicate preset id");
  }
  for (const preset of EXPORT_AREA_PRESETS) {
    if (!Number.isInteger(preset.width) || preset.width < 1) {
      throw new RangeError(
        `exportAreaPresets: preset ${preset.id} has invalid width`,
      );
    }
    if (!Number.isInteger(preset.height) || preset.height < 1) {
      throw new RangeError(
        `exportAreaPresets: preset ${preset.id} has invalid height`,
      );
    }
  }
})();

export const CUSTOM_PRESET_ID = "custom";

export function getExportAreaPreset(
  id: unknown,
): Readonly<ExportAreaPreset> | null {
  if (typeof id !== "string") return null;
  return PRESET_BY_ID.get(id as ExportAreaPresetId) ?? null;
}

export function matchExportAreaPreset(
  canvas: Partial<Canvas> = {},
): ExportAreaPresetId | typeof CUSTOM_PRESET_ID {
  const { width, height, presetId: explicitPresetId } = canvas;
  if (explicitPresetId === CUSTOM_PRESET_ID) return CUSTOM_PRESET_ID;
  const explicitPreset =
    explicitPresetId === undefined
      ? undefined
      : PRESET_BY_ID.get(explicitPresetId);
  if (
    explicitPreset &&
    explicitPreset.width === width &&
    explicitPreset.height === height
  ) {
    return explicitPreset.id;
  }
  if (
    typeof width !== "number" ||
    typeof height !== "number" ||
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width < 1 ||
    height < 1
  ) {
    return CUSTOM_PRESET_ID;
  }
  for (const preset of EXPORT_AREA_PRESETS) {
    if (preset.width === width && preset.height === height) {
      return preset.id;
    }
  }
  return CUSTOM_PRESET_ID;
}

export function createExportAreaPresetPatch(
  id: unknown,
): Readonly<Pick<Canvas, "width" | "height">> {
  if (typeof id !== "string") {
    throw new TypeError(
      `createExportAreaPresetPatch: id must be a string, got ${String(id)}`,
    );
  }
  if (id === CUSTOM_PRESET_ID) {
    throw new TypeError(
      "createExportAreaPresetPatch: custom preset has no size patch",
    );
  }
  const preset = PRESET_BY_ID.get(id as ExportAreaPresetId);
  if (!preset) {
    throw new RangeError(
      `createExportAreaPresetPatch: unknown preset id "${id}"`,
    );
  }
  return Object.freeze({ width: preset.width, height: preset.height });
}
