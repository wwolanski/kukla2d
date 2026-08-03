import type { Bone } from '@kukla2d/contracts';

export const IK_TARGET_DEFAULT_RADIUS = 9;
export const IK_TARGET_MIN_RADIUS = 4;
export const IK_TARGET_MAX_RADIUS = 16;
export const IK_TARGET_REFERENCE_BONE_LENGTH = 80;

export function clampIkTargetRadius(radius: number): number {
  return Math.min(IK_TARGET_MAX_RADIUS, Math.max(IK_TARGET_MIN_RADIUS, radius));
}

export function getIkTargetRadius(bone: Pick<Bone, 'setup'> | null | undefined): number {
  if (!bone) return IK_TARGET_DEFAULT_RADIUS;

  const length = typeof bone.setup?.length === 'number' && Number.isFinite(bone.setup.length)
    ? Math.abs(bone.setup.length)
    : IK_TARGET_REFERENCE_BONE_LENGTH;
  const scaleX = typeof bone.setup?.scaleX === 'number' && Number.isFinite(bone.setup.scaleX)
    ? Math.abs(bone.setup.scaleX)
    : 1;
  const radius = IK_TARGET_DEFAULT_RADIUS * length * scaleX / IK_TARGET_REFERENCE_BONE_LENGTH;
  return clampIkTargetRadius(radius);
}
