interface ViewportFitPart {
  type: string;
  imageBounds?: { minX: number; minY: number; maxX: number; maxY: number };
  imageWidth?: number;
  imageHeight?: number;
}

interface ViewportFitInput {
  viewportWidth: number;
  viewportHeight: number;
  parts: readonly ViewportFitPart[];
  fallbackWidth: number;
  fallbackHeight: number;
}

interface ViewportFit {
  zoom: number;
  panX: number;
  panY: number;
}

export const VIEWPORT_FIT_PADDING_PX = 32;
export const MIN_VIEWPORT_ZOOM = 0.05;
export const MAX_VIEWPORT_ZOOM = 20;

export function computeViewportFit({
  viewportWidth,
  viewportHeight,
  parts,
  fallbackWidth,
  fallbackHeight,
}: ViewportFitInput): ViewportFit | null {
  if (viewportWidth <= 0 || viewportHeight <= 0) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const part of parts) {
    if (part.type !== "part") continue;
    if (part.imageBounds) {
      minX = Math.min(minX, part.imageBounds.minX);
      minY = Math.min(minY, part.imageBounds.minY);
      maxX = Math.max(maxX, part.imageBounds.maxX);
      maxY = Math.max(maxY, part.imageBounds.maxY);
    } else if (part.imageWidth && part.imageHeight) {
      minX = Math.min(minX, 0);
      minY = Math.min(minY, 0);
      maxX = Math.max(maxX, part.imageWidth);
      maxY = Math.max(maxY, part.imageHeight);
    }
  }
  if (!Number.isFinite(minX) || minX >= maxX || minY >= maxY) {
    if (fallbackWidth <= 0 || fallbackHeight <= 0) return null;
    minX = 0;
    minY = 0;
    maxX = fallbackWidth;
    maxY = fallbackHeight;
  }
  const zoom = Math.max(
    MIN_VIEWPORT_ZOOM,
    Math.min(
      MAX_VIEWPORT_ZOOM,
      Math.min(
        viewportWidth / (maxX - minX + VIEWPORT_FIT_PADDING_PX * 2),
        viewportHeight / (maxY - minY + VIEWPORT_FIT_PADDING_PX * 2),
      ),
    ),
  );
  return {
    zoom,
    panX: viewportWidth / 2 - ((minX + maxX) / 2) * zoom,
    panY: viewportHeight / 2 - ((minY + maxY) / 2) * zoom,
  };
}
