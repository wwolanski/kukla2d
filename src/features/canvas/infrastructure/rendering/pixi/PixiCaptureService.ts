import type { PixiViewportBridge } from "./PixiViewportBridge.js";
import type { CaptureOptions } from "../../../application/canvasRenderer.types.js";
import type { Application } from "pixi.js";

interface PixiCaptureServiceOptions {
  app: Application;
  viewportBridge: PixiViewportBridge;
}

export class PixiCaptureService {
  private readonly app: Application;
  private readonly viewportBridge: PixiViewportBridge;

  constructor({ app, viewportBridge }: PixiCaptureServiceOptions) {
    this.app = app;
    this.viewportBridge = viewportBridge;
  }

  capture(options: CaptureOptions = {}): ImageData | null {
    const renderer = this.app.renderer;
    const prevWidth = renderer.width;
    const prevHeight = renderer.height;

    const needsResize =
      options.width != null &&
      options.height != null &&
      (options.width !== prevWidth || options.height !== prevHeight);

    const captureWidth = needsResize ? options.width : prevWidth;
    const captureHeight = needsResize ? options.height : prevHeight;
    if (captureWidth === undefined || captureHeight === undefined) return null;

    try {
      if (needsResize) renderer.resize(captureWidth, captureHeight);
      this.app.render();

      const gl = "gl" in renderer ? renderer.gl : null;
      if (!gl) return null;
      const pixels = new Uint8Array(captureWidth * captureHeight * 4);
      gl.readPixels(
        0,
        0,
        captureWidth,
        captureHeight,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        pixels,
      );

      const rows = new Uint8Array(pixels.length);
      const rowStride = captureWidth * 4;
      for (let y = 0; y < captureHeight; y++) {
        const srcOffset = (captureHeight - 1 - y) * rowStride;
        const dstOffset = y * rowStride;
        rows.set(pixels.subarray(srcOffset, srcOffset + rowStride), dstOffset);
      }

      return new ImageData(
        new Uint8ClampedArray(rows.buffer),
        captureWidth,
        captureHeight,
      );
    } finally {
      if (needsResize) {
        renderer.resize(prevWidth, prevHeight);
        this.viewportBridge.resize(prevWidth, prevHeight);
        this.app.render();
      }
    }
  }
}
