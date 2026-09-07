/**
 * Frame Capture Contract — K5 (request) and K6 (result).
 *
 * K5: FrameCaptureRequest
 *   { animationId, timeMs, width, height, format, quality, background, crop }
 *
 * K6: FrameCaptureResult
 *   { ok: true, dataUrl, width, height } | { ok: false, error: { code, message } }
 */
import { isRecord } from "@/lib/guards";

import type {
  FrameCaptureRequest,
  FrameCaptureResult,
} from "./frameCaptureContract.types.js";

type FrameCaptureFormat = "png" | "jpg" | "webp";

interface FrameCaptureInput {
  animationId?: unknown;
  animId?: unknown;
  timeMs?: unknown;
  width?: unknown;
  exportWidth?: unknown;
  height?: unknown;
  exportHeight?: unknown;
  format?: unknown;
  quality?: unknown;
  crop?: unknown;
  cropOffset?: unknown;
  bgEnabled?: unknown;
  bgColor?: unknown;
  background?: unknown;
}

const VALID_FORMATS: ReadonlySet<string> = new Set(["png", "jpg", "webp"]);

export function createFrameCaptureRequest(input: unknown): FrameCaptureRequest {
  if (!isRecord(input)) {
    throw new TypeError("FrameCaptureRequest: input must be an object");
  }

  const source: FrameCaptureInput = input;
  const rawAnimationId = source.animationId ?? source.animId;
  const animationId =
    typeof rawAnimationId === "string" ? rawAnimationId : null;
  const timeMs = Number(input.timeMs ?? 0);
  const width = Number(input.width ?? input.exportWidth ?? 0);
  const height = Number(input.height ?? input.exportHeight ?? 0);
  const format =
    typeof source.format === "string" ? source.format.toLowerCase() : "png";
  const quality = Number(input.quality ?? 0.92);
  const rawCrop = source.crop ?? source.cropOffset;
  const crop = isRecord(rawCrop) ? rawCrop : null;

  const background = isRecord(source.background) ? source.background : null;
  const bgEnabled =
    typeof source.bgEnabled === "boolean"
      ? source.bgEnabled
      : typeof background?.enabled === "boolean"
        ? background.enabled
        : true;
  const bgColor =
    typeof source.bgColor === "string"
      ? source.bgColor
      : typeof background?.color === "string"
        ? background.color
        : "#ffffff";

  if (!Number.isFinite(timeMs) || timeMs < 0) {
    throw new RangeError(
      `FrameCaptureRequest: timeMs must be >= 0, got ${timeMs}`,
    );
  }
  if (!Number.isFinite(width) || width <= 0) {
    throw new RangeError(
      `FrameCaptureRequest: width must be > 0, got ${width}`,
    );
  }
  if (!Number.isFinite(height) || height <= 0) {
    throw new RangeError(
      `FrameCaptureRequest: height must be > 0, got ${height}`,
    );
  }
  if (!VALID_FORMATS.has(format)) {
    throw new RangeError(
      `FrameCaptureRequest: format must be png|jpg|webp, got "${format}"`,
    );
  }
  if (!Number.isFinite(quality) || quality < 0 || quality > 1) {
    throw new RangeError(
      `FrameCaptureRequest: quality must be 0..1, got ${quality}`,
    );
  }
  if (
    crop &&
    (!Number.isFinite(Number(crop.x)) || !Number.isFinite(Number(crop.y)))
  ) {
    throw new RangeError("FrameCaptureRequest: crop x/y must be finite");
  }
  if (
    crop?.width != null &&
    (!Number.isFinite(Number(crop.width)) || Number(crop.width) <= 0)
  ) {
    throw new RangeError(
      "FrameCaptureRequest: crop width must be > 0 when provided",
    );
  }
  if (
    crop?.height != null &&
    (!Number.isFinite(Number(crop.height)) || Number(crop.height) <= 0)
  ) {
    throw new RangeError(
      "FrameCaptureRequest: crop height must be > 0 when provided",
    );
  }

  return {
    animationId,
    timeMs,
    width,
    height,
    format: format as FrameCaptureFormat,
    quality,
    background: { enabled: bgEnabled, color: bgColor },
    crop: crop
      ? {
          x: Number(crop.x ?? 0),
          y: Number(crop.y ?? 0),
          ...(crop.width == null ? {} : { width: Number(crop.width) }),
          ...(crop.height == null ? {} : { height: Number(crop.height) }),
        }
      : null,
  };
}

export function isFrameCaptureRequest(
  value: unknown,
): value is FrameCaptureRequest {
  return (
    isRecord(value) &&
    "animationId" in value &&
    "timeMs" in value &&
    "width" in value &&
    "height" in value &&
    "format" in value &&
    "quality" in value &&
    "background" in value &&
    "crop" in value
  );
}

export function createFrameCaptureSuccess(
  dataUrl: string,
  width: number,
  height: number,
): FrameCaptureResult {
  return { ok: true, dataUrl, width, height };
}

export function createFrameCaptureError(
  code: string,
  message: string,
): FrameCaptureResult {
  return { ok: false, error: { code: String(code), message: String(message) } };
}

export function isFrameCaptureResult(
  value: unknown,
): value is FrameCaptureResult {
  if (!isRecord(value) || typeof value.ok !== "boolean") return false;
  if (value.ok) {
    return (
      typeof value.dataUrl === "string" &&
      typeof value.width === "number" &&
      typeof value.height === "number"
    );
  }
  return (
    isRecord(value.error) &&
    typeof value.error.code === "string" &&
    typeof value.error.message === "string"
  );
}
