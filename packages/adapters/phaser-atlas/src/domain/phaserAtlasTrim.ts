import type { TrimResult } from "./phaserAtlasTrim.types.js";

export function scanAlphaBounds(
  width: number,
  height: number,
  rgba: Uint8ClampedArray,
  trim: boolean,
): TrimResult {
  if (!Number.isInteger(width) || width <= 0) {
    throw new Error(`width must be a positive integer, got ${width}`);
  }
  if (!Number.isInteger(height) || height <= 0) {
    throw new Error(`height must be a positive integer, got ${height}`);
  }
  const expectedLength = width * height * 4;
  if (rgba.length !== expectedLength) {
    throw new Error(
      `RGBA buffer length ${rgba.length} does not match ${width}×${height}×4 = ${expectedLength}`,
    );
  }

  if (!trim) {
    return {
      cropX: 0,
      cropY: 0,
      cropW: width,
      cropH: height,
      sourceWidth: width,
      sourceHeight: height,
      empty: false,
    };
  }

  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const alphaIndex = (y * width + x) * 4 + 3;
      if (rgba[alphaIndex]! > 0) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  if (maxX < 0) {
    return {
      cropX: 0,
      cropY: 0,
      cropW: 1,
      cropH: 1,
      sourceWidth: width,
      sourceHeight: height,
      empty: true,
    };
  }

  return {
    cropX: minX,
    cropY: minY,
    cropW: maxX - minX + 1,
    cropH: maxY - minY + 1,
    sourceWidth: width,
    sourceHeight: height,
    empty: false,
  };
}
