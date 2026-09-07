import type { Bone } from "@kukla2d/contracts";

interface Point {
  x: number;
  y: number;
}
interface PoseHandleFrame {
  boneId: Bone["id"];
  pivot: Point;
  rotation: number;
  boneLength: number;
  radius: number;
  minRadius: number;
  maxRadius: number;
  handle: Point;
  boneTip: Point;
}
interface PoseHandleInput {
  bone: Bone | null | undefined;
  extension?: number | null;
  minRadius?: number;
  maxRadius?: number;
}
interface PoseHandleDragInput {
  pivot: Point;
  pointer: Point;
  startRotation: number;
  startPointerAngle: number;
  minRadius: number;
  maxRadius?: number;
  snap?: boolean;
}

const MIN_HANDLE_RADIUS = 24;
const MAX_HANDLE_RADIUS = 2400;

export function normalizeAngleDegrees(angle: number): number {
  let value = angle;
  while (value > 180) value -= 360;
  while (value < -180) value += 360;
  return value;
}

export function buildPoseHandle({
  bone,
  extension = null,
  minRadius = MIN_HANDLE_RADIUS,
  maxRadius = MAX_HANDLE_RADIUS,
}: PoseHandleInput): PoseHandleFrame | null {
  if (!bone) return null;
  const pivot = {
    x: bone.setup?.x ?? 0,
    y: bone.setup?.y ?? 0,
  };
  const rotation = bone.setup?.rotation ?? 0;
  const boneLength = Math.max(minRadius, bone.setup?.length ?? 80);
  const radius = Math.min(
    maxRadius,
    Math.max(boneLength, extension ?? boneLength),
  );
  const radians = (rotation * Math.PI) / 180;
  return {
    boneId: bone.id,
    pivot,
    rotation,
    boneLength,
    radius,
    minRadius: boneLength,
    maxRadius,
    handle: {
      x: pivot.x + Math.cos(radians) * radius,
      y: pivot.y + Math.sin(radians) * radius,
    },
    boneTip: {
      x: pivot.x + Math.cos(radians) * (bone.setup?.length ?? 80),
      y: pivot.y + Math.sin(radians) * (bone.setup?.length ?? 80),
    },
  };
}

export function updatePoseHandleDrag({
  pivot,
  pointer,
  startRotation,
  startPointerAngle,
  minRadius,
  maxRadius = MAX_HANDLE_RADIUS,
  snap = false,
}: PoseHandleDragInput): { rotation: number; radius: number } {
  const dx = pointer.x - pivot.x;
  const dy = pointer.y - pivot.y;
  const pointerAngle = Math.atan2(dy, dx);
  let delta = normalizeAngleDegrees(
    ((pointerAngle - startPointerAngle) * 180) / Math.PI,
  );
  if (snap) delta = Math.round(delta / 15) * 15;
  return {
    rotation: startRotation + delta,
    radius: Math.min(maxRadius, Math.max(minRadius, Math.hypot(dx, dy))),
  };
}

export function buildRotatedBoneBranch(
  bones: readonly Bone[],
  rootBoneId: string,
  deltaDegrees: number,
): Map<string, Partial<Bone["setup"]>> {
  const root = (bones ?? []).find((bone) => bone.id === rootBoneId);
  if (!root || !Number.isFinite(deltaDegrees)) return new Map();
  const branchIds = new Set<string>();
  const visit = (boneId: string): void => {
    branchIds.add(boneId);
    for (const bone of bones) {
      if (bone.parentId === boneId && !branchIds.has(bone.id)) visit(bone.id);
    }
  };
  visit(rootBoneId);

  const pivotX = root.setup?.x ?? 0;
  const pivotY = root.setup?.y ?? 0;
  const radians = (deltaDegrees * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const overrides = new Map<string, Partial<Bone["setup"]>>();
  for (const bone of bones) {
    if (!branchIds.has(bone.id)) continue;
    const x = bone.setup?.x ?? 0;
    const y = bone.setup?.y ?? 0;
    const partial: Partial<Bone["setup"]> = {
      rotation: (bone.setup?.rotation ?? 0) + deltaDegrees,
    };
    if (bone.id !== rootBoneId) {
      const dx = x - pivotX;
      const dy = y - pivotY;
      partial.x = pivotX + dx * cos - dy * sin;
      partial.y = pivotY + dx * sin + dy * cos;
    }
    overrides.set(bone.id, partial);
  }
  return overrides;
}
