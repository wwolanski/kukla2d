/**
 * Pure mesh deformation pipeline.
 *
 * Computes final vertex positions for a part mesh from:
 *   setup/rest vertices -> mesh_verts/blend-shape override -> skinning -> warp ancestors.
 *
 * No React / Zustand / Pixi / DOM / Worker imports allowed in this file.
 */
import type {
  Bone,
  Mesh,
  Node,
  PartNode,
  VertexInfluence,
  WarpDeformerNode,
} from "@kukla2d/contracts";

import {
  computeWorldMatrices,
  makeLocalMatrix,
  mat3Inverse,
  mat3Mul,
} from "@/domain/transforms.js";
import type { Matrix3 } from "@/domain/transforms.types.js";

import { clamp, isFiniteNumber, lerp } from "@/lib/math";

import { normalizeVertexInfluences } from "./meshEditing.js";
import { buildRestGrid } from "./warpKeyframes.js";

import type { EffectiveMeshFrame } from "./meshDeformation.types.js";

const WARP_DEFAULTS = Object.freeze({
  col: 2,
  row: 2,
  gridX: 0,
  gridY: 0,
  gridW: 100,
  gridH: 100,
});

interface Point {
  x: number;
  y: number;
}
type BaseMeshSource = "poseOverride" | "setup";
interface WarpGridFrame {
  nodeId: string | undefined;
  col: number;
  row: number;
  gridX: number;
  gridY: number;
  gridW: number;
  gridH: number;
  points: Point[];
}
type VertexInput = readonly Point[] | readonly number[];
interface MeshPoseOverride {
  mesh_verts?: readonly unknown[];
}

function isPoint(value: unknown): value is Point {
  return (
    typeof value === "object" &&
    value !== null &&
    isFiniteNumber((value as { x?: unknown }).x) &&
    isFiniteNumber((value as { y?: unknown }).y)
  );
}

function toObjectVertices(vertices: VertexInput): Point[] {
  if (!vertices?.length) return [];
  if (isPoint(vertices[0]))
    return (vertices as readonly Point[]).map(({ x, y }) => ({ x, y }));
  const count = Math.floor(vertices.length / 2);
  return Array.from({ length: count }, (_, index) => ({
    x: (vertices as readonly number[])[index * 2] ?? 0,
    y: (vertices as readonly number[])[index * 2 + 1] ?? 0,
  }));
}

function transformPoint(matrix: Matrix3, x: number, y: number): Point {
  return {
    x: matrix[0] * x + matrix[3] * y + matrix[6],
    y: matrix[1] * x + matrix[4] * y + matrix[7],
  };
}

function clonePointArray(vertices: readonly Point[]): Point[] {
  return vertices.map((v) => ({ x: v.x, y: v.y }));
}

/**
 * Ensure mesh.influences has exactly one entry per vertex.
 * Mutates mesh.influences when missing or wrong length.
 */
export function ensureInfluenceSlots(mesh: Mesh | null | undefined): void {
  if (!mesh?.vertices?.length) return;
  const vertexCount = mesh.vertices.length;
  if (
    !Array.isArray(mesh.influences) ||
    mesh.influences.length !== vertexCount
  ) {
    mesh.influences = Array.from({ length: vertexCount }, () => []);
  }
}

/**
 * Normalize every vertex influence list to max 4 bones with total weight ~1.
 * Returns a new influences array of exactly vertexCount entries.
 */
export function normalizeInfluenceSlots(
  influences: readonly (readonly VertexInfluence[])[] | null | undefined,
  vertexCount: number,
): VertexInfluence[][] {
  const slots: VertexInfluence[][] = Array.from(
    { length: vertexCount },
    () => [],
  );
  if (!influences) return slots;
  for (let i = 0; i < Math.min(influences.length, vertexCount); i++) {
    slots[i] = normalizeVertexInfluences(influences[i] ?? []);
  }
  return slots;
}

/**
 * Resolve base mesh vertices for a part node.
 *
 * Uses poseOverride.mesh_verts when its length matches the setup mesh.
 * Otherwise falls back to mesh.vertices and reports a diagnostic marker.
 */
export function resolveBaseMeshVertices({
  node,
  poseOverride,
}: {
  node: PartNode | null | undefined;
  poseOverride: MeshPoseOverride | null | undefined;
}): { vertices: Point[]; source: BaseMeshSource; mismatch: boolean } {
  const setup = node?.mesh?.vertices ?? [];
  const overrideVerts = poseOverride?.mesh_verts;
  if (
    Array.isArray(overrideVerts) &&
    overrideVerts.length === setup.length &&
    overrideVerts.every(isPoint)
  ) {
    return {
      vertices: clonePointArray(overrideVerts),
      source: "poseOverride",
      mismatch: false,
    };
  }
  return {
    vertices: clonePointArray(setup),
    source: "setup",
    mismatch: Array.isArray(overrideVerts),
  };
}

/**
 * Apply linear blend skinning to vertices using mesh.influences.
 *
 * bones and restBones are Maps of boneId -> bone object with a `setup` transform.
 * Returns a new array of vertices; input arrays are not mutated.
 */
export function applyLinearBlendSkinning({
  vertices,
  node,
  bones,
  restBones,
}: {
  vertices: VertexInput;
  node: PartNode & { mesh: Mesh };
  bones: ReadonlyMap<string, Bone>;
  restBones: ReadonlyMap<string, Bone>;
}): Point[] {
  const influences = node?.mesh?.influences;
  if (!influences?.length || !vertices.length)
    return toObjectVertices(vertices);

  const objectVertices = toObjectVertices(vertices);
  const nodeWorldMatrix = computeWorldMatrices([node]).get(node.id)!;
  const worldToNode = mat3Inverse(nodeWorldMatrix);

  const bindToPose = new Map<string, Matrix3>();
  if (bones && restBones) {
    for (const [boneId, bindBone] of restBones) {
      const posedBone = bones.get(boneId);
      if (!posedBone || !bindBone?.setup) continue;
      bindToPose.set(
        boneId,
        mat3Mul(
          makeLocalMatrix(posedBone.setup),
          mat3Inverse(makeLocalMatrix(bindBone.setup)),
        ),
      );
    }
  }

  const result: Point[] = new Array<Point>(objectVertices.length);
  for (let index = 0; index < objectVertices.length; index++) {
    const vertex = objectVertices[index]!;
    const sourceWorld = transformPoint(nodeWorldMatrix, vertex.x, vertex.y);
    let worldX = 0;
    let worldY = 0;
    let totalWeight = 0;

    for (const influence of influences[index] ?? []) {
      const deltaMatrix = bindToPose.get(influence.boneId);
      if (!deltaMatrix || influence.weight <= 0) continue;
      const posedWorld = transformPoint(
        deltaMatrix,
        sourceWorld.x,
        sourceWorld.y,
      );
      worldX += posedWorld.x * influence.weight;
      worldY += posedWorld.y * influence.weight;
      totalWeight += influence.weight;
    }

    if (totalWeight < 1) {
      worldX += sourceWorld.x * (1 - totalWeight);
      worldY += sourceWorld.y * (1 - totalWeight);
    }

    const local = transformPoint(worldToNode, worldX, worldY);
    result[index] = local;
  }
  return result;
}

function sanitizeWarpDimension(value: unknown, fallback: number): number {
  return isFiniteNumber(value) && value > 0 ? Math.floor(value) : fallback;
}

function sanitizeWarpNumber(value: unknown, fallback: number): number {
  return isFiniteNumber(value) ? value : fallback;
}

/**
 * Build a warp grid frame for a warp deformer node.
 *
 * `poseOverride.mesh_verts` stores absolute grid point positions (same
 * coordinate space as `buildRestGrid`). When an override point is present
 * and valid it replaces the rest position; otherwise the rest position is
 * kept. Invalid col/row/gridW/gridH are replaced with defaults so the grid
 * is always usable.
 */
export function buildWarpGridFrame({
  warpNode,
  poseOverride,
}: {
  warpNode: WarpDeformerNode | null | undefined;
  poseOverride: { mesh_verts?: readonly unknown[] } | null | undefined;
}): WarpGridFrame {
  const col = sanitizeWarpDimension(warpNode?.col, WARP_DEFAULTS.col);
  const row = sanitizeWarpDimension(warpNode?.row, WARP_DEFAULTS.row);
  const gridX = sanitizeWarpNumber(warpNode?.gridX, WARP_DEFAULTS.gridX);
  const gridY = sanitizeWarpNumber(warpNode?.gridY, WARP_DEFAULTS.gridY);
  const gridW = sanitizeWarpNumber(warpNode?.gridW, WARP_DEFAULTS.gridW);
  const gridH = sanitizeWarpNumber(warpNode?.gridH, WARP_DEFAULTS.gridH);

  const rest = buildRestGrid({ gridX, gridY, gridW, gridH, col, row });
  const posed = rest.map((p, index) => {
    const override = poseOverride?.mesh_verts?.[index];
    if (isPoint(override)) {
      return { x: override.x, y: override.y };
    }
    return { x: p.x, y: p.y };
  });

  return {
    nodeId: warpNode?.id,
    col,
    row,
    gridX,
    gridY,
    gridW,
    gridH,
    points: posed,
  };
}

function bilinearSample(
  grid: WarpGridFrame,
  col: number,
  row: number,
  gx: number,
  gy: number,
): Point {
  const colF = clamp(gx, grid.gridX, grid.gridX + grid.gridW);
  const rowF = clamp(gy, grid.gridY, grid.gridY + grid.gridH);
  const u = grid.gridW > 0 ? (colF - grid.gridX) / grid.gridW : 0;
  const v = grid.gridH > 0 ? (rowF - grid.gridY) / grid.gridH : 0;
  const cu = clamp(u * col, 0, col);
  const rv = clamp(v * row, 0, row);
  const c0 = Math.floor(cu);
  const c1 = Math.min(c0 + 1, col);
  const r0 = Math.floor(rv);
  const r1 = Math.min(r0 + 1, row);
  const tc = cu - c0;
  const tr = rv - r0;

  const idx = (r: number, c: number): number => r * (col + 1) + c;
  const p00 = grid.points[idx(r0, c0)]!;
  const p10 = grid.points[idx(r0, c1)]!;
  const p01 = grid.points[idx(r1, c0)]!;
  const p11 = grid.points[idx(r1, c1)]!;

  const restX = lerp(lerp(p00.x, p10.x, tc), lerp(p01.x, p11.x, tc), tr);
  const restY = lerp(lerp(p00.y, p10.y, tc), lerp(p01.y, p11.y, tc), tr);
  return { x: restX, y: restY };
}

/**
 * Apply a warp grid to a set of vertices.
 *
 * Each vertex is treated as a point in the warp's local coordinate system.
 * Points outside the grid bounds keep their original position (identity).
 */
export function applyWarpGridToVertices({
  vertices,
  warpFrame,
}: {
  vertices: VertexInput;
  warpFrame: WarpGridFrame | null | undefined;
}): Point[] {
  if (!warpFrame?.points.length || !vertices.length)
    return toObjectVertices(vertices);
  const { col, row, gridX, gridY, gridW, gridH } = warpFrame;
  const objectVertices = toObjectVertices(vertices);
  return objectVertices.map((v) => {
    if (
      v.x < gridX ||
      v.x > gridX + gridW ||
      v.y < gridY ||
      v.y > gridY + gridH ||
      gridW <= 0 ||
      gridH <= 0
    ) {
      return { x: v.x, y: v.y };
    }
    return bilinearSample(warpFrame, col, row, v.x, v.y);
  });
}

function findAncestorWarpNodes(
  partNode: PartNode,
  allNodes: readonly Node[],
): WarpDeformerNode[] {
  const nodeMap = new Map(allNodes.map((n) => [n.id, n]));
  const warps: WarpDeformerNode[] = [];
  let parentId = partNode?.parent;
  while (parentId) {
    const parent = nodeMap.get(parentId);
    if (!parent) break;
    if (parent.type === "warpDeformer") warps.push(parent);
    parentId = parent.parent;
  }
  return warps;
}

/**
 * Build an EffectiveMeshFrame for a part node.
 *
 * Composes setup/rest -> pose override mesh_verts -> skinning -> ancestor warp deformers.
 */
export function buildEffectiveMeshFrame({
  partNode,
  poseOverrides,
  effectiveBones,
  restBones,
  warpFrames,
  allNodes,
}: {
  partNode: PartNode;
  poseOverrides?: ReadonlyMap<string, MeshPoseOverride> | null;
  effectiveBones?: readonly Bone[] | null;
  restBones?: readonly Bone[] | null;
  warpFrames?: ReadonlyMap<string, WarpGridFrame> | null;
  allNodes?: readonly Node[] | null;
}): EffectiveMeshFrame {
  const partId = partNode?.id;
  const poseOverride = poseOverrides?.get(partId);

  const base = resolveBaseMeshVertices({ node: partNode, poseOverride });
  let vertices = base.vertices;

  const boneMap = new Map<string, Bone>(
    (effectiveBones ?? []).map((b) => [b.id, b]),
  );
  const restBoneMap = new Map<string, Bone>(
    (restBones ?? []).map((b) => [b.id, b]),
  );
  const partMesh = partNode.mesh;
  if (partMesh?.influences?.length) {
    vertices = applyLinearBlendSkinning({
      vertices,
      node: { ...partNode, mesh: partMesh },
      bones: boneMap,
      restBones: restBoneMap,
    });
  }

  const warpAncestors = findAncestorWarpNodes(partNode, allNodes ?? []);
  for (const warpNode of warpAncestors) {
    const warpFrame =
      warpFrames?.get(warpNode.id) ??
      buildWarpGridFrame({
        warpNode,
        poseOverride: poseOverrides?.get(warpNode.id),
      });
    if (!warpFrame) continue;
    vertices = applyWarpGridToVertices({ vertices, warpFrame });
  }

  return {
    partId,
    vertices,
    uvs: partMesh?.uvs ?? [],
    triangles: partMesh?.triangles ?? [],
    source: base.mismatch ? "setup(mismatch)" : base.source,
  };
}
