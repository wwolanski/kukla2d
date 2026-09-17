import type { CANVAS_FAILURE_CODES } from "@/features/canvas/domain/canvasFailureCodes.js";

export interface CanvasFailure {
  code: (typeof CANVAS_FAILURE_CODES)[keyof typeof CANVAS_FAILURE_CODES];
  message: string;
}
