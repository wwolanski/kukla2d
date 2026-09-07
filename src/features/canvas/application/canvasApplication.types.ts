import type { Mesh, Node } from "@kukla2d/contracts";

import type { AnimationStore } from "@/store/animationStoreTypes.types.js";
import type { EditorStore } from "@/store/editorStoreTypes.types.js";

import type { CanvasRendererPort, EditorView } from "./canvasRenderer.types.js";
import type { ResourceRegistry } from "./workspaceLoadTransaction.types.js";
import type {
  MeshGenerationOptions,
  MeshGenerationResult,
} from "../domain/mesh-generation/generate.types.js";
import type { EditorWorkflowState } from "../domain/workflowContracts.types.js";
import type { RefObject } from "react";

export type CanvasEditorSnapshot = EditorStore & Partial<EditorWorkflowState>;
export type MutableRef<T> = RefObject<T>;

interface CanvasFramePoseSnapshot {
  effectiveNodes: Node[];
}

interface CanvasInteractionSystem {
  readFramePose?: () => CanvasFramePoseSnapshot | null;
  readPreviewPoseOverrides: () => Map<string, Record<string, unknown>> | null;
  readPoseHandleExtensions: () => ReadonlyMap<string, unknown> | null;
  getDrawBonePreview?: () => unknown;
  getBrushWorldPos: () => { visible: boolean; x: number; y: number } | null;
  updateFramePose(frame: Record<string, unknown>): void;
  updateHandles(handles: Record<string, unknown>): void;
}

interface CanvasOverlayRenderer {
  clear(): void;
  renderGizmo(frame: unknown, zoom: number): void;
  renderMeshWireframe(frame: unknown, zoom: number): void;
  renderIkConstraints(frame: unknown, zoom: number): void;
  renderSkeleton(frame: unknown, zoom: number): void;
  renderWarpLattice(frame: unknown, zoom: number): void;
  renderHover(frame: unknown, zoom: number, options: unknown): void;
  renderMarquee(frame: unknown, zoom: number): void;
  renderDrawBonePreview(frame: unknown, zoom: number): void;
  renderWeightPaint(frame: unknown, zoom: number): void;
  renderBrush(frame: unknown, x: number, y: number, zoom: number): void;
  renderExportArea(frame: unknown, zoom: number): void;
}

interface SceneGatewayLoadPort {
  createStagedResources?():
    | {
        uploadTexture(partId: string, img: HTMLImageElement): void;
        uploadMesh(partId: string, mesh: Mesh): void;
        uploadQuadFallback(partId: string, width: number, height: number): void;
        commit(): ResourceRegistry;
        dispose(): void;
        resources: ResourceRegistry;
      }
    | null
    | undefined;
  swapResources(resources: ResourceRegistry): ResourceRegistry;
}

export interface CanvasSceneGateway
  extends
    Omit<CanvasRendererPort, "createStagedResources" | "swapResources">,
    SceneGatewayLoadPort {
  interactionSystem?: CanvasInteractionSystem | null;
  overlayLayer?: { visible: boolean } | null;
  contentLayer?: { alpha: number } | null;
  overlayRenderer?: CanvasOverlayRenderer | null;
  resources?: ResourceRegistry | null;
  createInteractionSystem(options: Record<string, unknown>): unknown;
  incrementOverlayRenderCount(): void;
  uploadResource?: (id: string, blob: Blob) => void;
  updatePreview?: (overrides: Record<string, unknown>) => void;
}

export interface CanvasFrameRenderOptions {
  exportMode?: boolean;
  skipResize?: boolean;
  animationStateOverride?: AnimationStore;
  editorStateOverride?: CanvasEditorSnapshot;
  includeTransientPose?: boolean;
  viewOverride?: EditorView;
}

export interface CanvasTextureCache {
  getLastSource(partId: string): string | undefined;
  setLastSource(partId: string, source: string | null | undefined): void;
  getImageData(partId: string): ImageData | undefined;
  setImageData(partId: string, imageData: ImageData | null | undefined): void;
  clearImageData(): void;
  deletePart(partId: string): void;
  asImageDataLookup(): (partId: string) => ImageData | undefined;
  __internal: {
    imageDataByPartId: Map<string, ImageData>;
    lastUploadedSources: Map<string, string>;
  };
}

interface CanvasMeshWorkerClient {
  generate(
    partId: string,
    imageData: ImageData,
    opts?: MeshGenerationOptions,
  ): Promise<{
    vertices: MeshGenerationResult["vertices"];
    uvs: Float32Array;
    triangles: MeshGenerationResult["triangles"];
    edgeIndices: number[];
  }>;
  dispose(): void;
}

interface CaptureDataUrlOptions {
  format?: string;
  quality?: number;
  bgEnabled?: boolean;
  bgColor?: string;
  width?: number;
  height?: number;
}

type ImageDataUrlOptions = Omit<CaptureDataUrlOptions, "width" | "height">;

export interface CanvasRuntimeDependencies {
  createRenderer: (options: {
    canvas: HTMLCanvasElement;
    onViewChange?: (view: EditorView) => void;
    initialView?: EditorView;
  }) => CanvasSceneGateway;
  createMeshWorkerClient: () => CanvasMeshWorkerClient;
  createTextureImageCache: () => CanvasTextureCache;
  captureCanvasDataUrl: (
    canvas: HTMLCanvasElement,
    options?: CaptureDataUrlOptions,
  ) => string;
  imageDataToDataUrl: (
    imageData: ImageData,
    options?: ImageDataUrlOptions,
  ) => string;
}
