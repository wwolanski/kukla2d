type FrameCaptureResult =
  | { ok: true; dataUrl: string; width: number; height: number }
  | { ok: false; error: { code: string; message: string } };

export type CaptureFrame = (request: {
  animationId: string | null;
  timeMs: number;
  width: number;
  height: number;
  format: "png" | "jpg" | "webp";
  quality: number;
  background: { enabled: boolean; color: string };
  crop: { x: number; y: number; width?: number; height?: number } | null;
}) => FrameCaptureResult;
