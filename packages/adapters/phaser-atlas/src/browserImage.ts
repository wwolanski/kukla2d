import type { DecodedPng, PageComposeSource } from "./browserImage.types.js";

export async function decodePngDataUrl(
  dataUrl: string,
  signal?: AbortSignal,
): Promise<DecodedPng> {
  if (signal?.aborted) throw new AbortError();
  const res = await fetch(dataUrl);
  if (signal?.aborted) throw new AbortError();
  const blob = await res.blob();
  if (signal?.aborted) throw new AbortError();
  const bitmap = await createImageBitmap(blob);
  try {
    if (signal?.aborted) throw new AbortError();
    const w = bitmap.width;
    const h = bitmap.height;
    const canvas = new OffscreenCanvas(w, h);
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(bitmap, 0, 0);
    const imageData = ctx.getImageData(0, 0, w, h);
    return { rgba: imageData.data, width: w, height: h };
  } finally {
    bitmap.close?.();
  }
}

export async function composePageBlob(
  width: number,
  height: number,
  sources: PageComposeSource[],
  signal?: AbortSignal,
): Promise<Blob> {
  if (signal?.aborted) throw new AbortError();
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext("2d")!;
  ctx.clearRect(0, 0, width, height);

  for (const s of sources) {
    if (signal?.aborted) throw new AbortError();
    if (s.crop.w <= 0 || s.crop.h <= 0) continue;
    const sw = s.srcWidth;
    const sh = Math.floor(s.rgba.length / (sw * 4));
    if (sw <= 0 || sh <= 0) continue;
    const srcCanvas = new OffscreenCanvas(sw, sh);
    const srcCtx = srcCanvas.getContext("2d")!;
    const imgData = new ImageData(new Uint8ClampedArray(s.rgba), sw, sh);
    srcCtx.putImageData(imgData, 0, 0);
    ctx.drawImage(
      srcCanvas,
      s.crop.x,
      s.crop.y,
      s.crop.w,
      s.crop.h,
      s.dstX,
      s.dstY,
      s.crop.w,
      s.crop.h,
    );
  }

  return canvas.convertToBlob({ type: "image/png" });
}

export class AbortError extends Error {
  constructor() {
    super("Aborted");
    this.name = "AbortError";
  }
}
