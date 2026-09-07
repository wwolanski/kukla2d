/**
 * Canvas coordinate helpers.
 *
 * Pure conversions between client coordinates, canvas bounds, and world space.
 * This module has no React, DOM runtime, or WebGL dependency.
 */

/**
 * Convert client coords to canvas-element-relative world coords (image/mesh pixel space).
 * Requires a canvas element (or object with getBoundingClientRect).
 */
import type { CoordinatePair, ViewTransform } from "./coordinates.types.js";

export function clientToCanvasSpace(
  canvas: Pick<HTMLCanvasElement, "getBoundingClientRect">,
  clientX: number,
  clientY: number,
  view: ViewTransform,
): CoordinatePair {
  const rect = canvas.getBoundingClientRect();
  return screenToWorld({ clientX, clientY, rect, view });
}

/**
 * Convert client coordinates to world space using only supplied bounds.
 * This form can run in tests without a DOM element.
 */
export function screenToWorld({
  clientX,
  clientY,
  rect,
  view,
}: {
  clientX: number;
  clientY: number;
  rect: Pick<DOMRect, "left" | "top">;
  view: ViewTransform;
}): CoordinatePair {
  const cx = (clientX - rect.left) / view.zoom - view.panX / view.zoom;
  const cy = (clientY - rect.top) / view.zoom - view.panY / view.zoom;
  return [cx, cy];
}

/**
 * Convert a world-space point to a part's local object space using its inverse world matrix.
 * Supports vertex picking for transformed parts.
 */
export function worldToLocal(
  worldX: number,
  worldY: number,
  inverseWorldMatrix: ArrayLike<number>,
): CoordinatePair {
  const m = inverseWorldMatrix;
  return [
    (m[0] ?? 0) * worldX + (m[3] ?? 0) * worldY + (m[6] ?? 0),
    (m[1] ?? 0) * worldX + (m[4] ?? 0) * worldY + (m[7] ?? 0),
  ];
}
