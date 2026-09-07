import { Viewport } from "pixi-viewport";

import { DEFAULT_WORLD_WIDTH, DEFAULT_WORLD_HEIGHT } from "./pixiConstants.js";

import type { EditorView } from "../../../application/canvasRenderer.types.js";
import type { Application, Point } from "pixi.js";

interface PixiViewportBridgeOptions {
  app: Application;
  initialView?: EditorView;
  onViewChange?: (view: EditorView) => void;
}

export class PixiViewportBridge {
  readonly app: Application;
  readonly viewport: Viewport;
  private readonly onViewChange: ((view: EditorView) => void) | undefined;
  private isApplyingExternalView = false;
  private readonly onMoved: () => void;

  constructor({ app, initialView, onViewChange }: PixiViewportBridgeOptions) {
    this.app = app;
    this.onViewChange = onViewChange;

    this.viewport = new Viewport({
      screenWidth: app.renderer.width,
      screenHeight: app.renderer.height,
      worldWidth: DEFAULT_WORLD_WIDTH,
      worldHeight: DEFAULT_WORLD_HEIGHT,
      events: app.renderer.events,
      disableOnContextMenu: true,
    });

    this.viewport.drag({ mouseButtons: "middle-right" }).pinch().wheel();

    try {
      this.viewport.clampZoom({ minScale: 0.05, maxScale: 20 });
    } catch {
      this.viewport.clampZoom({ minWidth: 500, maxWidth: 200000 });
    }

    this.onMoved = () => {
      if (!this.isApplyingExternalView && this.onViewChange) {
        this.onViewChange(this.readEditorView());
      }
    };
    this.viewport.on("moved", this.onMoved);

    if (initialView) {
      this.applyEditorView(initialView);
    }
  }

  applyEditorView(view: EditorView): void {
    this.isApplyingExternalView = true;
    this.viewport.scale.set(view.zoom);
    this.viewport.position.set(view.panX, view.panY);
    this.isApplyingExternalView = false;
  }

  readEditorView(): EditorView {
    return {
      zoom: this.viewport.scale.x,
      panX: this.viewport.position.x,
      panY: this.viewport.position.y,
    };
  }

  resize(width: number, height: number): void {
    this.viewport.resize(
      width,
      height,
      DEFAULT_WORLD_WIDTH,
      DEFAULT_WORLD_HEIGHT,
    );
  }

  toWorld(screenX: number, screenY: number): Point {
    return this.viewport.toWorld(screenX, screenY);
  }

  toScreen(worldX: number, worldY: number): Point {
    return this.viewport.toScreen(worldX, worldY);
  }

  dispose(): void {
    this.viewport.off("moved", this.onMoved);
    this.viewport.destroy({ children: true });
  }
}
