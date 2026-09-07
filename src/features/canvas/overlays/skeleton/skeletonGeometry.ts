/**
 * Skeleton overlay geometry helpers.
 *
 * Pure functions for skeleton joint/bone screen positions and arc paths.
 * Extracted from `SkeletonOverlay.jsx` for focused testing and reuse.
 */

/**
 * Convert a world-space point to image-space (scaled by view.zoom, translated by pan).
 */
import type { ViewTransform } from "../../domain/coordinates.types.js";

interface OverlayPoint {
  x: number;
  y: number;
}

export function toImage(
  worldX: number,
  worldY: number,
  view: ViewTransform,
): OverlayPoint {
  return {
    x: worldX * view.zoom + view.panX,
    y: worldY * view.zoom + view.panY,
  };
}

/**
 * Build an SVG arc path between two screen points with a control offset.
 * Used to render bone influence arcs in the skeleton overlay.
 */
export function arcPath(
  start: OverlayPoint,
  end: OverlayPoint,
  control: OverlayPoint,
): string {
  return `M ${start.x} ${start.y} Q ${control.x} ${control.y} ${end.x} ${end.y}`;
}

/**
 * Position of the rotation handle for a bone: perpendicular to bone direction at end.
 * `length` controls how far the handle sticks out.
 */
export function rotationHandlePoint(
  start: OverlayPoint,
  end: OverlayPoint,
  length = 30,
): OverlayPoint {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const len = Math.sqrt(dx * dx + dy * dy) || 1;
  // Perpendicular to the bone direction.
  const px = -dy / len;
  const py = dx / len;
  return { x: end.x + px * length, y: end.y + py * length };
}
