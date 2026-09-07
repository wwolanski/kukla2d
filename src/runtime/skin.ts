import type { BoneId, VertexInfluence } from "@kukla2d/contracts";

import { mat3Mul } from "../domain/transforms.js";

import type { Matrix3 } from "../domain/transforms.types.js";

interface SkinningDiagnostic {
  code:
    | "ODD_VERTEX_COMPONENT_COUNT"
    | "INFLUENCE_COUNT_MISMATCH"
    | "MISSING_BONE_MATRIX";
  vertexIndex?: number;
  boneId?: BoneId;
}

interface SkinningResult {
  vertices: Float32Array;
  diagnostics: readonly SkinningDiagnostic[];
}

/** Returns a new vertex buffer; input buffers and matrices remain caller-owned. */
export function linearBlendSkinningResult(
  baseVertices: ArrayLike<number>,
  influences: readonly (readonly VertexInfluence[])[],
  boneWorldMatrices: ReadonlyMap<BoneId, Matrix3>,
  inverseBindMatrices: ReadonlyMap<BoneId, Matrix3>,
): SkinningResult {
  const vertices = new Float32Array(baseVertices);
  const diagnostics: SkinningDiagnostic[] = [];
  if (vertices.length % 2 !== 0)
    diagnostics.push({ code: "ODD_VERTEX_COMPONENT_COUNT" });
  const vertexCount = Math.floor(vertices.length / 2);
  if (influences.length !== vertexCount)
    diagnostics.push({ code: "INFLUENCE_COUNT_MISMATCH" });

  for (let index = 0; index < vertexCount; index += 1) {
    const x = vertices[index * 2]!;
    const y = vertices[index * 2 + 1]!;
    let deltaX = 0;
    let deltaY = 0;

    for (const influence of influences[index] ?? []) {
      if (!Number.isFinite(influence.weight) || influence.weight <= 0) continue;
      const world = boneWorldMatrices.get(influence.boneId);
      const inverseBind = inverseBindMatrices.get(influence.boneId);
      if (!world || !inverseBind) {
        diagnostics.push({
          code: "MISSING_BONE_MATRIX",
          vertexIndex: index,
          boneId: influence.boneId,
        });
        continue;
      }
      const bindMatrix = mat3Mul(world, inverseBind);
      deltaX +=
        influence.weight *
        (bindMatrix[0] * x + bindMatrix[3] * y + bindMatrix[6] - x);
      deltaY +=
        influence.weight *
        (bindMatrix[1] * x + bindMatrix[4] * y + bindMatrix[7] - y);
    }

    vertices[index * 2] = x + deltaX;
    vertices[index * 2 + 1] = y + deltaY;
  }
  return { vertices, diagnostics };
}

export function linearBlendSkinning(
  baseVertices: ArrayLike<number>,
  influences: readonly (readonly VertexInfluence[])[],
  boneWorldMatrices: ReadonlyMap<BoneId, Matrix3>,
  inverseBindMatrices: ReadonlyMap<BoneId, Matrix3>,
): Float32Array {
  return linearBlendSkinningResult(
    baseVertices,
    influences,
    boneWorldMatrices,
    inverseBindMatrices,
  ).vertices;
}

export function normalizeInfluences(
  influences: readonly (readonly VertexInfluence[])[],
): VertexInfluence[][] {
  return influences.map((vertexInfluences) => {
    const sorted = [...vertexInfluences]
      .filter(
        (influence) =>
          Number.isFinite(influence.weight) && influence.weight > 0,
      )
      .sort((left, right) => right.weight - left.weight)
      .slice(0, 4);
    const sum = sorted.reduce(
      (total, influence) => total + influence.weight,
      0,
    );
    return sum <= 0
      ? []
      : sorted.map((influence) => ({
          boneId: influence.boneId,
          weight: influence.weight / sum,
        }));
  });
}
