import { Container } from "pixi.js";

import { PixiViewportBridge } from "./PixiViewportBridge.js";

import type { EditorView } from "../../../application/canvasRenderer.types.js";
import type { Application } from "pixi.js";

interface PixiLayerGraphOptions {
  app: Application;
  initialView?: EditorView;
  onViewChange?: (view: EditorView) => void;
}

export class PixiLayerGraph {
  readonly app: Application;
  readonly contentLayer: Container;
  readonly overlayLayer: Container;
  readonly viewportBridge: PixiViewportBridge;

  constructor({ app, initialView, onViewChange }: PixiLayerGraphOptions) {
    this.app = app;
    this.viewportBridge = new PixiViewportBridge({
      app,
      ...(initialView ? { initialView } : {}),
      ...(onViewChange ? { onViewChange } : {}),
    });

    this.contentLayer = new Container();
    this.overlayLayer = new Container();

    this.viewportBridge.viewport.addChild(this.contentLayer);
    this.viewportBridge.viewport.addChild(this.overlayLayer);

    this.app.stage.addChild(this.viewportBridge.viewport);
  }

  dispose(): void {
    this.viewportBridge.dispose();
  }
}
