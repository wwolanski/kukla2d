import type { ProjectDocument, Vertex } from "@kukla2d/contracts";

import {
  createPerformanceCounters,
  incrementCounter,
  recordTiming,
  resetCounters,
  snapshotStats,
} from "@/features/canvas/domain/pixiPerformanceMetrics.js";
import type {
  PixiPerformanceCounters,
  PixiRuntimeStats,
} from "@/features/canvas/domain/pixiPerformanceMetrics.types.js";

import { PixiAppLifecycle } from "./PixiAppLifecycle.js";
import { PixiCaptureService } from "./PixiCaptureService.js";
import { PixiFrameRenderer } from "./PixiFrameRenderer.js";
import { PixiInteractionSystem } from "./PixiInteractionSystem.js";
import { PixiLayerGraph } from "./PixiLayerGraph.js";
import { PixiOverlayRenderer } from "./PixiOverlayRenderer.js";
import { PixiResourceRegistry } from "./PixiResourceRegistry.js";

import type { PixiInteractionSystemOptions } from "./pixiInteractionContracts.types.js";
import type { PixiSceneGatewayOptions } from "./PixiSceneGateway.types.js";
import type { PixiViewportBridge } from "./PixiViewportBridge.js";
import type {
  CanvasFrame,
  CanvasMeshData,
  CanvasTextureSource,
  CaptureOptions,
  DrawFrameOptions,
  EditorView,
  RendererResourceRegistry,
} from "../../../application/canvasRenderer.types.js";
import type { Application, Container } from "pixi.js";

interface StagedCanvasResources {
  readonly resources: RendererResourceRegistry;
  uploadTexture(partId: string, image: CanvasTextureSource): void;
  uploadMesh(partId: string, mesh: CanvasMeshData): void;
  uploadQuadFallback(partId: string, width: number, height: number): void;
  commit(): RendererResourceRegistry;
  dispose(): void;
}

type InteractionSystemOptions = Omit<
  PixiInteractionSystemOptions,
  | "viewportBridge"
  | "overlayLayer"
  | "metrics"
  | "uploadMesh"
  | "uploadPositions"
>;

export class PixiSceneGateway {
  readonly canvas: HTMLCanvasElement;
  readonly onViewChange: ((view: EditorView) => void) | undefined;
  readonly initialView: EditorView | undefined;
  readonly ready: Promise<void>;
  resources: PixiResourceRegistry | null = null;
  overlayRenderer: InstanceType<typeof PixiOverlayRenderer> | null = null;
  interactionSystem: InstanceType<typeof PixiInteractionSystem> | null = null;
  markDirty: (() => void) | null = null;
  private lifecycle: PixiAppLifecycle | null;
  private layers: PixiLayerGraph | null = null;
  private frameRenderer: PixiFrameRenderer | null = null;
  private captureService: PixiCaptureService | null = null;
  private readonly metrics: PixiPerformanceCounters =
    createPerformanceCounters();
  private disposed = false;

  constructor({ canvas, onViewChange, initialView }: PixiSceneGatewayOptions) {
    this.canvas = canvas;
    this.onViewChange = onViewChange;
    this.initialView = initialView;

    this.lifecycle = new PixiAppLifecycle({
      canvas,
      ...(initialView ? { initialView } : {}),
    });
    this.ready = this._initialize();
  }

  private async _initialize(): Promise<void> {
    const lifecycle = this.lifecycle;
    if (!lifecycle) return;
    await lifecycle.ready;
    if (this.disposed || this.lifecycle !== lifecycle) return;
    const app = lifecycle.app;
    if (!app) return;

    this.layers = new PixiLayerGraph({
      app,
      ...(this.initialView ? { initialView: this.initialView } : {}),
      onViewChange: (view) => {
        this.onViewChange?.(view);
        this.markDirty?.();
      },
    });

    this.resources = new PixiResourceRegistry({ app });

    this.frameRenderer = new PixiFrameRenderer({
      resources: this.resources,
      contentLayer: this.layers.contentLayer,
      viewportBridge: this.layers.viewportBridge,
    });

    this.captureService = new PixiCaptureService({
      app,
      viewportBridge: this.layers.viewportBridge,
    });

    this.overlayRenderer = new PixiOverlayRenderer({
      overlayLayer: this.layers.overlayLayer,
    });

    if (this.initialView) {
      this.layers.viewportBridge.applyEditorView(this.initialView);
    }
  }

  get viewportBridge(): PixiViewportBridge | null {
    return this.layers?.viewportBridge ?? null;
  }

  get contentLayer(): Container | null {
    return this.layers?.contentLayer ?? null;
  }

  get overlayLayer(): Container | null {
    return this.layers?.overlayLayer ?? null;
  }

  get app(): Application | null {
    return this.lifecycle?.app ?? null;
  }

  createInteractionSystem({
    projectRef,
    editorRef,
    animationRef,
    updateProject,
    setSelection,
    markDirty,
    workflowActor,
    imageDataByPartId,
    executeCommand,
    animationAuthoringAdapter,
  }: InteractionSystemOptions): InstanceType<
    typeof PixiInteractionSystem
  > | null {
    if (!this.viewportBridge || !this.overlayLayer) return null;
    this.markDirty = markDirty;
    this.interactionSystem = new PixiInteractionSystem({
      viewportBridge: this.viewportBridge,
      overlayLayer: this.overlayLayer,
      projectRef,
      editorRef,
      animationRef,
      updateProject,
      setSelection,
      markDirty,
      workflowActor,
      metrics: this.metrics,
      ...(imageDataByPartId ? { imageDataByPartId } : {}),
      executeCommand,
      uploadMesh: (partId: string, mesh: CanvasMeshData) =>
        this.uploadMesh(partId, mesh),
      uploadPositions: (
        partId: string,
        vertices: Vertex[],
        uvs?: ArrayLike<number>,
      ) => this.uploadPositions(partId, vertices, uvs),
      ...(animationAuthoringAdapter !== undefined
        ? { animationAuthoringAdapter }
        : {}),
    });
    this.interactionSystem.bind();
    return this.interactionSystem;
  }

  draw(
    project: ProjectDocument,
    editor: object,
    isDark: boolean,
    poseOverrides: object,
    options?: object,
  ): void {
    void project;
    void editor;
    void isDark;
    void poseOverrides;
    void options;
    this.render();
  }

  render(): void {
    if (!this.app) return;
    const start = performance.now();
    this.app.render();
    incrementCounter(this.metrics, "renderCount");
    recordTiming(this.metrics, "renderTotalMs", performance.now() - start);
  }

  drawFrame(frame: CanvasFrame, options: DrawFrameOptions = {}): void {
    if (!this.app || !this.contentLayer || !this.frameRenderer) return;
    const shouldRender = this.frameRenderer.drawFrame(frame, options);
    if (shouldRender) {
      this.render();
    }
  }

  uploadTexture(partId: string, image: CanvasTextureSource): void {
    if (!this.resources) return;
    this.resources.uploadTexture(partId, image);
    incrementCounter(this.metrics, "gpuUploadCount");
  }

  uploadMesh(partId: string, mesh: CanvasMeshData): void {
    if (!this.resources) return;
    this.resources.uploadMesh(partId, mesh);
    incrementCounter(this.metrics, "gpuUploadCount");
  }

  uploadQuadFallback(partId: string, width: number, height: number): void {
    if (!this.resources) return;
    this.resources.uploadQuadFallback(partId, width, height);
    incrementCounter(this.metrics, "gpuUploadCount");
  }

  uploadPositions(
    partId: string,
    vertices: Vertex[],
    uvs?: ArrayLike<number>,
  ): void {
    if (!this.resources) return;
    this.resources.uploadPositions(partId, vertices, uvs);
    incrementCounter(this.metrics, "gpuUploadCount");
  }

  createStagedResources(): StagedCanvasResources | null {
    if (!this.app) return null;
    const resources = new PixiResourceRegistry({ app: this.app });
    let committed = false;
    let disposed = false;

    return {
      resources,
      uploadTexture(partId: string, image: CanvasTextureSource): void {
        if (disposed || committed)
          throw new Error("Staged resources are closed");
        resources.uploadTexture(partId, image);
      },
      uploadMesh(partId: string, mesh: CanvasMeshData): void {
        if (disposed || committed)
          throw new Error("Staged resources are closed");
        resources.uploadMesh(partId, mesh);
      },
      uploadQuadFallback(partId: string, width: number, height: number): void {
        if (disposed || committed)
          throw new Error("Staged resources are closed");
        resources.uploadQuadFallback(partId, width, height);
      },
      commit: (): PixiResourceRegistry => {
        if (disposed)
          throw new Error("Cannot commit disposed staged resources");
        if (committed) throw new Error("Staged resources already committed");
        committed = true;
        return this.swapResources(resources);
      },
      dispose(): void {
        if (disposed || committed) return;
        disposed = true;
        resources.disposeAll();
      },
    };
  }

  swapResources(nextResources: RendererResourceRegistry): PixiResourceRegistry {
    if (!(nextResources instanceof PixiResourceRegistry))
      throw new Error("Invalid Pixi resource registry");
    const previous = this.resources;
    if (!previous) throw new Error("Pixi scene gateway is not ready");
    this.resources = nextResources;
    if (this.frameRenderer) {
      this.frameRenderer.resources = nextResources;
    }
    return previous;
  }

  hasTexture(partId: string): boolean {
    return this.resources ? this.resources.hasTexture(partId) : false;
  }

  hasMesh(partId: string): boolean {
    return this.resources ? this.resources.hasMesh(partId) : false;
  }

  capture(options: CaptureOptions = {}): ImageData | null {
    return this.captureService?.capture(options) ?? null;
  }

  resize(width: number, height: number): void {
    if (!this.app) return;
    this.app.renderer.resize(width, height);
    if (this.viewportBridge) {
      this.viewportBridge.resize(width, height);
    }
  }

  measureStats(): PixiRuntimeStats {
    return snapshotStats(this.metrics);
  }

  resetMetrics(): void {
    // Keep object identity: PixiInteractionSystem shares this counters object.
    resetCounters(this.metrics);
  }

  incrementOverlayRenderCount(): void {
    incrementCounter(this.metrics, "overlayRenderCount");
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    if (this.interactionSystem) {
      this.interactionSystem.dispose();
      this.interactionSystem = null;
    }
    this.markDirty = null;
    if (this.overlayRenderer) {
      this.overlayRenderer.dispose();
      this.overlayRenderer = null;
    }
    if (this.frameRenderer) {
      this.frameRenderer.dispose();
      this.frameRenderer = null;
    }
    if (this.resources) {
      this.resources.disposeAll();
      this.resources = null;
    }
    if (this.layers) {
      this.layers.dispose();
      this.layers = null;
    }
    if (this.lifecycle) {
      this.lifecycle.dispose();
      this.lifecycle = null;
    }
  }
}
