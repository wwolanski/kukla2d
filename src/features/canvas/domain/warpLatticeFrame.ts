/**
 * Pure helper: compute warp lattice overlay geometry in world-space.
 *
 * No React, DOM, or Pixi imports. Used by PixiOverlayRenderer.
 *
 * @param {Object} args
 * @param {Object} args.wdNode      - warp deformer node from project
 * @param {Array}  args.gridPoints  - current grid points [{x, y}, ...]
 * @returns {Object} warp lattice frame
 */
import type { WarpDeformerNode } from "@kukla2d/contracts";

import type { WarpLatticeFrame } from "./warpLatticeFrame.types.js";

interface Point {
  x: number;
  y: number;
}

export function buildWarpLatticeFrame({
  wdNode,
  gridPoints,
}: {
  wdNode: WarpDeformerNode | null | undefined;
  gridPoints: readonly Point[] | null | undefined;
}): WarpLatticeFrame {
  if (!wdNode || !gridPoints || gridPoints.length === 0) {
    return { gridPoints: [], col: 0, row: 0, stride: 0, visible: false };
  }

  const col = wdNode.col ?? 2;
  const row = wdNode.row ?? 2;
  const stride = col + 1;

  return {
    gridPoints: gridPoints.map((pt) => ({ x: pt.x, y: pt.y })),
    col,
    row,
    stride,
    visible: true,
  };
}
