import type { EncoderInput, ExportArtifact } from "@kukla2d/contracts";

interface FrameCaptureError {
  code: string;
  message: string;
}

export interface ExportProgress {
  current: number;
  total: number;
  label: string;
}

type ExportFailure = FrameCaptureError;
type BrowserExportResult =
  | { ok: true }
  | { ok: false; cancelled: true }
  | { ok: false; error: { code: string; message: string } };
export type ExportEncoder = (input: EncoderInput) => Promise<ExportArtifact[]>;
export type ExportOutputSink = (
  artifacts: readonly ExportArtifact[],
  options?: {
    destination?: "download" | "folder" | "zip";
    projectName?: string;
  },
) => Promise<BrowserExportResult>;

export type ExportRunResult =
  | { ok: true; artifacts: ExportArtifact[] }
  | { ok: false; cancelled: true }
  | { ok: false; error: ExportFailure };
