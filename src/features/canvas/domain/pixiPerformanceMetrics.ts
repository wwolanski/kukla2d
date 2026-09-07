/**
 * Pixi-only performance metrics — dev/test-only counters.
 *
 * Pure module: no React, Zustand, DOM, WebGL, or Worker imports.
 * Counters are lightweight and only active when needed.
 *
 * C2: domain purity.
 * C7: metrics as BRAK DANYCH when not measured.
 */

import type {
  PixiPerformanceCounters,
  PixiRuntimeStats,
} from "./pixiPerformanceMetrics.types.js";

/**
 * @returns {PixiPerformanceCounters}
 */
export function createPerformanceCounters(): PixiPerformanceCounters {
  return {
    pointerEventsHandled: 0,
    pointerHandlerTotalMs: 0,
    renderCount: 0,
    renderTotalMs: 0,
    gpuUploadCount: 0,
    overlayRenderCount: 0,
  };
}

/**
 * Increment a counter field.
 *
 * @param {PixiPerformanceCounters} counters
 * @param {keyof PixiPerformanceCounters} field
 * @param {number} [delta=1]
 */
export function incrementCounter(
  counters: PixiPerformanceCounters,
  field: keyof PixiPerformanceCounters,
  delta = 1,
): void {
  counters[field] += delta;
}

/**
 * Record a timing measurement.
 *
 * @param {PixiPerformanceCounters} counters
 * @param {'pointerHandlerTotalMs' | 'renderTotalMs'} field
 * @param {number} durationMs
 */
export function recordTiming(
  counters: PixiPerformanceCounters,
  field: "pointerHandlerTotalMs" | "renderTotalMs",
  durationMs: number,
): void {
  counters[field] += durationMs;
}

/**
 * Snapshot current counters into a stats-compatible object.
 * Returns a new object; does not mutate the source counters.
 *
 * @param {PixiPerformanceCounters} counters
 * @returns {import('./pixiRuntimeContracts.js').PixiRuntimeStats}
 */
export function snapshotStats(
  counters: PixiPerformanceCounters,
): PixiRuntimeStats {
  return {
    pointerEventsHandled: counters.pointerEventsHandled,
    renderCount: counters.renderCount,
    gpuUploadCount: counters.gpuUploadCount,
    lastFrameDurationMs:
      counters.renderCount > 0
        ? counters.renderTotalMs / counters.renderCount
        : 0,
  };
}

/**
 * Reset all counters to zero.
 *
 * @param {PixiPerformanceCounters} counters
 */
export function resetCounters(counters: PixiPerformanceCounters): void {
  counters.pointerEventsHandled = 0;
  counters.pointerHandlerTotalMs = 0;
  counters.renderCount = 0;
  counters.renderTotalMs = 0;
  counters.gpuUploadCount = 0;
  counters.overlayRenderCount = 0;
}

/**
 * Measure execution time of a synchronous function.
 * Returns the function's return value.
 *
 * @template T
 * @param {() => T} fn
 * @param {(durationMs: number) => void} onMeasure
 * @returns {T}
 */
export function measureSync<T>(
  fn: () => T,
  onMeasure: (durationMs: number) => void,
): T {
  const start = performance.now();
  try {
    return fn();
  } finally {
    onMeasure(performance.now() - start);
  }
}

/**
 * Create a test-only React render counter.
 * Returns an object with `count` getter and `increment`/`reset` methods.
 *
 * Usage in tests:
 *   const renderCounter = createRenderCounter();
 *   // inside component render: renderCounter.increment();
 *   expect(renderCounter.count).toBe(1);
 *
 * @returns {{ count: number, increment: () => void, reset: () => void }}
 */
export function createRenderCounter(): {
  readonly count: number;
  increment(): void;
  reset(): void;
  _count: number;
} {
  return {
    get count() {
      return this._count;
    },
    _count: 0,
    increment() {
      this._count++;
    },
    reset() {
      this._count = 0;
    },
  };
}
