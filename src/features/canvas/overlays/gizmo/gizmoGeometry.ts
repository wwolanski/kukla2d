/**
 * Gizmo overlay geometry helpers.
 *
 * Pure functions for bounding box, pivot screen position, rotation handle point.
 * Extracted from `GizmoOverlay.jsx` for focused testing.
 */

/**
 * Compute bounding box from `node.imageBounds` (or default to 0..1).
 * Returns {x, y, w, h} in world/image space.
 */
import type { PartNode } from "@kukla2d/contracts";

import type { ViewTransform } from "../../domain/coordinates.types.js";

interface Bounds {
  x: number;
  y: number;
  w: number;
  h: number;
}
interface ScreenPoint {
  x: number;
  y: number;
}

export function nodeBounds(node: PartNode): Bounds {
  if (node.imageBounds) {
    return {
      x: node.imageBounds.minX,
      y: node.imageBounds.minY,
      w: node.imageBounds.maxX - node.imageBounds.minX,
      h: node.imageBounds.maxY - node.imageBounds.minY,
    };
  }
  return { x: 0, y: 0, w: 1, h: 1 };
}

/**
 * Convert a world point to screen coordinates using view zoom/pan.
 */
export function toScreen(
  worldX: number,
  worldY: number,
  view: ViewTransform,
): ScreenPoint {
  return {
    x: worldX * view.zoom + view.panX,
    y: worldY * view.zoom + view.panY,
  };
}

/**
 * Position of the rotation handle (above the bounding box).
 */
export function rotationHandle(
  bounds: Bounds,
  view: ViewTransform,
  offsetY = 30,
): ScreenPoint {
  const cx = bounds.x + bounds.w / 2;
  const topY = bounds.y;
  return toScreen(cx, topY - offsetY / view.zoom, view);
}
