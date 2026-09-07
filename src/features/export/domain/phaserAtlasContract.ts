export const PHASER_ATLAS_VARIANT_ID = "phaser_atlas";
export const PHASER_ATLAS_PIPELINE_ID = "phaser_atlas";
export const PHASER_ATLAS_UI_LABEL = "Phaser 4.2.1 — Texture Atlas (Baked)";

export const PHASER_ATLAS_PAGE_SIZES = Object.freeze([2048, 4096]);

export const PHASER_ATLAS_OPTIONS = Object.freeze({
  fps: Object.freeze({ min: 1, max: 120 }),
  scale: Object.freeze({ min: 1, max: 400 }),
  padding: Object.freeze({ min: 0, max: 32, integer: true }),
  maxPageSize: Object.freeze({ values: PHASER_ATLAS_PAGE_SIZES }),
});

export const PHASER_ATLAS_DEFAULTS = Object.freeze({
  fps: 24,
  scale: 100,
  trim: true,
  padding: 2,
  maxPageSize: 2048,
  loop: true,
  destination: "zip",
});

export const PHASER_ATLAS_REPEAT = Object.freeze({
  fromLoop: (loop: boolean): number => (loop ? -1 : 0),
});

export const PHASER_ATLAS_ERROR_CODES = Object.freeze({
  INVALID_OPTION: "PHASER_ATLAS_INVALID_OPTION",
  NO_ANIMATIONS: "PHASER_ATLAS_NO_ANIMATIONS",
  DUPLICATE_KEY: "PHASER_ATLAS_DUPLICATE_KEY",
  OVERSIZED_FRAME: "PHASER_ATLAS_OVERSIZED_FRAME",
  INVALID_SCHEMA: "PHASER_ATLAS_INVALID_SCHEMA",
});

import type { PhaserAtlasExportOptions } from "@kukla2d/contracts";

interface PhaserAtlasValidationIssue {
  code: string;
  path: keyof PhaserAtlasExportOptions;
  message: string;
}

export function sanitizePhaserAtlasName(name: unknown): string {
  if (typeof name !== "string" || name.length === 0) return "untitled";
  return (
    name
      .replace(/[^a-zA-Z0-9_-]/g, "_")
      .replace(/_+/g, "_")
      .replace(/^_+|_+$/g, "") || "untitled"
  );
}

export function buildPhaserAtlasFrameIdentity(
  animName: string,
  animId: string,
  frameIndex: number,
): string {
  const safeName = sanitizePhaserAtlasName(animName);
  const padded = String(frameIndex).padStart(4, "0");
  return `${safeName}-${animId}/${padded}`;
}

export function resolvePhaserAtlasCollision(
  existingKeys: ReadonlySet<string>,
  candidate: string,
): string {
  if (!existingKeys.has(candidate)) return candidate;
  let suffix = 2;
  while (existingKeys.has(`${candidate}_${suffix}`)) suffix++;
  return `${candidate}_${suffix}`;
}

export function validatePhaserAtlasOptions(
  options: Partial<PhaserAtlasExportOptions> | null | undefined,
): PhaserAtlasValidationIssue[] {
  const errors: PhaserAtlasValidationIssue[] = [];
  const { fps, scale, padding, maxPageSize, animations } = options ?? {};

  if (!animations || !Array.isArray(animations) || animations.length === 0) {
    errors.push({
      code: PHASER_ATLAS_ERROR_CODES.NO_ANIMATIONS,
      path: "animations",
      message: "At least one animation is required",
    });
  }

  if (fps != null) {
    if (
      !Number.isFinite(fps) ||
      fps < PHASER_ATLAS_OPTIONS.fps.min ||
      fps > PHASER_ATLAS_OPTIONS.fps.max
    ) {
      errors.push({
        code: PHASER_ATLAS_ERROR_CODES.INVALID_OPTION,
        path: "fps",
        message: `fps must be ${PHASER_ATLAS_OPTIONS.fps.min}..${PHASER_ATLAS_OPTIONS.fps.max}`,
      });
    }
  }

  if (scale != null) {
    if (
      !Number.isFinite(scale) ||
      scale < PHASER_ATLAS_OPTIONS.scale.min ||
      scale > PHASER_ATLAS_OPTIONS.scale.max
    ) {
      errors.push({
        code: PHASER_ATLAS_ERROR_CODES.INVALID_OPTION,
        path: "scale",
        message: `scale must be ${PHASER_ATLAS_OPTIONS.scale.min}..${PHASER_ATLAS_OPTIONS.scale.max}`,
      });
    }
  }

  if (padding != null) {
    if (
      !Number.isFinite(padding) ||
      padding < PHASER_ATLAS_OPTIONS.padding.min ||
      padding > PHASER_ATLAS_OPTIONS.padding.max ||
      padding !== Math.floor(padding)
    ) {
      errors.push({
        code: PHASER_ATLAS_ERROR_CODES.INVALID_OPTION,
        path: "padding",
        message: `padding must be integer ${PHASER_ATLAS_OPTIONS.padding.min}..${PHASER_ATLAS_OPTIONS.padding.max}`,
      });
    }
  }

  if (maxPageSize != null) {
    if (!PHASER_ATLAS_OPTIONS.maxPageSize.values.includes(maxPageSize)) {
      errors.push({
        code: PHASER_ATLAS_ERROR_CODES.INVALID_OPTION,
        path: "maxPageSize",
        message: `maxPageSize must be one of ${PHASER_ATLAS_OPTIONS.maxPageSize.values.join(", ")}`,
      });
    }
  }

  return errors;
}
