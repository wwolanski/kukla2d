import type {
  Bone,
  BoneId,
  Constraint,
  Node,
  PartNode,
} from "@kukla2d/contracts";

import {
  doesBoneInfluenceNode,
  isNodeDirectlyAssignedToBone,
} from "@/features/rigging";

import type { BoneTreeRow } from "./buildBoneTreeRows.types.js";

interface BoneTreeInput {
  bones?: readonly Bone[];
  nodes?: readonly Node[];
  constraints?: readonly Constraint[];
  expanded?: ReadonlySet<string>;
  showImages?: boolean;
}

export function isBoneDescendant(
  bones: readonly Bone[] | null | undefined,
  rootId: string | null | undefined,
  targetId: string | null | undefined,
): boolean {
  if (!rootId || !targetId) return false;

  const list = bones ?? [];
  const visited = new Set<string>();
  const stack: string[] = [rootId];

  while (stack.length) {
    const id = stack.pop();
    if (id === undefined) continue;
    if (visited.has(id)) continue;
    visited.add(id);

    for (const bone of list) {
      if (bone.parentId !== id) continue;
      if (bone.id === targetId) return true;
      if (!visited.has(bone.id)) stack.push(bone.id);
    }
  }

  return false;
}

function isPartNode(node: Node): node is PartNode {
  return node.type === "part";
}

export function buildBoneTreeRows({
  bones = [],
  nodes = [],
  constraints = [],
  expanded = new Set(),
  showImages = true,
}: BoneTreeInput = {}): BoneTreeRow[] {
  const boneIds = new Set<string>(bones.map((bone) => bone.id));
  const boneById = new Map<string, Bone>(bones.map((bone) => [bone.id, bone]));
  const childMap = new Map<string, Bone[]>();

  for (const bone of bones) {
    const key =
      bone.parentId && boneIds.has(bone.parentId) ? bone.parentId : "__root__";
    const list = childMap.get(key) ?? [];
    list.push(bone);
    childMap.set(key, list);
  }

  for (const list of childMap.values())
    list.sort((a, b) => a.name.localeCompare(b.name));

  const assignedByBone = new Map<string, PartNode[]>();
  const influencedByBone = new Map<string, PartNode[]>();
  const assignedNodeIds = new Set<string>();

  for (const bone of bones) {
    const assigned = nodes
      .filter(
        (node): node is PartNode =>
          isPartNode(node) &&
          !assignedNodeIds.has(node.id) &&
          isNodeDirectlyAssignedToBone(node, bone),
      )
      .sort((a, b) => b.draw_order - a.draw_order);
    const influenced = nodes
      .filter(
        (node): node is PartNode =>
          isPartNode(node) && doesBoneInfluenceNode(node, bone.id),
      )
      .sort((a, b) => b.draw_order - a.draw_order);
    assignedByBone.set(bone.id, assigned);
    influencedByBone.set(bone.id, influenced);
    assigned.forEach((node) => assignedNodeIds.add(node.id));
  }

  const rows: BoneTreeRow[] = [{ kind: "root", key: "root", depth: 0 }];
  const visited = new Set<string>();

  const walk = (
    parentId: string,
    depth: number,
    familyId: BoneId | null = null,
  ): void => {
    for (const bone of childMap.get(parentId) ?? []) {
      if (visited.has(bone.id)) continue;
      visited.add(bone.id);
      const rowFamilyId = familyId ?? bone.id;

      const childBones = childMap.get(bone.id) ?? [];
      const assigned = assignedByBone.get(bone.id) ?? [];
      const influenced = influencedByBone.get(bone.id) ?? [];
      const visibleAssigned = showImages ? assigned : [];
      const visibleInfluenced = showImages ? influenced : [];
      const expandKey = `bone:${bone.id}`;

      rows.push({
        kind: "bone",
        key: expandKey,
        bone,
        familyId: rowFamilyId,
        parentName: bone.parentId
          ? (boneById.get(bone.parentId)?.name ?? bone.parentId)
          : null,
        depth,
        hasChildren:
          childBones.length > 0 || assigned.length > 0 || influenced.length > 0,
        assignedCount: assigned.length,
        influencedCount: influenced.length,
        ikConstraints: constraints.filter(
          (constraint) =>
            constraint.type === "ik" &&
            constraint.affectedBoneIds?.includes(bone.id),
        ),
      });

      if (expanded.has(expandKey)) {
        visibleAssigned.forEach((node) =>
          rows.push({
            kind: "node",
            key: `node:${node.id}`,
            node,
            depth: depth + 1,
            boneId: bone.id,
            boneName: bone.name,
            familyId: rowFamilyId,
          }),
        );
        visibleInfluenced.forEach((node) =>
          rows.push({
            kind: "meshInfluence",
            key: `influence:${bone.id}:${node.id}`,
            node,
            depth: depth + 1,
            boneId: bone.id,
            boneName: bone.name,
            familyId: rowFamilyId,
          }),
        );
        walk(bone.id, depth + 1, rowFamilyId);
      }
    }
  };

  walk("__root__", 0);

  if (!showImages) return rows;

  rows.push({ kind: "unassigned", key: "unassigned", depth: 0 });

  nodes
    .filter(
      (node): node is PartNode =>
        isPartNode(node) && !assignedNodeIds.has(node.id),
    )
    .sort((a, b) => b.draw_order - a.draw_order)
    .forEach((node) =>
      rows.push({
        kind: "node",
        key: `node:${node.id}`,
        node,
        depth: 1,
        boneId: null,
      }),
    );

  return rows;
}
