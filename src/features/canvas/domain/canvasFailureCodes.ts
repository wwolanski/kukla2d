export const CANVAS_FAILURE_CODES = {
  INIT_UNAVAILABLE: "CANVAS_INIT_UNAVAILABLE",
  INIT_FAILED: "CANVAS_INIT_FAILED",
} as const;

type CanvasFailureCode =
  (typeof CANVAS_FAILURE_CODES)[keyof typeof CANVAS_FAILURE_CODES];

export const CANVAS_FAILURE_MESSAGES: Readonly<
  Record<CanvasFailureCode, string>
> = {
  [CANVAS_FAILURE_CODES.INIT_UNAVAILABLE]:
    "Canvas renderer could not be created. Your browser may not support WebGL.",
  [CANVAS_FAILURE_CODES.INIT_FAILED]:
    "Canvas renderer failed to initialize. Retry or reload the application.",
};
