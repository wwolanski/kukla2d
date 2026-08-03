/**
 * 2D transform utilities — shared between the renderer and UI components.
 *
 * All matrices are 3×3 column-major Float32Array(9).
 * Index convention: m[col*3 + row]
 *
 *  col0  col1  col2
 *  [0]   [3]   [6]   row 0
 *  [1]   [4]   [7]   row 1
 *  [2]   [5]   [8]   row 2
 */

import { mat3 } from 'gl-matrix';

import type { Node, Transform } from '@kukla2d/contracts';

export type Matrix3 = mat3;
export type TransformLike = Partial<Transform> | null | undefined;

/** Identity matrix */
export function mat3Identity(): Matrix3 {
  return mat3.create();
}

/**
 * Multiply two column-major 3×3 matrices: C = A × B
 */
export function mat3Mul(a: mat3, b: mat3): Matrix3 {
  const out = new Float32Array(9);
  return mat3.multiply(out, a, b);
}

/**
 * Invert a 2D affine 3×3 column-major matrix.
 * Assumes no perspective (last row is [0, 0, 1]).
 * Returns identity for singular/near-singular matrices.
 */
export function mat3Inverse(m: mat3): Matrix3 {
  const out = new Float32Array(9);
  const result = mat3.invert(out, m);
  if (!result) return mat3Identity();
  return result;
}

/**
 * Build a local 3×3 matrix from a node's transform properties.
 *
 * Applies (right to left):
 *   T(x+pivotX, y+pivotY) × R(rotation°) × S(scaleX, scaleY) × T(-pivotX, -pivotY)
 *
 * @param {{ x?, y?, rotation?, scaleX?, scaleY?, pivotX?, pivotY? }|null|undefined} t
 */
export function makeLocalMatrix(t: TransformLike): Matrix3 {
  const {
    x = 0, y = 0,
    rotation = 0,
    scaleX = 1, scaleY = 1,
    pivotX = 0, pivotY = 0,
  } = t ?? {};

  const θ = rotation * (Math.PI / 180);
  const c = Math.cos(θ);
  const s = Math.sin(θ);

  const m0 = scaleX * c;
  const m1 = scaleX * s;
  const m3 = -scaleY * s;
  const m4 = scaleY * c;

  return new Float32Array([
     m0,                                        // [0]
     m1,                                        // [1]
     0,                                         // [2]
     m3,                                        // [3]
     m4,                                        // [4]
     0,                                         // [5]
    (x + pivotX) - m0 * pivotX - m3 * pivotY,   // [6]
    (y + pivotY) - m1 * pivotX - m4 * pivotY,   // [7]
     1,                                         // [8]
  ]);
}

/**
 * Convert an affine matrix back to the transform shape used by project nodes.
 * Keeps the caller's pivot while solving x/y so `makeLocalMatrix(result)`
 * recreates the same matrix (for transforms without shear).
 */
export function decomposeAffineMatrix(m: mat3, fallback: Partial<Transform> = {}): Transform {
  const pivotX = fallback.pivotX ?? 0;
  const pivotY = fallback.pivotY ?? 0;
  const scaleX = Math.hypot(m[0], m[1]);
  const principalRotation = Math.atan2(m[1], m[0]) * (180 / Math.PI);
  const fallbackRotation = fallback.rotation;
  // A matrix cannot distinguish 0deg from +/-360deg. Keep the angle on the
  // branch nearest to the authored value so imported rotations such as -720
  // do not jump by several full turns after the first resize/rotate gesture.
  const rotation = typeof fallbackRotation === 'number' && Number.isFinite(fallbackRotation)
    ? principalRotation + 360 * Math.round((fallbackRotation - principalRotation) / 360)
    : principalRotation;

  return {
    x: m[6] - pivotX + m[0] * pivotX + m[3] * pivotY,
    y: m[7] - pivotY + m[1] * pivotX + m[4] * pivotY,
    rotation,
    scaleX,
    scaleY: (m[0] * m[4] - m[1] * m[3]) / (scaleX || 1),
    pivotX,
    pivotY,
  };
}

/**
 * Compute world matrices for every node in a flat array.
 * world = parentWorld × local  (depth-first, memoised).
 *
 * @param {Array} nodes  Flat node array from projectStore
 * @returns {Map<string, Float32Array>}  nodeId → column-major 3×3
 */
export function computeWorldMatrices(nodes: readonly Node[]): Map<string, Matrix3> {
  const worldMap = new Map<string, Matrix3>();
  const nodeMap = new Map<string, Node>(nodes.map(node => [node.id, node]));

  function resolve(node: Node): Matrix3 {
    if (worldMap.has(node.id)) return worldMap.get(node.id)!;
    const local = makeLocalMatrix(node.transform);
    const world = (node.parent && nodeMap.has(node.parent))
      ? mat3Mul(resolve(nodeMap.get(node.parent)!), local)
      : local;
    worldMap.set(node.id, world);
    return world;
  }

  for (const node of nodes) resolve(node);
  return worldMap;
}

/**
 * Compute effective visibility and opacity for every node by walking the
 * parent chain and accumulating values (depth-first, memoised).
 *
 * A node is effectively visible only when it AND all ancestors are visible.
 * Effective opacity is the product of a node's own opacity with all ancestor
 * opacities (mirrors how Photoshop / After Effects layer groups behave).
 *
 * @param {Array} nodes  Flat node array from projectStore
 * @returns {{ visMap: Map<string,boolean>, opMap: Map<string,number> }}
 */
export function computeEffectiveProps(nodes: readonly Node[]): {
  visMap: Map<string, boolean>;
  opMap: Map<string, number>;
} {
  const visMap = new Map<string, boolean>();
  const opMap = new Map<string, number>();
  const nodeMap = new Map<string, Node>(nodes.map(node => [node.id, node]));

  function resolve(node: Node): void {
    if (visMap.has(node.id)) return;
    const parentId = node.parent;
    if (parentId && nodeMap.has(parentId)) {
      resolve(nodeMap.get(parentId)!);
      visMap.set(node.id, (visMap.get(parentId) ?? true) && (node.visible !== false));
      opMap.set(node.id, (opMap.get(parentId) ?? 1) * (node.opacity ?? 1));
    } else {
      visMap.set(node.id, node.visible !== false);
      opMap.set(node.id, node.opacity ?? 1);
    }
  }

  for (const node of nodes) resolve(node);
  return { visMap, opMap };
}
