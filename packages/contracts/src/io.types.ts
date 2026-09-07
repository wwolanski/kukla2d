import type { Marker, ProjectDocument } from "./project.types.js";

export interface ImportRequest {
  format: "psd" | "png" | "stretch";
  data: ArrayBuffer;
  fileName?: string;
}

export interface ImportResult {
  width: number;
  height: number;
  layers: ImportLayer[];
}

export interface ImportLayer {
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  imageData: ImageData;
  blendMode?: string;
  opacity?: number;
  visible?: boolean;
}

export type ExportVariantId =
  | "png_sequence"
  | "png_spritesheet"
  | "gif"
  | "live2d_project"
  | "live2d"
  | "spine"
  | "phaser_atlas";
export type RasterExportVariantId = "png_sequence" | "png_spritesheet" | "gif";
export type PhaserAtlasVariantId = "phaser_atlas";
export type ExportVariantStatus = "active" | "unactive";
export type ExportPipelineId = "raster" | "phaser_atlas";

export interface ExportAnimation {
  id: string;
  name: string;
  duration?: number;
  fps?: number;
  markers?: Marker[];
}

export interface ExportVariantDefinition {
  id: ExportVariantId;
  label: string;
  status: ExportVariantStatus;
  pipeline: ExportPipelineId | null;
  type?: "sequence" | "spritesheet" | "animation";
  format?: "png" | "gif";
  formatLabel?: string;
}

export interface ExportAreaContract {
  source: { x: number; y: number; width: number; height: number };
  outputWidth: number;
  outputHeight: number;
}

export interface RasterFrameSpec {
  animId: string;
  animName: string;
  frameIndex: number;
  timeMs: number;
}

export interface RasterExportPlan {
  variantId: RasterExportVariantId;
  area: ExportAreaContract;
  fps: number;
  animations: ExportAnimation[];
  frameSpecs: readonly RasterFrameSpec[];
  background: { enabled: boolean; color: string };
  spriteSheet: { columns: number } | null;
}

export interface CapturedRasterFrame {
  animationId: string;
  animationName: string;
  frameIndex: number;
  timeMs: number;
  width: number;
  height: number;
  dataUrl: string;
}

export interface EncoderInput {
  frames: CapturedRasterFrame[];
  area: ExportAreaContract;
  fps: number;
  background: { enabled: boolean; color: string };
  animationName: string;
  spriteSheet?: { columns: number } | null;
  onProgress?: (
    p: { current: number; total: number; label: string } | null,
  ) => void;
  signal?: AbortSignal;
}

export interface ExportArtifact {
  fileName: string;
  mimeType: string;
  blob: Blob;
  relativePath?: string;
}

export interface PhaserAtlasExportOptions {
  variantId: PhaserAtlasVariantId;
  animations: ExportAnimation[];
  fps: number;
  scale: number;
  background: { enabled: boolean; color: string };
  trim: boolean;
  padding: number;
  maxPageSize: number;
  loop: boolean;
  outputName: string;
  destination: "zip" | "folder";
}

export interface PhaserAtlasFrameSpec {
  animId: string;
  animName: string;
  frameIndex: number;
  timeMs: number;
}

export interface PhaserAtlasSourceFrame {
  identity: string;
  animName: string;
  animId: string;
  frameIndex: number;
  dataUrl: string;
  sourceWidth: number;
  sourceHeight: number;
  trimRect: { x: number; y: number; w: number; h: number };
  packedPage: number;
  packedX: number;
  packedY: number;
  pivotOffsetX: number;
  pivotOffsetY: number;
}

export interface PhaserAtlasRegion {
  name: string;
  frame: { x: number; y: number; w: number; h: number };
  rotated: false;
  trimmed: boolean;
  spriteSourceSize: { x: number; y: number; w: number; h: number };
  sourceSize: { w: number; h: number };
}

export interface PhaserAtlasPage {
  width: number;
  height: number;
  regions: readonly PhaserAtlasRegion[];
}

export interface PhaserAtlasLayout {
  pages: readonly PhaserAtlasPage[];
}

export interface PhaserAtlasExportPlan {
  variantId: PhaserAtlasVariantId;
  area: ExportAreaContract;
  fps: number;
  scale: number;
  animations: readonly Readonly<ExportAnimation>[];
  frameSpecs: readonly PhaserAtlasFrameSpec[];
  background: { enabled: boolean; color: string };
  trim: boolean;
  padding: number;
  maxPageSize: number;
  loop: boolean;
  outputName: string;
  destination: "zip" | "folder";
}

export interface ProjectArchiveManifest {
  formatId: string;
  formatVersion: number;
  documentVersion: number | string;
}

export interface ProjectResourceOwner {
  track(url: string): void;
  dispose(): void;
  transferOut(): string[];
  readonly size: number;
}

export interface LoadedProjectBundle {
  project: ProjectDocument;
  images: Map<string, HTMLImageElement>;
  resources: ProjectResourceOwner;
}

export interface AssetResolveError {
  assetId: string;
  assetType: "texture" | "audio";
  cause: unknown;
}

export interface StoredPreferencesV1 {
  version: 1;
  themeMode: string;
  fontFamily: string;
  fontSize: number;
  lightThemeName: string;
  darkThemeName: string;
}
