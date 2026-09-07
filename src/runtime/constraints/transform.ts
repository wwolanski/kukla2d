import type { Bone, BoneId, ConstraintId } from "@kukla2d/contracts";

import type { BoneOverride } from "./ik.types.js";

interface TransformConstraint {
  id?: ConstraintId;
  type?: "transform";
  targetBoneId?: BoneId | null;
  affectedBoneIds?: readonly BoneId[];
  mix?: number;
  mode?: "local" | "world";
  copyX?: boolean;
  copyY?: boolean;
  copyRotation?: boolean;
  copyScaleX?: boolean;
  copyScaleY?: boolean;
}

export function solveTransformConstraint(
  constraint: TransformConstraint,
  boneMap: ReadonlyMap<BoneId, Bone>,
): Map<BoneId, BoneOverride> {
  const overrides = new Map<BoneId, BoneOverride>();
  const { targetBoneId, affectedBoneIds = [], mix = 1 } = constraint;
  if (!targetBoneId || affectedBoneIds.length === 0) return overrides;
  const source = boneMap.get(targetBoneId);
  if (!source) return overrides;

  for (const boneId of affectedBoneIds) {
    const target = boneMap.get(boneId);
    if (!target) continue;
    const sourceX = source.setup?.x ?? 0;
    const sourceY = source.setup?.y ?? 0;
    const sourceRotation = source.setup?.rotation ?? 0;
    const sourceScaleX = source.setup?.scaleX ?? 1;
    const sourceScaleY = source.setup?.scaleY ?? 1;
    const targetX = target.setup?.x ?? 0;
    const targetY = target.setup?.y ?? 0;
    const targetRotation = target.setup?.rotation ?? 0;
    const targetScaleX = target.setup?.scaleX ?? 1;
    const targetScaleY = target.setup?.scaleY ?? 1;
    const override: BoneOverride = {};
    if (constraint.copyX ?? true) override.x = mixValue(targetX, sourceX, mix);
    if (constraint.copyY ?? true) override.y = mixValue(targetY, sourceY, mix);
    if (constraint.copyRotation ?? true) {
      override.rotation =
        targetRotation + shortestAngle(sourceRotation - targetRotation) * mix;
    }
    if (constraint.copyScaleX ?? true)
      override.scaleX = mixValue(targetScaleX, sourceScaleX, mix);
    if (constraint.copyScaleY ?? true)
      override.scaleY = mixValue(targetScaleY, sourceScaleY, mix);
    overrides.set(boneId, override);
  }
  return overrides;
}

function mixValue(from: number, to: number, mix: number): number {
  return from + (to - from) * mix;
}

function shortestAngle(angle: number): number {
  let value = angle;
  while (value > 180) value -= 360;
  while (value < -180) value += 360;
  return value;
}
