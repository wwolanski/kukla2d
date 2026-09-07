import type { Bone, BoneId, ConstraintId } from "@kukla2d/contracts";

import type { BoneOverride } from "./ik.types.js";

interface PathPoint {
  x: number;
  y: number;
}

interface PathConstraint {
  id?: ConstraintId;
  type?: "path";
  affectedBoneIds?: readonly BoneId[];
  pathPoints?: readonly PathPoint[];
  position?: number;
  mix?: number;
}

export function solvePathConstraint(
  constraint: PathConstraint,
  boneMap: ReadonlyMap<BoneId, Bone>,
): Map<BoneId, BoneOverride> {
  const overrides = new Map<BoneId, BoneOverride>();
  const {
    affectedBoneIds = [],
    pathPoints = [],
    position = 0,
    mix = 1,
  } = constraint;
  if (pathPoints.length < 2 || affectedBoneIds.length === 0) return overrides;
  const totalLength = computePathLength(pathPoints);
  if (totalLength === 0) return overrides;
  const pathPosition = Math.max(0, Math.min(1, position / totalLength));
  const target = interpolatePath(pathPoints, pathPosition);
  if (!target) return overrides;

  for (const boneId of affectedBoneIds) {
    const bone = boneMap.get(boneId);
    if (!bone) continue;
    const originalX = bone.setup?.x ?? 0;
    const originalY = bone.setup?.y ?? 0;
    const originalRotation = bone.setup?.rotation ?? 0;
    overrides.set(boneId, {
      x: originalX + (target.x - originalX) * mix,
      y: originalY + (target.y - originalY) * mix,
      rotation: originalRotation + (target.rotation - originalRotation) * mix,
    });
  }
  return overrides;
}

function computePathLength(points: readonly PathPoint[]): number {
  let length = 0;
  for (let index = 1; index < points.length; index += 1) {
    const current = points[index];
    const previous = points[index - 1];
    if (!current || !previous) continue;
    length += Math.hypot(current.x - previous.x, current.y - previous.y);
  }
  return length;
}

function interpolatePath(
  points: readonly PathPoint[],
  position: number,
): { x: number; y: number; rotation: number } | null {
  const totalLength = computePathLength(points);
  const targetDistance = position * totalLength;
  let accumulated = 0;

  for (let index = 1; index < points.length; index += 1) {
    const current = points[index];
    const previous = points[index - 1];
    if (!current || !previous) continue;
    const deltaX = current.x - previous.x;
    const deltaY = current.y - previous.y;
    const segmentLength = Math.hypot(deltaX, deltaY);
    if (
      accumulated + segmentLength >= targetDistance ||
      index === points.length - 1
    ) {
      const localPosition =
        segmentLength > 0 ? (targetDistance - accumulated) / segmentLength : 0;
      return {
        x: previous.x + deltaX * localPosition,
        y: previous.y + deltaY * localPosition,
        rotation: Math.atan2(deltaY, deltaX) * (180 / Math.PI),
      };
    }
    accumulated += segmentLength;
  }
  return null;
}
