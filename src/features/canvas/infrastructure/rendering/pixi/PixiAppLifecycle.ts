import { Application } from "pixi.js";

import { PIXI_RENDERER_OPTIONS } from "./pixiConstants.js";

import type { EditorView } from "../../../application/canvasRenderer.types.js";

interface PixiAppLifecycleOptions {
  canvas: HTMLCanvasElement;
  initialView?: EditorView;
}

export class PixiAppLifecycle {
  readonly canvas: HTMLCanvasElement;
  readonly initialView: EditorView | undefined;
  app: Application | null = null;
  readonly ready: Promise<void>;
  private disposed = false;

  constructor({ canvas, initialView }: PixiAppLifecycleOptions) {
    this.canvas = canvas;
    this.initialView = initialView;
    this.ready = this._initialize();
  }

  private async _initialize(): Promise<void> {
    const app = new Application();
    const resizeTo = this.canvas.parentElement;
    try {
      await app.init({
        ...PIXI_RENDERER_OPTIONS,
        canvas: this.canvas,
        autoStart: false,
        ...(resizeTo ? { resizeTo } : {}),
      });
    } catch (error) {
      try {
        app.destroy({ removeView: false }, { children: true });
      } catch {
        // Initialization may fail before Pixi creates every destroyable system.
      }
      throw error;
    }

    if (this.disposed) {
      app.destroy({ removeView: false }, { children: true });
      return;
    }
    this.app = app;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.app?.destroy({ removeView: false }, { children: true });
    this.app = null;
  }
}
