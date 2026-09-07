import type {
  BlendShape,
  Bone,
  BoneId,
  Node,
  NodeId,
} from "@kukla2d/contracts";

import { isRecord } from "@/lib/guards";
import { clamp01, finiteNumberOr, isFiniteNumber } from "@/lib/math";

import {
  computeBoneWorldMatrices,
  computeInverseBindMatrices,
} from "./skeleton.js";
import { linearBlendSkinning } from "./skin.js";

import type { BoneTransformOverride, PoseOverrideMap } from "./pose.types.js";
import type { Matrix3 } from "../domain/transforms.types.js";

interface DeformDrawItem {
  nodeId: NodeId;
  /** Pipeline owns this mutable buffer; consumers must not mutate it. */
  vertices: Float32Array | null;
  blendMode: "normal";
  opacity: number;
  drawOrder: number;
}

interface ClipRegion {
  maskNodeId: string;
  targetNodeId: NodeId;
}

interface DeformPipelineResult {
  drawList: readonly DeformDrawItem[];
  clipRegions: readonly ClipRegion[];
  boneWorldMatrices: ReadonlyMap<BoneId, Matrix3>;
  diagnostics: readonly DeformDiagnostic[];
}

type DeformDiagnostic =
  | { code: "INVALID_VERTEX_BUFFER"; nodeId: NodeId }
  | { code: "INVALID_WARP_LATTICE"; nodeId: NodeId };

interface DeformProject {
  bones: readonly Bone[];
  nodes: readonly Node[];
}

interface WarpPoint {
  dx: number;
  dy: number;
}
interface WarpState {
  lattice: readonly WarpPoint[];
  gridX: number;
  gridY: number;
  gridW: number;
  gridH: number;
  col: number;
  row: number;
}

export function executeDeformPipeline(
  project: DeformProject,
  animationOverrides?: PoseOverrideMap | null,
): DeformPipelineResult {
  const effectiveBones = applyBoneOverrides(project.bones, animationOverrides);
  const boneWorldMatrices = computeBoneWorldMatrices(effectiveBones);
  const inverseBindMatrices = computeInverseBindMatrices(
    computeBoneWorldMatrices(project.bones),
  );
  const drawList: DeformDrawItem[] = [];
  const clipRegions: ClipRegion[] = [];
  const diagnostics: DeformDiagnostic[] = [];

  for (const node of project.nodes) {
    if (node.type !== "part" || node.visible === false) continue;
    let vertices = node.mesh ? flattenVertexSource(node.mesh.vertices) : null;
    if (node.mesh && !vertices)
      diagnostics.push({ code: "INVALID_VERTEX_BUFFER", nodeId: node.id });

    if (vertices && node.mesh?.influences) {
      vertices = linearBlendSkinning(
        vertices,
        node.mesh.influences,
        boneWorldMatrices,
        inverseBindMatrices,
      );
    }
    if (vertices && node.blendShapes && node.blendShapeValues) {
      vertices = applyBlendShapes(
        vertices,
        node.blendShapes,
        node.blendShapeValues,
      );
    }
    if (vertices) {
      const warpValue = getWarpOverride(
        node.id,
        project.nodes,
        animationOverrides,
      );
      if (warpValue !== undefined) {
        const warpState = parseWarpState(warpValue);
        if (warpState) vertices = applyWarpDeformation(vertices, warpState);
        else
          diagnostics.push({ code: "INVALID_WARP_LATTICE", nodeId: node.id });
      }
    }
    if (node.clip_mask)
      clipRegions.push({ maskNodeId: node.clip_mask, targetNodeId: node.id });
    drawList.push({
      nodeId: node.id,
      vertices,
      blendMode: "normal",
      opacity: node.opacity ?? 1,
      drawOrder: node.draw_order ?? 0,
    });
  }
  drawList.sort((left, right) => left.drawOrder - right.drawOrder);
  return { drawList, clipRegions, boneWorldMatrices, diagnostics };
}

function applyBoneOverrides(
  bones: readonly Bone[],
  overrides?: PoseOverrideMap | null,
): Bone[] {
  if (!overrides) return [...bones];
  return bones.map((bone) => {
    const value = overrides.get(bone.id);
    if (!value) return bone;
    const override = parseBoneOverride(value);
    return {
      ...bone,
      setup: {
        ...bone.setup,
        x: bone.setup.x + (override.x ?? 0),
        y: bone.setup.y + (override.y ?? 0),
        rotation: bone.setup.rotation + (override.rotation ?? 0),
        scaleX: bone.setup.scaleX * (override.scaleX ?? 1),
        scaleY: bone.setup.scaleY * (override.scaleY ?? 1),
      },
    };
  });
}

function applyBlendShapes(
  baseVertices: Float32Array,
  blendShapes: readonly BlendShape[],
  values: Readonly<Record<string, number>>,
): Float32Array {
  const output = new Float32Array(baseVertices);
  const vertexCount = Math.floor(output.length / 2);
  for (const shape of blendShapes) {
    const influence = values[shape.id] ?? 0;
    if (
      !Number.isFinite(influence) ||
      influence <= 0 ||
      !Array.isArray(shape.deltas)
    )
      continue;
    for (
      let index = 0;
      index < Math.min(vertexCount, shape.deltas.length);
      index += 1
    ) {
      const delta = shape.deltas[index];
      if (!delta) continue;
      output[index * 2] = output[index * 2]! + delta.dx * influence;
      output[index * 2 + 1] = output[index * 2 + 1]! + delta.dy * influence;
    }
  }
  return output;
}

function getWarpOverride(
  nodeId: NodeId,
  nodes: readonly Node[],
  overrides?: PoseOverrideMap | null,
): unknown {
  const warp = nodes.find(
    (node) => node.type === "warpDeformer" && node.parent === nodeId,
  );
  return warp ? overrides?.get(`warp:${warp.id}`) : undefined;
}

function applyWarpDeformation(
  vertices: Float32Array,
  state: WarpState,
): Float32Array {
  const output = new Float32Array(vertices);
  if (
    state.col < 2 ||
    state.row < 2 ||
    state.lattice.length < state.col * state.row
  )
    return output;
  const vertexCount = Math.floor(output.length / 2);
  for (let index = 0; index < vertexCount; index += 1) {
    const x = output[index * 2]!;
    const y = output[index * 2 + 1]!;
    const u = clamp01((x - state.gridX) / nonZero(state.gridW));
    const v = clamp01((y - state.gridY) / nonZero(state.gridH));
    const column = Math.min(state.col - 2, Math.floor(u * (state.col - 1)));
    const row = Math.min(state.row - 2, Math.floor(v * (state.row - 1)));
    const localU = u * (state.col - 1) - column;
    const localV = v * (state.row - 1) - row;
    const topLeft = state.lattice[row * state.col + column];
    const topRight = state.lattice[row * state.col + column + 1];
    const bottomLeft = state.lattice[(row + 1) * state.col + column];
    const bottomRight = state.lattice[(row + 1) * state.col + column + 1];
    if (!topLeft || !topRight || !bottomLeft || !bottomRight) continue;
    output[index * 2] =
      x +
      bilerp(
        topLeft.dx,
        topRight.dx,
        bottomLeft.dx,
        bottomRight.dx,
        localU,
        localV,
      );
    output[index * 2 + 1] =
      y +
      bilerp(
        topLeft.dy,
        topRight.dy,
        bottomLeft.dy,
        bottomRight.dy,
        localU,
        localV,
      );
  }
  return output;
}

function parseWarpState(value: unknown): WarpState | null {
  if (!isRecord(value) || !Array.isArray(value.lattice)) return null;
  const lattice: WarpPoint[] = [];
  for (const point of value.lattice) {
    if (
      !isRecord(point) ||
      !isFiniteNumber(point.dx) ||
      !isFiniteNumber(point.dy)
    )
      return null;
    lattice.push({ dx: point.dx, dy: point.dy });
  }
  const col = finiteNumberOr(value.col, 0);
  const row = finiteNumberOr(value.row, 0);
  return {
    lattice,
    col: Math.floor(col),
    row: Math.floor(row),
    gridX: finiteNumberOr(value.gridX, 0),
    gridY: finiteNumberOr(value.gridY, 0),
    gridW: finiteNumberOr(value.gridW, 1),
    gridH: finiteNumberOr(value.gridH, 1),
  };
}

function flattenVertexSource(value: unknown): Float32Array | null {
  if (value instanceof Float32Array) return new Float32Array(value);
  if (!Array.isArray(value)) return null;
  const output = new Float32Array(value.length * 2);
  for (let index = 0; index < value.length; index += 1) {
    const vertex: unknown = value[index];
    if (
      !isRecord(vertex) ||
      !isFiniteNumber(vertex.x) ||
      !isFiniteNumber(vertex.y)
    )
      return null;
    output[index * 2] = vertex.x;
    output[index * 2 + 1] = vertex.y;
  }
  return output;
}

function parseBoneOverride(
  value: Readonly<Record<string, unknown>>,
): BoneTransformOverride {
  return {
    ...(isFiniteNumber(value.x) ? { x: value.x } : {}),
    ...(isFiniteNumber(value.y) ? { y: value.y } : {}),
    ...(isFiniteNumber(value.rotation) ? { rotation: value.rotation } : {}),
    ...(isFiniteNumber(value.scaleX) ? { scaleX: value.scaleX } : {}),
    ...(isFiniteNumber(value.scaleY) ? { scaleY: value.scaleY } : {}),
  };
}

function bilerp(
  a: number,
  b: number,
  c: number,
  d: number,
  u: number,
  v: number,
): number {
  return (1 - u) * (1 - v) * a + u * (1 - v) * b + (1 - u) * v * c + u * v * d;
}

function nonZero(value: number): number {
  return value === 0 ? 1 : value;
}
