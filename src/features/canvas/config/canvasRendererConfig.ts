/**
 * Pixi-only canvas renderer config.
 *
 * Pixi is the sole supported canvas renderer.
 */
type CanvasRendererKind = "pixi";

export const CANVAS_RENDERER_PIXI: CanvasRendererKind = "pixi";

/**
 * Runtime canvas renderer backend. Pixi is the sole canvas
 * render/input/overlay runtime.
 *
 * @returns {CanvasRendererKind}
 */
export function readCanvasRendererFromEnv(): CanvasRendererKind {
  return CANVAS_RENDERER_PIXI;
}
