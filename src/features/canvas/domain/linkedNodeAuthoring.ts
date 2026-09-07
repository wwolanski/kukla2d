import type { Bone, BoneSetup, Node } from "@kukla2d/contracts";

import {
  decomposeAffineMatrix,
  makeLocalMatrix,
  mat3Inverse,
  mat3Mul,
} from "@/domain/transforms";
import type { Matrix3 } from "@/domain/transforms.types.js";

type LinkedNodeAuthoringResult =
  | {
      valid: true;
      transform: Pick<BoneSetup, "x" | "y" | "rotation" | "scaleX" | "scaleY">;
    }
  | { valid: false; reasonCode: "missing_node_or_bone" | "invalid_matrix" };

interface LinkedNodeAuthoringInput {
  node: Node | null;
  bone: Bone | null;
  boneOverrides?: Partial<BoneSetup> | null;
  preLinkedWorldMatrices: ReadonlyMap<string, Matrix3>;
  desiredDisplayedWorld: Matrix3 | null;
}

/**
 * Resolve the authored (pre-link) node transform that, after the bone linked
 * pass, reproduces the desired displayed world position.
 *
 * K3 contract: pure helper, no React/Zustand/DOM/Pixi.
 *
 * @param {Object} args
 * @param {Object} args.node - source project node (has .parent, .transform)
 * @param {Object} args.bone - the assigned bone (has .setup)
 * @param {Object} args.boneOverrides - effective bone override (posed setup values)
 * @param {Map<string,Float32Array>} args.preLinkedWorldMatrices - world matrices of pre-link source nodes
 * @param {Float32Array} args.desiredDisplayedWorld - 3×3 column-major world matrix of the desired displayed pose
 * @returns {{ valid: boolean, transform?: {x,y,rotation,scaleX,scaleY}, reasonCode?: string }}
 */
export function resolveLinkedNodeAuthoredTransform({
  node,
  bone,
  boneOverrides,
  preLinkedWorldMatrices,
  desiredDisplayedWorld,
}: LinkedNodeAuthoringInput): LinkedNodeAuthoringResult {
  if (!node || !bone || !desiredDisplayedWorld) {
    return { valid: false, reasonCode: "missing_node_or_bone" };
  }

  const bind = bone.setup;
  const posed = { ...bind, ...(boneOverrides ?? {}) };
  const boneDelta = mat3Mul(
    makeLocalMatrix(posed),
    mat3Inverse(makeLocalMatrix(bind)),
  );
  const invBoneDelta = mat3Inverse(boneDelta);

  const srcWorld = mat3Mul(invBoneDelta, desiredDisplayedWorld);

  const parentWorld = node.parent
    ? (preLinkedWorldMatrices.get(node.parent) ?? null)
    : null;
  const parentInv = parentWorld ? mat3Inverse(parentWorld) : null;
  const srcLocal = parentInv ? mat3Mul(parentInv, srcWorld) : srcWorld;

  const fallback = {
    pivotX: node.transform?.pivotX ?? 0,
    pivotY: node.transform?.pivotY ?? 0,
  };
  const result = decomposeAffineMatrix(srcLocal, fallback);

  if (
    !Number.isFinite(result.x) ||
    !Number.isFinite(result.y) ||
    !Number.isFinite(result.rotation) ||
    !Number.isFinite(result.scaleX) ||
    !Number.isFinite(result.scaleY)
  ) {
    return { valid: false, reasonCode: "invalid_matrix" };
  }

  return {
    valid: true,
    transform: {
      x: result.x,
      y: result.y,
      rotation: result.rotation,
      scaleX: result.scaleX,
      scaleY: result.scaleY,
    },
  };
}
