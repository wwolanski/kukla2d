import type { RgbaImageData } from '../domain/contracts.js';

export const MODULAR_SPRITE_MAX_FILE_BYTES = 50 * 1024 * 1024;
export const MODULAR_SPRITE_MAX_SIDE = 8192;
export const MODULAR_SPRITE_MAX_PIXELS = 20_000_000;
export const MODULAR_SPRITE_PREVIEW_SIDE = 1024;

const SUPPORTED_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);

export async function decodeModularSpriteFile(file: File): Promise<RgbaImageData> {
  if (file.size > MODULAR_SPRITE_MAX_FILE_BYTES) throw new Error('Image exceeds the 50 MiB limit');
  if (file.type && !SUPPORTED_TYPES.has(file.type)) throw new Error('Use a static PNG, JPEG, or WebP image');
  const bitmap = await createImageBitmap(file);
  try {
    if (bitmap.width > MODULAR_SPRITE_MAX_SIDE || bitmap.height > MODULAR_SPRITE_MAX_SIDE) {
      throw new Error(`Image dimensions exceed ${MODULAR_SPRITE_MAX_SIDE} px per side`);
    }
    if (bitmap.width * bitmap.height > MODULAR_SPRITE_MAX_PIXELS) {
      throw new Error('Image exceeds the 20 megapixel limit');
    }
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) throw new Error('2D canvas is unavailable');
    context.drawImage(bitmap, 0, 0);
    const imageData = context.getImageData(0, 0, bitmap.width, bitmap.height);
    return { width: imageData.width, height: imageData.height, data: imageData.data };
  } finally {
    bitmap.close();
  }
}

export function createPreviewImage(image: RgbaImageData, maximumSide = MODULAR_SPRITE_PREVIEW_SIDE): RgbaImageData {
  const scale = Math.min(1, maximumSide / Math.max(image.width, image.height));
  if (scale === 1) return { ...image, data: new Uint8ClampedArray(image.data) };
  const sourceCanvas = imageToCanvas(image);
  const width = Math.max(1, Math.round(image.width * scale));
  const height = Math.max(1, Math.round(image.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('2D canvas is unavailable');
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  context.drawImage(sourceCanvas, 0, 0, width, height);
  const imageData = context.getImageData(0, 0, width, height);
  return { width, height, data: imageData.data };
}

export async function encodeRgbaPng(image: RgbaImageData): Promise<Blob> {
  const canvas = imageToCanvas(image);
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('PNG encoder returned no data')), 'image/png');
  });
}

export function imageToCanvas(image: RgbaImageData): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = image.width;
  canvas.height = image.height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('2D canvas is unavailable');
  context.putImageData(new ImageData(new Uint8ClampedArray(image.data), image.width, image.height), 0, 0);
  return canvas;
}
