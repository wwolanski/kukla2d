/**
 * Warp lattice overlay geometry helpers.
 *
 * Extracted from `WarpLatticeOverlay.jsx`; `buildRestGrid` lives in the domain.
 */

/**
 * Convert world to screen for lattice points.
 */
import type { ViewTransform } from "../../domain/coordinates.types.js";

interface LatticePoint {
  x: number;
  y: number;
}
type GridLine = readonly [LatticePoint, LatticePoint];

export function latticeToScreen(
  point: LatticePoint,
  view: ViewTransform,
): LatticePoint {
  return {
    x: point.x * view.zoom + view.panX,
    y: point.y * view.zoom + view.panY,
  };
}

/**
 * Build SVG line endpoints for grid edges connecting (col+1) × (row+1) points.
 */
export function gridLines(
  points: readonly LatticePoint[],
  col: number,
  row: number,
): GridLine[] {
  const lines: GridLine[] = [];
  // horizontal lines (one per row)
  for (let r = 0; r <= row; r++) {
    for (let c = 0; c < col; c++) {
      const start = points[r * (col + 1) + c];
      const end = points[r * (col + 1) + c + 1];
      if (start && end) lines.push([start, end]);
    }
  }
  // vertical lines (one per col)
  for (let c = 0; c <= col; c++) {
    for (let r = 0; r < row; r++) {
      const start = points[r * (col + 1) + c];
      const end = points[(r + 1) * (col + 1) + c];
      if (start && end) lines.push([start, end]);
    }
  }
  return lines;
}

/**
 * Decide if vertex at (col, row) is a corner of the lattice.
 */
export function isCornerIdx(
  col: number,
  row: number,
  pointCol: number,
  pointRow: number,
): boolean {
  return (
    (pointCol === 0 || pointCol === col) && (pointRow === 0 || pointRow === row)
  );
}
