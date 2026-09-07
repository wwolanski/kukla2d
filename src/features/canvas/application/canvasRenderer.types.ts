import type { Node, ProjectDocument, Vertex } from "@kukla2d/contracts";

export interface EditorView {
  zoom: number;
  panX: number;
  panY: number;
}

export interface CanvasDraftPoseValue {
  x?: number;
  y?: number;
  rotation?: number;
  scaleX?: number;
  scaleY?: number;
  pivotX?: number;
  pivotY?: number;
  opacity?: number;
  visible?: boolean;
  mesh_verts?: unknown;
  [property: string]: unknown;
}

export interface CanvasAnimationRuntimePort {
  activeAnimationId: string | null;
  currentTime: number;
  draftPose: Map<string, CanvasDraftPoseValue>;
  draftContext: { animationId: string; timeMs: number } | null;
  draftDirty: boolean;
  draftRevision: number;
  clearDraftPose(): void;
  clearDraftPoseForNode(nodeId: string): void;
  setDraftPose(nodeId: string, pose: CanvasDraftPoseValue): void;
  setDraftContext(
    context: { animationId: string; timeMs: number } | null,
  ): void;
  restoreDraftMetadata(dirty: boolean, revision: number): void;
}

interface PointLike {
  x: number;
  y: number;
  0?: number;
  1?: number;
}

export type CanvasTextureSource =
  HTMLImageElement | HTMLCanvasElement | ImageBitmap;

export interface CanvasMeshData {
  vertices: Vertex[];
  uvs: number[] | Float32Array;
  triangles?: [number, number, number][];
  indices?: number[];
  edgeIndices?: number[];
}

export interface CanvasFrame {
  project: ProjectDocument;
  effectiveNodes?: Node[];
  view?: EditorView;
}

export interface DrawFrameOptions {
  skipRender?: boolean;
}

export interface CaptureOptions {
  width?: number;
  height?: number;
}

export interface RendererResourceRegistry {
  disposeAll(): void;
}

interface CanvasViewportBridge {
  readonly viewport?: unknown;
  applyEditorView(view: EditorView): void;
  readEditorView(): EditorView;
  resize(width: number, height: number): void;
  toWorld(screenX: number, screenY: number): PointLike;
  toScreen(worldX: number, worldY: number): PointLike;
}

export interface CanvasRendererPort {
  readonly canvas: HTMLCanvasElement;
  readonly ready: Promise<void>;
  readonly viewportBridge: CanvasViewportBridge | null;
  draw(
    project: ProjectDocument,
    editor: object,
    isDark: boolean,
    poseOverrides: object,
    options?: object,
  ): void;
  drawFrame(frame: CanvasFrame, options?: DrawFrameOptions): void;
  render(): void;
  uploadTexture(partId: string, image: CanvasTextureSource): void;
  uploadMesh(partId: string, mesh: CanvasMeshData): void;
  uploadQuadFallback(partId: string, width: number, height: number): void;
  uploadPositions(
    partId: string,
    vertices: Vertex[],
    uvs?: ArrayLike<number>,
  ): void;
  hasTexture(partId: string): boolean;
  hasMesh(partId: string): boolean;
  capture(options?: CaptureOptions): ImageData | null;
  createStagedResources(): {
    readonly resources: RendererResourceRegistry;
    uploadTexture(partId: string, image: CanvasTextureSource): void;
    uploadMesh(partId: string, mesh: CanvasMeshData): void;
    uploadQuadFallback(partId: string, width: number, height: number): void;
    commit(): RendererResourceRegistry;
    dispose(): void;
  } | null;
  swapResources(resources: RendererResourceRegistry): RendererResourceRegistry;
  resize(width: number, height: number): void;
  dispose(): void;
}
