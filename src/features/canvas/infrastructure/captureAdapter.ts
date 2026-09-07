/**
 * Capture adapter — utility for canvas capture/export data URLs.
 *
 * Centralizes `document.createElement('canvas')` used in export and thumbnail
 * generation. `useCanvasCapture` uses these helpers without direct DOM access.
 */

interface CaptureDataUrlOptions {
  format?: string;
  quality?: number;
  bgEnabled?: boolean;
  bgColor?: string;
  width?: number;
  height?: number;
}

interface ImageDataUrlOptions {
  format?: string;
  quality?: number;
  bgEnabled?: boolean;
  bgColor?: string;
}

interface ThumbnailOptions {
  maxWidth?: number;
  mimeType?: string;
  quality?: number;
}

function get2dContext(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas 2D context is unavailable");
  return context;
}

export function captureCanvasDataUrl(
  canvas: HTMLCanvasElement,
  {
    format,
    quality,
    bgEnabled,
    bgColor,
    width,
    height,
  }: CaptureDataUrlOptions = {},
): string {
  const exportW = width ?? canvas.width;
  const exportH = height ?? canvas.height;
  const isExport = exportW !== canvas.width || exportH !== canvas.height;

  if (isExport) {
    const tmp = document.createElement("canvas");
    tmp.width = exportW;
    tmp.height = exportH;
    const ctx = get2dContext(tmp);
    if (bgEnabled) {
      ctx.fillStyle = bgColor ?? "#ffffff";
      ctx.fillRect(0, 0, exportW, exportH);
    }
    ctx.drawImage(canvas, 0, 0, exportW, exportH);
    return tmp.toDataURL(format ?? "image/png", quality ?? 0.92);
  }

  if (bgEnabled) {
    const tmp = document.createElement("canvas");
    tmp.width = canvas.width;
    tmp.height = canvas.height;
    const ctx = get2dContext(tmp);
    ctx.fillStyle = bgColor ?? "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(canvas, 0, 0);
    return tmp.toDataURL(format ?? "image/png", quality ?? 0.92);
  }

  return canvas.toDataURL(format ?? "image/png", quality ?? 0.92);
}

export function imageDataToDataUrl(
  imageData: ImageData,
  {
    format = "image/png",
    quality = 0.92,
    bgEnabled = false,
    bgColor = "#ffffff",
  }: ImageDataUrlOptions = {},
): string {
  const { width, height } = imageData;
  const tmp = document.createElement("canvas");
  tmp.width = width;
  tmp.height = height;
  const ctx = get2dContext(tmp);

  if (bgEnabled) {
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, width, height);
  }

  ctx.putImageData(imageData, 0, 0);
  return tmp.toDataURL(format, quality);
}

export function captureThumbnail(
  canvas: HTMLCanvasElement,
  {
    maxWidth = 400,
    mimeType = "image/webp",
    quality = 0.8,
  }: ThumbnailOptions = {},
): string {
  const srcW = canvas.width;
  const srcH = canvas.height;
  const scale = Math.min(1, maxWidth / srcW);
  const w = Math.round(srcW * scale);
  const h = Math.round(srcH * scale);
  const tmp = document.createElement("canvas");
  tmp.width = w;
  tmp.height = h;
  const ctx = get2dContext(tmp);
  ctx.drawImage(canvas, 0, 0, w, h);
  return tmp.toDataURL(mimeType, quality);
}
