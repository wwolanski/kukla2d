import type { Bone, BoneId, BoneSetup } from "@kukla2d/contracts";

import { mat3Inverse, mat3Mul } from "../domain/transforms.js";

import type { Matrix3 } from "../domain/transforms.types.js";

type SkeletonTopologyDiagnostic =
  | { code: "DUPLICATE_BONE_ID"; boneId: BoneId }
  | { code: "MISSING_PARENT"; boneId: BoneId; parentId: BoneId }
  | { code: "PARENT_CYCLE"; boneIds: readonly BoneId[] };

type BoneMatrixResult =
  | {
      ok: true;
      matrices: ReadonlyMap<BoneId, Matrix3>;
      diagnostics: readonly SkeletonTopologyDiagnostic[];
    }
  | {
      ok: false;
      matrices: ReadonlyMap<BoneId, Matrix3>;
      diagnostics: readonly SkeletonTopologyDiagnostic[];
    };

/** Computes owned world matrices. Invalid parent edges fall back to local space. */
export function computeBoneWorldMatricesResult(
  bones: readonly Bone[],
): BoneMatrixResult {
  const matrices = new Map<BoneId, Matrix3>();
  const boneMap = new Map<BoneId, Bone>();
  const diagnostics: SkeletonTopologyDiagnostic[] = [];
  const resolving = new Set<BoneId>();

  for (const bone of bones) {
    if (boneMap.has(bone.id))
      diagnostics.push({ code: "DUPLICATE_BONE_ID", boneId: bone.id });
    else boneMap.set(bone.id, bone);
  }

  function resolve(bone: Bone, path: readonly BoneId[]): Matrix3 {
    const cached = matrices.get(bone.id);
    if (cached) return cached;

    const local = makeBoneLocalMatrix(bone.setup);
    if (!bone.parentId) {
      matrices.set(bone.id, local);
      return local;
    }

    const parent = boneMap.get(bone.parentId);
    if (!parent) {
      diagnostics.push({
        code: "MISSING_PARENT",
        boneId: bone.id,
        parentId: bone.parentId,
      });
      matrices.set(bone.id, local);
      return local;
    }

    if (resolving.has(bone.id)) {
      const cycleStart = path.indexOf(bone.id);
      diagnostics.push({
        code: "PARENT_CYCLE",
        boneIds: cycleStart >= 0 ? path.slice(cycleStart) : [...path, bone.id],
      });
      matrices.set(bone.id, local);
      return local;
    }

    resolving.add(bone.id);
    const world = mat3Mul(resolve(parent, [...path, bone.id]), local);
    resolving.delete(bone.id);
    matrices.set(bone.id, world);
    return world;
  }

  for (const bone of boneMap.values()) resolve(bone, []);
  return diagnostics.length === 0
    ? { ok: true, matrices, diagnostics }
    : { ok: false, matrices, diagnostics };
}

export function computeBoneWorldMatrices(
  bones: readonly Bone[],
): Map<BoneId, Matrix3> {
  return new Map(computeBoneWorldMatricesResult(bones).matrices);
}

export function computeInverseBindMatrices(
  worldMatrices: ReadonlyMap<BoneId, Matrix3>,
): Map<BoneId, Matrix3> {
  const inverseBind = new Map<BoneId, Matrix3>();
  for (const [boneId, world] of worldMatrices)
    inverseBind.set(boneId, mat3Inverse(world));
  return inverseBind;
}

function makeBoneLocalMatrix(setup: BoneSetup): Matrix3 {
  const {
    x = 0,
    y = 0,
    rotation = 0,
    scaleX = 1,
    scaleY = 1,
    shearX = 0,
    shearY = 0,
  } = setup;
  const radians = (rotation + shearY) * (Math.PI / 180);
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  const shearedScaleX = scaleX * (1 + shearX / 100);
  return new Float32Array([
    shearedScaleX * cosine,
    shearedScaleX * sine,
    0,
    -scaleY * sine,
    scaleY * cosine,
    0,
    x,
    y,
    1,
  ]);
}
