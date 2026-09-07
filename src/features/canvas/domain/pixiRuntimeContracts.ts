/**
 * PixiRuntimeCommandTarget — contract for the Pixi-only command target.
 *
 * Defines the interface that the Pixi runtime exposes to the command runtime layer.
 * Commands flow: XState workflow → command runtime → PixiRuntimeCommandTarget.
 *
 * C2: no React, Zustand, DOM, WebGL, or Worker imports.
 * C5: no new rendering/gesture libraries; uses existing pixi.js.
 */

interface PixiRuntimeStats {
  pointerEventsHandled: number;
  renderCount: number;
  gpuUploadCount: number;
  lastFrameDurationMs: number;
}

/**
 * @returns {PixiRuntimeStats}
 */
export function createDefaultPixiRuntimeStats(): PixiRuntimeStats {
  return {
    pointerEventsHandled: 0,
    renderCount: 0,
    gpuUploadCount: 0,
    lastFrameDurationMs: 0,
  };
}

/**
 * @param {Partial<PixiRuntimeStats>} [overrides]
 * @returns {PixiRuntimeStats}
 */
export function createPixiRuntimeStats(
  overrides: Partial<PixiRuntimeStats> = {},
): PixiRuntimeStats {
  return { ...createDefaultPixiRuntimeStats(), ...overrides };
}

/**
 * Validates that a value conforms to the PixiRuntimeCommandTarget contract.
 * Returns null if valid, or an array of error strings.
 *
 * @param {unknown} target
 * @returns {string[] | null}
 */
export function validatePixiRuntimeCommandTarget(
  target: unknown,
): string[] | null {
  if (!target || typeof target !== "object" || Array.isArray(target))
    return ["target must be an object"];
  const errors: string[] = [];
  const t = Object.fromEntries(Object.entries(target));
  if (typeof t.bind !== "function") errors.push("bind must be a function");
  if (typeof t.destroy !== "function")
    errors.push("destroy must be a function");
  if (typeof t.renderFrame !== "function")
    errors.push("renderFrame must be a function");
  if (typeof t.updateOverlayFrame !== "function")
    errors.push("updateOverlayFrame must be a function");
  if (typeof t.executeCommand !== "function")
    errors.push("executeCommand must be a function");
  if (typeof t.readPreviewPoseOverrides !== "function")
    errors.push("readPreviewPoseOverrides must be a function");
  if (typeof t.measureStats !== "function")
    errors.push("measureStats must be a function");
  return errors.length > 0 ? errors : null;
}
