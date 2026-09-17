import type {
  Bone,
  BoneId,
  Constraint,
  ConstraintId,
  ProjectDocument,
} from "@kukla2d/contracts";

import { getBoneSegment } from "@/features/canvas/domain/picking.js";

type IkConstraint = Constraint;
interface BoneTip {
  boneId: BoneId;
  x: number;
  y: number;
  distance: number;
}
interface IkConflict {
  boneId: BoneId;
  first: IkConstraint;
  second: IkConstraint;
}
type IkTopologyResult =
  | { ok: true; conflict: null; scopes: Map<ConstraintId, BoneId[]> }
  | { ok: false; conflict: IkConflict; scopes: Map<ConstraintId, BoneId[]> };

export function collectBoneDescendants(
  bones: readonly Bone[],
  rootBoneId: BoneId,
): BoneId[] {
  const result: BoneId[] = [];
  const visit = (boneId: BoneId): void => {
    if (result.includes(boneId)) return;
    result.push(boneId);
    for (const bone of bones ?? []) {
      if (bone.parentId === boneId) visit(bone.id);
    }
  };
  if ((bones ?? []).some((bone) => bone.id === rootBoneId)) visit(rootBoneId);
  return result;
}

export function findNearestBoneTip(
  bones: readonly Bone[],
  x: number,
  y: number,
  eligibleBoneIds: ReadonlySet<BoneId> | null = null,
): BoneTip | null {
  const boneMap = new Map<BoneId, Bone>(bones.map((bone) => [bone.id, bone]));
  let nearest: Omit<BoneTip, "distance"> | null = null;
  let distance = Infinity;
  for (const bone of bones ?? []) {
    if (eligibleBoneIds && !eligibleBoneIds.has(bone.id)) continue;
    const tip = getBoneSegment(bone, boneMap);
    const candidateDistance = Math.hypot(x - tip.x2, y - tip.y2);
    if (candidateDistance < distance) {
      nearest = { boneId: bone.id, x: tip.x2, y: tip.y2 };
      distance = candidateDistance;
    }
  }
  return nearest ? { ...nearest, distance } : null;
}

export function findConstraintConflict(
  constraints: readonly IkConstraint[],
  bones: readonly Bone[],
  boneId: BoneId,
  ignoreConstraintId: ConstraintId | null = null,
): IkConstraint | null {
  const candidateIds = new Set(collectBoneDescendants(bones, boneId));
  return (
    (constraints ?? []).find(
      (constraint) =>
        constraint.type === "ik" &&
        constraint.id !== ignoreConstraintId &&
        (constraint.affectedBoneIds ?? []).some((id) => candidateIds.has(id)),
    ) ?? null
  );
}

export function findNearestAvailableBoneTip(
  bones: readonly Bone[],
  constraints: readonly IkConstraint[],
  x: number,
  y: number,
  ignoreConstraintId: ConstraintId | null = null,
): BoneTip | null {
  const availableIds = new Set(
    (bones ?? [])
      .filter(
        (bone) =>
          !findConstraintConflict(
            constraints,
            bones,
            bone.id,
            ignoreConstraintId,
          ),
      )
      .map((bone) => bone.id),
  );
  return findNearestBoneTip(bones, x, y, availableIds);
}

export function assignConstraintToBone(
  constraint: IkConstraint | null | undefined,
  bones: readonly Bone[],
  boneId: BoneId,
): void {
  if (!constraint) return;
  constraint.assignedBoneId = boneId;
  constraint.affectedBoneIds = collectBoneDescendants(bones, boneId);
}

export function computeIkTopology(
  bones: readonly Bone[],
  constraints: readonly IkConstraint[],
): IkTopologyResult {
  const scopes = new Map<ConstraintId, BoneId[]>();
  const ownerByBoneId = new Map<BoneId, IkConstraint>();
  for (const constraint of constraints ?? []) {
    if (constraint.type !== "ik" || !constraint.assignedBoneId) continue;
    const affectedBoneIds = collectBoneDescendants(
      bones,
      constraint.assignedBoneId,
    );
    if (affectedBoneIds.length === 0) continue;
    for (const boneId of affectedBoneIds) {
      const owner = ownerByBoneId.get(boneId);
      if (owner && owner.id !== constraint.id) {
        return {
          ok: false,
          conflict: { boneId, first: owner, second: constraint },
          scopes,
        };
      }
      ownerByBoneId.set(boneId, constraint);
    }
    scopes.set(constraint.id, affectedBoneIds);
  }
  return { ok: true, conflict: null, scopes };
}

export function refreshIkTopology(project: ProjectDocument): IkTopologyResult {
  const result = computeIkTopology(
    project.bones ?? [],
    project.constraints ?? [],
  );
  if (!result.ok) return result;
  for (const constraint of project.constraints ?? []) {
    if (constraint.type !== "ik" || !constraint.assignedBoneId) continue;
    constraint.affectedBoneIds = result.scopes.get(constraint.id) ?? [];
  }
  return result;
}

export function trySetBoneParent(
  project: ProjectDocument,
  boneId: BoneId,
  parentId: BoneId | null,
):
  | IkTopologyResult
  | {
      ok: false;
      reason: string;
      conflict?: IkConflict;
      scopes?: Map<ConstraintId, BoneId[]>;
    } {
  const bone = project.bones?.find((item) => item.id === boneId);
  if (!bone) return { ok: false, reason: "Bone not found" };
  const boneMap = new Map((project.bones ?? []).map((item) => [item.id, item]));
  let cursor = parentId ? boneMap.get(parentId) : null;
  while (cursor) {
    if (cursor.id === boneId)
      return { ok: false, reason: "Bone hierarchy cannot contain a cycle" };
    cursor = cursor.parentId ? boneMap.get(cursor.parentId) : null;
  }
  const previousParentId = bone.parentId ?? null;
  bone.parentId = parentId ?? null;
  const result = refreshIkTopology(project);
  if (result.ok) return result;
  bone.parentId = previousParentId;
  refreshIkTopology(project);
  return {
    ...result,
    reason: `${result.conflict.first.name} and ${result.conflict.second.name} would control the same bone chain`,
  };
}

export function createIkConstraint({
  id,
  sequence,
  x,
  y,
  color,
}: {
  id: ConstraintId;
  sequence: number;
  x: number;
  y: number;
  color: number;
}): IkConstraint {
  return {
    id,
    type: "ik",
    name: `IK ${sequence}`,
    order: sequence - 1,
    enabled: true,
    affectedBoneIds: [],
    assignedBoneId: null,
    targetX: x,
    targetY: y,
    color,
    mix: 1,
    fkIk: 1,
    bendPositive: true,
  };
}
