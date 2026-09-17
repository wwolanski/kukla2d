import type { BakeReportEntry } from "./phaserPackageDocs.types.js";

export interface CapturedFrame {
  identity: string;
  animId: string;
  animName: string;
  frameIndex: number;
  dataUrl: string;
  sourceWidth: number;
  sourceHeight: number;
}

export interface PackageOptions {
  fps: number;
  scale: number;
  trim: boolean;
  padding: number;
  maxPageSize: number;
  loop: boolean;
  outputName: string;
  destination: string;
  textureKey: string;
  animations: Array<{
    id: string;
    name: string;
    duration?: number;
    fps?: number;
    markers?: Array<{ id: string; time: number; label: string }>;
  }>;
  bakeIssues?: BakeReportEntry[];
  signal?: AbortSignal;
  onProgress?: (
    p: { current: number; total: number; label: string } | null,
  ) => void;
}

export interface ExportArtifact {
  fileName: string;
  mimeType: string;
  blob: Blob;
  relativePath?: string;
}

export type EncodeResult =
  | { ok: true; artifacts: ExportArtifact[] }
  | { ok: false; code: string; message: string };
