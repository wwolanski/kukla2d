/**
 * Pure helpers for warp deformer keyframes and rest grid generation.
 *
 * Extracted from duplicated viewport and lattice-overlay logic.
 * No React, store, DOM, or WebGL dependencies.
 */

/**
 * Build the rest (flat) lattice grid for a warp deformer.
 *
 * @param {Object} args
 * @param {number} args.gridX
 * @param {number} args.gridY
 * @param {number} args.gridW
 * @param {number} args.gridH
 * @param {number} args.col
 * @param {number} args.row
 * @returns {Array<{x:number,y:number}>} points in row-major order
 */
interface WarpPoint {
  x: number;
  y: number;
}
interface WarpGridDefinition {
  gridX: number;
  gridY: number;
  gridW: number;
  gridH: number;
  col: number;
  row: number;
}
interface WarpKeyframe {
  time: number;
  value: WarpPoint[];
}

type WarpDelta = { dx: number; dy: number } | null;
type WarpDeltaFunction = (columnRatio: number, rowRatio: number) => WarpDelta;

export function buildRestGrid({
  gridX,
  gridY,
  gridW,
  gridH,
  col,
  row,
}: WarpGridDefinition): WarpPoint[] {
  const arr: WarpPoint[] = [];
  for (let r = 0; r <= row; r++) {
    for (let c = 0; c <= col; c++) {
      const bx = gridX + (col > 0 ? (c * gridW) / col : 0);
      const by = gridY + (row > 0 ? (r * gridH) / row : 0);
      arr.push({ x: bx, y: by });
    }
  }
  return arr;
}

/**
 * Build warp-deformer keyframes for a named deformation type.
 * `scale` (0–1) controls amplitude so strength adjustments re-use this without
 * re-authoring: scale=1 = 100% strength, scale=0.5 = 50%, etc.
 * Returns [{time, value:[{x,y},...]}] matching the interpolateMeshVerts format.
 */
export function buildWarpKeyframes(
  warpType: string,
  gridX: number,
  gridY: number,
  gridW: number,
  gridH: number,
  col: number,
  row: number,
  scale = 1,
): WarpKeyframe[] {
  function makeGrid(deltaFn: WarpDeltaFunction): WarpPoint[] {
    const arr: WarpPoint[] = [];
    for (let r = 0; r <= row; r++) {
      for (let c = 0; c <= col; c++) {
        const bx = gridX + (col > 0 ? (c * gridW) / col : 0);
        const by = gridY + (row > 0 ? (r * gridH) / row : 0);
        const d = deltaFn(col > 0 ? c / col : 0, row > 0 ? r / row : 0);
        arr.push({
          x: bx + (d?.dx ?? 0) * scale,
          y: by + (d?.dy ?? 0) * scale,
        });
      }
    }
    return arr;
  }
  const flat = () => makeGrid(() => null);

  if (warpType === "face_angle_x") {
    // 2.5D Perspective face turn
    // time=1000 is turning screen right (+Angle X)
    const rightTurn: WarpDeltaFunction = (cn, rn) => {
      // Parabolic horizontal shift: nose (center) protrudes right, far edge wraps inward
      // cn=0 (near): dx=0.02, cn=0.5 (center): dx=0.15, cn=1.0 (far): dx=-0.05
      const dx = (-0.66 * cn * cn + 0.59 * cn + 0.02) * gridW;

      // Perspective Z-scaling: near side gets slightly taller, far side gets shorter
      const zScale = 1.0 + (0.5 - cn) * 0.1;
      const dy = (rn - 0.5) * (zScale - 1) * gridH;

      return { dx, dy };
    };

    const leftTurn: WarpDeltaFunction = (cn, rn) => {
      // Mirror of right turn
      const mirroredCn = 1 - cn;
      const d = rightTurn(mirroredCn, rn) ?? { dx: 0, dy: 0 };
      return { dx: -d.dx, dy: d.dy };
    };

    return [
      { time: 0, value: makeGrid(leftTurn) },
      { time: 500, value: flat() },
      { time: 1000, value: makeGrid(rightTurn) },
    ];
  }

  if (warpType === "body_angle_x") {
    // 2.5D Perspective body turn
    // time=1000 is turning screen right
    const rightTurnBody: WarpDeltaFunction = (cn, rn) => {
      // Horizontal shear combined with perspective
      // Top moves more than bottom. Left shoulder (near) moves right, right shoulder (far) wraps inward
      const topDxRatio = -0.4 * cn * cn + 0.32 * cn + 0.1;
      const dx = topDxRatio * (1 - rn) * gridW;

      // Perspective Z-scaling: near shoulder gets larger/lower, far shoulder lifts/shrinks
      const zScale = 1.0 + (0.5 - cn) * 0.15;
      const dy = (rn - 0.5) * (zScale - 1) * gridH;

      return { dx, dy };
    };

    const leftTurnBody: WarpDeltaFunction = (cn, rn) => {
      const mirroredCn = 1 - cn;
      const d = rightTurnBody(mirroredCn, rn) ?? { dx: 0, dy: 0 };
      return { dx: -d.dx, dy: d.dy };
    };

    return [
      { time: 0, value: makeGrid(leftTurnBody) },
      { time: 500, value: flat() },
      { time: 1000, value: makeGrid(rightTurnBody) },
    ];
  }

  if (warpType === "neck_follow") {
    // Neck shears to follow the head turn at reduced amplitude
    const rightTurn: WarpDeltaFunction = (cn, rn) => {
      const dx = (-0.66 * cn * cn + 0.59 * cn + 0.02) * gridW * 0.35;
      const zScale = 1.0 + (0.5 - cn) * 0.06;
      const dy = (rn - 0.5) * (zScale - 1) * gridH;
      return { dx, dy };
    };
    const leftTurn: WarpDeltaFunction = (cn, rn) => {
      const d = rightTurn(1 - cn, rn) ?? { dx: 0, dy: 0 };
      return { dx: -d.dx, dy: d.dy };
    };
    return [
      { time: 0, value: makeGrid(leftTurn) },
      { time: 500, value: flat() },
      { time: 1000, value: makeGrid(rightTurn) },
    ];
  }

  if (warpType === "face_angle_y") {
    // Head pitch — looking up (time=1000) / looking down (time=0)
    const lookUp: WarpDeltaFunction = (cn, rn) => ({
      dy: -(0.5 - rn) * 0.28 * gridH,
      dx: (cn - 0.5) * rn * 0.08 * gridW,
    });
    const lookDown: WarpDeltaFunction = (cn, rn) => ({
      dy: (0.5 - rn) * 0.28 * gridH,
      dx: (cn - 0.5) * (1 - rn) * 0.08 * gridW,
    });
    return [
      { time: 0, value: makeGrid(lookDown) },
      { time: 500, value: flat() },
      { time: 1000, value: makeGrid(lookUp) },
    ];
  }

  if (warpType === "body_angle_y") {
    // Body pitch — leaning back (time=0) / leaning forward (time=1000)
    const leanBack: WarpDeltaFunction = (cn, rn) => ({
      dy: (0.5 - rn) * 0.2 * gridH,
      dx: (cn - 0.5) * (1 - rn) * 0.06 * gridW,
    });
    const leanForward: WarpDeltaFunction = (cn, rn) => ({
      dy: -(0.5 - rn) * 0.2 * gridH,
      dx: (cn - 0.5) * rn * 0.06 * gridW,
    });
    return [
      { time: 0, value: makeGrid(leanBack) },
      { time: 500, value: flat() },
      { time: 1000, value: makeGrid(leanForward) },
    ];
  }

  if (warpType === "body_angle_z") {
    // Body roll — tilting left (time=0) / tilting right (time=1000)
    // Spine acts as rotation axis; shoulders rotate around spine, hips rotate less
    const rightTilt: WarpDeltaFunction = (cn, rn) => {
      // Body bowing: center/spine shifts WITH tilt, edges shift opposite
      const bowFactor = 1.5 * Math.sin(Math.PI * cn) - 0.5;
      const dx = bowFactor * 0.035 * gridW * rn;
      // Perspective: lean side rises, far side drops (3D depth)
      const dy = -(cn - 0.5) * 0.025 * gridH * rn;
      return { dx, dy };
    };
    const leftTilt: WarpDeltaFunction = (cn, rn) => {
      const d = rightTilt(1 - cn, rn) ?? { dx: 0, dy: 0 };
      return { dx: -d.dx, dy: d.dy };
    };
    return [
      { time: 0, value: makeGrid(leftTilt) },
      { time: 500, value: flat() },
      { time: 1000, value: makeGrid(rightTilt) },
    ];
  }

  if (warpType === "eye_open") {
    // Eyelid close: top row squishes toward center row
    // time=0 closed (param=0), time=1000 open (param=1, default)
    const closed: WarpDeltaFunction = (_cn, rn) => ({
      dx: 0,
      dy: (0.5 - rn) * 0.65 * gridH,
    });
    return [
      { time: 0, value: makeGrid(closed) },
      { time: 1000, value: flat() },
    ];
  }

  if (warpType === "mouth_open") {
    // Jaw drop: top row moves up, bottom row moves down
    // time=0 closed (param=0, flat), time=1000 open (param=1)
    const open: WarpDeltaFunction = (_cn, rn) => ({
      dx: 0,
      dy: (rn - 0.5) * 0.55 * gridH,
    });
    return [
      { time: 0, value: flat() },
      { time: 1000, value: makeGrid(open) },
    ];
  }

  if (warpType === "brow_y") {
    // Uniform vertical translation: down (time=0, param=-1) → up (time=1000, param=1)
    const shift = 0.25 * gridH;
    return [
      { time: 0, value: makeGrid(() => ({ dx: 0, dy: shift })) },
      { time: 500, value: flat() },
      { time: 1000, value: makeGrid(() => ({ dx: 0, dy: -shift })) },
    ];
  }

  if (warpType === "hair_sway") {
    // Tip-biased horizontal sway (rn=0 is root/top, rn=1 is tip/bottom)
    const rightSway: WarpDeltaFunction = (_cn, rn) => ({
      dx: rn * rn * 0.2 * gridW,
      dy: 0,
    });
    const leftSway: WarpDeltaFunction = (_cn, rn) => ({
      dx: -rn * rn * 0.2 * gridW,
      dy: 0,
    });
    return [
      { time: 0, value: makeGrid(leftSway) },
      { time: 500, value: flat() },
      { time: 1000, value: makeGrid(rightSway) },
    ];
  }

  if (warpType === "breathing") {
    // Chest compression on inhale (parameter 0=exhale/flat, 1=inhale/compressed)
    // Edge columns and top/bottom rows pinned; chest rows compress inward
    const inhale: WarpDeltaFunction = (cn, rn) => {
      // Edge columns stay pinned
      if (cn <= 0.05 || cn >= 0.95) return { dx: 0, dy: 0 };
      // Top edge and bottom 2 rows: no change
      if (rn <= 0.1 || rn >= 0.8) return { dx: 0, dy: 0 };

      // Chest rows compress inward with row-specific amplitudes (matching Live2D export)
      let dy = 0;
      const rowInChest = (rn - 0.1) / 0.7;
      if (rowInChest < 0.25) {
        // Upper chest
        dy = -0.1 * gridH;
      } else if (rowInChest < 0.5) {
        // Peak compression
        dy = -0.12 * gridH;
      } else if (rowInChest < 0.75) {
        // Lower chest
        dy = -0.06 * gridH;
      }

      // Horizontal squeeze: center columns move inward
      const cx = (cn - 0.5) * 2;
      const dx = -cx * 0.06 * gridW;

      return { dx, dy };
    };
    return [
      { time: 0, value: flat() },
      { time: 1000, value: makeGrid(inhale) },
    ];
  }

  return [
    { time: 0, value: flat() },
    { time: 1000, value: flat() },
  ];
}
