/**
 * Constraint pose: IK/constraint overrides applied on top of animation pose.
 *
 * Pure input transformations; project and bone objects are never mutated.
 * IK solving delegates to the pure runtime constraint solver.
 */
import type { Bone, BoneSetup, ProjectDocument } from "@kukla2d/contracts";

import type { PoseOverrides } from "@/domain/animationEngine.types.js";
import { solveIK } from "@/runtime/constraints/ik.js";

import { applyBoneHierarchyOverrides } from "./poseModel.js";

type BoneOverride = Partial<
  Pick<BoneSetup, "x" | "y" | "rotation" | "scaleX" | "scaleY" | "length">
>;
const BONE_OVERRIDE_KEYS = [
  "x",
  "y",
  "rotation",
  "scaleX",
  "scaleY",
  "length",
] as const;

export function cloneBoneWithOverrides(
  bone: Bone,
  override?: Record<string, unknown>,
): Bone {
  const setup = { ...(bone.setup ?? {}) };
  for (const key of BONE_OVERRIDE_KEYS) {
    const value = override?.[key];
    if (typeof value === "number") setup[key] = value;
  }
  return { ...bone, setup };
}

export function mergePoseOverride(
  poseOverrides: PoseOverrides,
  targetId: string | null | undefined,
  partial: BoneOverride,
): void {
  if (!targetId) return;
  const existing = poseOverrides.get(targetId) ?? {};
  poseOverrides.set(targetId, { ...existing, ...partial });
}

/**
 * Apply IK constraint overrides for project.bones.
 * Mirrors bone overrides to group node via `bone.nodeId`.
 * Missing bones preserve the original override map.
 */
export function applyBoneConstraintOverrides(
  project: ProjectDocument,
  poseOverrides: PoseOverrides | null,
): PoseOverrides | null {
  if (!project.bones?.length) return poseOverrides;
  const authoredOverrides: PoseOverrides = poseOverrides
    ? new Map<string, Record<string, unknown>>(poseOverrides)
    : new Map<string, Record<string, unknown>>();
  let nextOverrides = applyBoneHierarchyOverrides(project, authoredOverrides);
  let boneMap = new Map(
    project.bones.map((bone) => [
      bone.id,
      cloneBoneWithOverrides(bone, nextOverrides?.get(bone.id)),
    ]),
  );

  const constraints = [...(project.constraints ?? [])]
    .map((constraint) => ({
      ...constraint,
      ...(nextOverrides.get(constraint.id) ?? {}),
    }))
    .filter(
      (constraint) => constraint.type === "ik" && constraint.enabled !== false,
    )
    .sort((left, right) => (left.order ?? 0) - (right.order ?? 0));

  for (const constraint of constraints) {
    const mix = (constraint.mix ?? 1) * (constraint.fkIk ?? 1);
    if (mix <= 0) continue;
    const poleBone = constraint.poleBoneId
      ? boneMap.get(constraint.poleBoneId)
      : null;
    const firstAffectedBoneId = constraint.affectedBoneIds?.[0];
    const bendPositive = poleBone
      ? (poleBone.setup?.y ?? 0) >=
        (firstAffectedBoneId
          ? (boneMap.get(firstAffectedBoneId)?.setup?.y ?? 0)
          : 0)
      : (constraint.bendPositive ?? true);
    const solved = solveIK({ ...constraint, mix, bendPositive }, boneMap);
    for (const [boneId, solvedOverride] of solved) {
      mergePoseOverride(authoredOverrides, boneId, solvedOverride);
    }
    // Constraint results become authored world-space values. Re-evaluate the
    // hierarchy so every descendant follows the solved parent in this frame.
    nextOverrides = applyBoneHierarchyOverrides(project, authoredOverrides);
    boneMap = new Map(
      project.bones.map((bone) => [
        bone.id,
        cloneBoneWithOverrides(bone, nextOverrides?.get(bone.id)),
      ]),
    );
  }

  for (const bone of project.bones) {
    const override = nextOverrides.get(bone.id);
    if (!override) continue;
    mergePoseOverride(nextOverrides, bone.nodeId, override);
  }
  return nextOverrides?.size > 0 ? nextOverrides : poseOverrides;
}
