import type { PartNode } from "@kukla2d/contracts";

import {
  dilateAlphaMask,
  traceAllContours,
  resampleContour,
} from "@/features/canvas/domain/mesh-generation/contour.js";

type ImageBounds = NonNullable<PartNode["imageBounds"]>;
type AlphaContour = [number, number][];

export function basename(filename: string): string {
  return filename.replace(/\.[^.]+$/, "");
}

export function computeImageBounds(
  imageData: ImageData,
  alphaThreshold = 10,
): ImageBounds | null {
  let minX = imageData.width,
    minY = imageData.height;
  let maxX = -1,
    maxY = -1;
  for (let y = 0; y < imageData.height; y++) {
    for (let x = 0; x < imageData.width; x++) {
      const alpha = imageData.data[(y * imageData.width + x) * 4 + 3] ?? 0;
      if (alpha > alphaThreshold) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  return minX <= maxX ? { minX, minY, maxX, maxY } : null;
}

export function computeAlphaContours(
  imageData: ImageData,
  alphaThreshold = 10,
): AlphaContour[] {
  const mask = dilateAlphaMask(
    imageData.data,
    imageData.width,
    imageData.height,
    alphaThreshold,
    0,
  );
  return traceAllContours(mask, imageData.width, imageData.height)
    .filter((contour) => contour.length >= 3)
    .map((contour) =>
      resampleContour(contour, Math.min(256, Math.max(24, contour.length))).map(
        ([x, y]): [number, number] => [x, y],
      ),
    );
}
