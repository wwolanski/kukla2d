interface FrameCaptureCrop {
  x: number;
  y: number;
  width?: number;
  height?: number;
}

export interface FrameCaptureRequest {
  animationId: string | null;
  timeMs: number;
  width: number;
  height: number;
  format: "png" | "jpg" | "webp";
  quality: number;
  background: { enabled: boolean; color: string };
  crop: FrameCaptureCrop | null;
}

export type FrameCaptureResult =
  | { ok: true; dataUrl: string; width: number; height: number }
  | { ok: false; error: { code: string; message: string } };
