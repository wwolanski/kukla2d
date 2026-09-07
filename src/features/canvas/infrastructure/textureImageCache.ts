/**
 * Texture / imageData cache for the canvas.
 *
 * Consolidates two refs from `CanvasViewport`: `lastUploadedSources` (URI of the
 * most recently uploaded source) and `imageDataMapRef` (ImageData for alpha-based
 * picking) into one place with methods matching existing usage.
 */
interface TextureImageCache {
  getLastSource(partId: string): string | undefined;
  setLastSource(partId: string, source: string | null | undefined): void;
  getImageData(partId: string): ImageData | undefined;
  setImageData(partId: string, imageData: ImageData | null | undefined): void;
  clearImageData(): void;
  deletePart(partId: string): void;
  asImageDataLookup(): (partId: string) => ImageData | undefined;
  readonly __internal: {
    lastUploadedSources: Map<string, string>;
    imageDataByPartId: Map<string, ImageData>;
  };
}

export function createTextureImageCache(): TextureImageCache {
  const lastUploadedSources = new Map<string, string>();
  const imageDataByPartId = new Map<string, ImageData>();

  return {
    getLastSource(partId) {
      return lastUploadedSources.get(partId);
    },
    setLastSource(partId, source) {
      if (source === undefined || source === null)
        lastUploadedSources.delete(partId);
      else lastUploadedSources.set(partId, source);
    },
    getImageData(partId) {
      return imageDataByPartId.get(partId);
    },
    setImageData(partId, imageData) {
      if (imageData === undefined || imageData === null)
        imageDataByPartId.delete(partId);
      else imageDataByPartId.set(partId, imageData);
    },
    clearImageData() {
      imageDataByPartId.clear();
    },
    deletePart(partId) {
      lastUploadedSources.delete(partId);
      imageDataByPartId.delete(partId);
    },
    asImageDataLookup() {
      return (partId) => imageDataByPartId.get(partId);
    },
    __internal: { lastUploadedSources, imageDataByPartId },
  };
}
