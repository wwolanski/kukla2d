export interface PixiPerformanceCounters {
  pointerEventsHandled: number;
  pointerHandlerTotalMs: number;
  renderCount: number;
  renderTotalMs: number;
  gpuUploadCount: number;
  overlayRenderCount: number;
}

export interface PixiRuntimeStats {
  pointerEventsHandled: number;
  renderCount: number;
  gpuUploadCount: number;
  lastFrameDurationMs: number;
}
