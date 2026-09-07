import type { Bone, Constraint } from "@kukla2d/contracts";

import type { BoneOverride } from "./ik.types.js";

/** Solve one- and two-bone IK chains without mutating bind-pose bones. */
export function solveIK(
  constraint: Constraint,
  boneMap: ReadonlyMap<string, Bone>,
): Map<string, BoneOverride> {
  const overrides = new Map<string, BoneOverride>();
  const {
    affectedBoneIds = [],
    targetBoneId,
    mix = 1,
    bendPositive = true,
  } = constraint;

  if (affectedBoneIds.length === 0 || mix === 0) return overrides;

  const targetBone = targetBoneId ? boneMap.get(targetBoneId) : undefined;
  const pointTarget =
    typeof constraint.targetX === "number" &&
    Number.isFinite(constraint.targetX) &&
    typeof constraint.targetY === "number" &&
    Number.isFinite(constraint.targetY)
      ? { x: constraint.targetX, y: constraint.targetY }
      : null;
  if (!targetBone && !pointTarget) return overrides;

  const targetX = pointTarget?.x ?? targetBone?.setup?.x ?? 0;
  const targetY = pointTarget?.y ?? targetBone?.setup?.y ?? 0;

  if (affectedBoneIds.length === 1) {
    const boneId = affectedBoneIds[0]!;
    const bone = boneMap.get(boneId);
    if (!bone) return overrides;

    const boneX = bone.setup?.x ?? 0;
    const boneY = bone.setup?.y ?? 0;
    const dx = targetX - boneX;
    const dy = targetY - boneY;
    const angle = Math.atan2(dy, dx) * (180 / Math.PI);

    const currentRotation = bone.setup?.rotation ?? 0;
    const delta = shortestAngle(angle - currentRotation);
    overrides.set(boneId, { rotation: currentRotation + delta * mix });
  } else if (affectedBoneIds.length >= 2) {
    const bone1Id = affectedBoneIds[0]!;
    const bone2Id = affectedBoneIds[1]!;
    const bone1 = boneMap.get(bone1Id);
    const bone2 = boneMap.get(bone2Id);
    if (!bone1 || !bone2) return overrides;

    const length1 = bone1.setup?.length ?? 50;
    const length2 = bone2.setup?.length ?? 50;

    const bone1X = bone1.setup?.x ?? 0;
    const bone1Y = bone1.setup?.y ?? 0;
    const dx = targetX - bone1X;
    const dy = targetY - bone1Y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    const maxReach = length1 + length2;
    const minReach = Math.abs(length1 - length2);
    const clampedDist = Math.max(minReach, Math.min(maxReach, dist));

    const cosAngle =
      (length1 * length1 + clampedDist * clampedDist - length2 * length2) /
      (2 * length1 * clampedDist);
    const angle1 = Math.acos(Math.max(-1, Math.min(1, cosAngle)));

    const dirAngle = Math.atan2(dy, dx);

    const sign = bendPositive ? 1 : -1;
    const bone1Rotation = (dirAngle - sign * angle1) * (180 / Math.PI);
    const currentRotation1 = bone1.setup?.rotation ?? 0;
    const solvedRotation1 =
      currentRotation1 + shortestAngle(bone1Rotation - currentRotation1) * mix;
    const solvedRotation1Rad = (solvedRotation1 * Math.PI) / 180;
    const elbowX = bone1X + Math.cos(solvedRotation1Rad) * length1;
    const elbowY = bone1Y + Math.sin(solvedRotation1Rad) * length1;

    overrides.set(bone1Id, { rotation: solvedRotation1 });

    const solvedTargetX = bone1X + Math.cos(dirAngle) * clampedDist;
    const solvedTargetY = bone1Y + Math.sin(dirAngle) * clampedDist;
    const bone2Rotation =
      Math.atan2(solvedTargetY - elbowY, solvedTargetX - elbowX) *
      (180 / Math.PI);
    const currentRotation2 = bone2.setup?.rotation ?? 0;

    overrides.set(bone2Id, {
      x:
        (bone2.setup?.x ?? elbowX) +
        (elbowX - (bone2.setup?.x ?? elbowX)) * mix,
      y:
        (bone2.setup?.y ?? elbowY) +
        (elbowY - (bone2.setup?.y ?? elbowY)) * mix,
      rotation:
        currentRotation2 +
        shortestAngle(bone2Rotation - currentRotation2) * mix,
    });
  }

  return overrides;
}

function shortestAngle(angle: number): number {
  let value = angle;
  while (value > 180) value -= 360;
  while (value < -180) value += 360;
  return value;
}
