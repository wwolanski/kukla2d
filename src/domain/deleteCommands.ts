import type {
  Bone,
  Mesh,
  Node,
  PartNode,
  ProjectDocument,
} from "@kukla2d/contracts";

import { findModifiersAffectedByProjectChange } from "@/domain/autoMotion/guardrails.js";

import type { AnimationCommandResult } from "./animationCommandTypes.types.js";
import type { DeleteSelectionIntent } from "./deleteCommands.types.js";

interface DeleteSelection {
  nodeIds?: readonly string[];
  boneIds?: readonly string[];
  constraintIds?: readonly string[];
}

type MutableProjectDocument = ProjectDocument & {
  versionControl?: { transformVersion?: number; geometryVersion?: number };
};

interface LegacyMesh extends Mesh {
  geometry?: {
    boneWeights?: { boneId: string; weight: number }[][];
  };
}

function isPartNode(node: Node): node is PartNode {
  return node.type === "part";
}

export function buildDeleteSelectionIntent(
  project: ProjectDocument,
  selection: DeleteSelection = {},
): DeleteSelectionIntent {
  const rawNodeIds = selection.nodeIds ?? [];
  const rawBoneIds = selection.boneIds ?? [];
  const rawConstraintIds = selection.constraintIds ?? [];

  const existingNodes = (project.nodes ?? []).filter((n) =>
    rawNodeIds.includes(n.id),
  );
  const existingBones = (project.bones ?? []).filter((b) =>
    rawBoneIds.includes(b.id),
  );
  const existingConstraints = (project.constraints ?? []).filter((c) =>
    rawConstraintIds.includes(c.id),
  );

  const nodeIds = [...new Set(existingNodes.map((n) => n.id))];
  const boneIds = [...new Set(existingBones.map((b) => b.id))];
  const constraintIds = [...new Set(existingConstraints.map((c) => c.id))];

  const expandedNodeIds = expandNodeDescendants(project, nodeIds);

  const parts: string[] = [];
  const groups: string[] = [];
  for (const id of expandedNodeIds) {
    const node = project.nodes.find((n) => n.id === id);
    if (node?.type === "part") parts.push(id);
    else if (node) groups.push(id);
  }

  const totalItems =
    expandedNodeIds.length + boneIds.length + constraintIds.length;
  const segments: string[] = [];
  if (expandedNodeIds.length > 0)
    segments.push(
      `${expandedNodeIds.length} layer${expandedNodeIds.length !== 1 ? "s" : ""}`,
    );
  if (boneIds.length > 0)
    segments.push(`${boneIds.length} bone${boneIds.length !== 1 ? "s" : ""}`);
  if (constraintIds.length > 0)
    segments.push(
      `${constraintIds.length} IK constraint${constraintIds.length !== 1 ? "s" : ""}`,
    );

  return {
    nodeIds: expandedNodeIds,
    boneIds: boneIds,
    constraintIds,
    parts,
    groups,
    counts: {
      nodes: expandedNodeIds.length,
      bones: boneIds.length,
      constraints: constraintIds.length,
      parts: parts.length,
      groups: groups.length,
    },
    label: segments.join(", ") || "Nothing to delete",
    isEmpty: totalItems === 0,
    hasMixedTargets:
      (expandedNodeIds.length > 0 ? 1 : 0) +
        (boneIds.length > 0 ? 1 : 0) +
        (constraintIds.length > 0 ? 1 : 0) >
      1,
  };
}

function expandNodeDescendants(
  project: ProjectDocument,
  rootIds: readonly string[],
): string[] {
  const result = new Set<string>();
  const nodesById = new Map<string, Node>(
    project.nodes.map((node) => [node.id, node]),
  );
  const childrenOf = new Map<string, string[]>();
  for (const node of project.nodes) {
    if (node.parent == null) continue;
    if (!childrenOf.has(node.parent)) childrenOf.set(node.parent, []);
    childrenOf.get(node.parent)!.push(node.id);
  }
  const stack = [...rootIds];
  while (stack.length) {
    const id = stack.pop()!;
    if (result.has(id)) continue;
    if (!nodesById.has(id)) continue;
    result.add(id);
    const children = childrenOf.get(id) ?? [];
    for (const childId of children) stack.push(childId);
  }
  return [...result];
}

export function deletePartNodes(
  project: MutableProjectDocument,
  nodeIds: readonly string[],
): AnimationCommandResult {
  const expandedIds = new Set(expandNodeDescendants(project, nodeIds));
  if (expandedIds.size === 0) return { changed: false, affectedIds: [] };

  project.nodes = (project.nodes ?? []).filter((n) => !expandedIds.has(n.id));

  for (const bone of project.bones ?? []) {
    if (bone.nodeId && expandedIds.has(bone.nodeId)) bone.nodeId = null;
  }

  for (const node of project.nodes.filter(isPartNode)) {
    if (node.clipToPartId && expandedIds.has(node.clipToPartId)) {
      delete node.clipToPartId;
    }
  }

  for (const animation of project.animations ?? []) {
    animation.tracks = (animation.tracks ?? []).filter(
      (t) => !expandedIds.has(t.targetId),
    );
  }

  const impact = findModifiersAffectedByProjectChange(project, {
    deletedNodes: expandedIds,
  });
  for (const modId of impact.modifierIds) {
    const mod = (project.animationModifiers ?? []).find((m) => m.id === modId);
    if (mod) mod.enabled = false;
  }

  const remainingParts = (project.nodes ?? [])
    .filter((n) => n.type === "part")
    .sort((a, b) => a.draw_order - b.draw_order);
  remainingParts.forEach((p, i) => {
    p.draw_order = i;
  });

  if (project.versionControl) {
    project.versionControl.transformVersion =
      (project.versionControl.transformVersion ?? 0) + 1;
    project.versionControl.geometryVersion =
      (project.versionControl.geometryVersion ?? 0) + 1;
  }

  return { changed: true, affectedIds: [...expandedIds] };
}

export function deleteBones(
  project: MutableProjectDocument,
  boneIds: readonly string[],
): AnimationCommandResult {
  const selectedIds = new Set<string>(boneIds);
  const existingBones = (project.bones ?? []).filter((b) =>
    selectedIds.has(b.id),
  );
  if (existingBones.length === 0) return { changed: false, affectedIds: [] };

  const bones = project.bones ?? [];
  const deletedParentMap = new Map<string, string | null>();
  for (const bone of existingBones) {
    deletedParentMap.set(bone.id, bone.parentId ?? null);
  }

  const nearestSurvivingParent = (parentId: string | null): string | null => {
    const visited = new Set<string>();
    let candidate: string | null = parentId;
    while (candidate && selectedIds.has(candidate) && !visited.has(candidate)) {
      visited.add(candidate);
      candidate = deletedParentMap.get(candidate) ?? null;
    }
    return candidate ?? null;
  };

  for (const bone of bones) {
    if (selectedIds.has(bone.id)) continue;
    if (bone.parentId && selectedIds.has(bone.parentId)) {
      bone.parentId = nearestSurvivingParent(bone.parentId) as Bone["parentId"];
    }
  }

  project.bones = bones.filter((b) => !selectedIds.has(b.id));

  const removedConstraintIds = new Set<string>();
  project.constraints = (project.constraints ?? []).filter((c) => {
    if (c.assignedBoneId && selectedIds.has(c.assignedBoneId)) {
      removedConstraintIds.add(c.id);
      return false;
    }
    if (c.targetBoneId && selectedIds.has(c.targetBoneId)) {
      removedConstraintIds.add(c.id);
      return false;
    }
    if (c.poleBoneId && selectedIds.has(c.poleBoneId)) {
      removedConstraintIds.add(c.id);
      return false;
    }
    c.affectedBoneIds = (c.affectedBoneIds ?? []).filter(
      (id) => !selectedIds.has(id),
    );
    return true;
  });

  const allRemovedIds = new Set<string>([
    ...selectedIds,
    ...removedConstraintIds,
  ]);
  for (const animation of project.animations ?? []) {
    animation.tracks = (animation.tracks ?? []).filter(
      (t) => !allRemovedIds.has(t.targetId),
    );
  }

  if (project.defaultPose) {
    for (const id of selectedIds) {
      delete project.defaultPose[id];
    }
  }

  project.slots = (project.slots ?? []).filter(
    (slot) => !selectedIds.has(slot.boneId),
  );

  for (const node of project.nodes.filter(isPartNode)) {
    if (node.meshInfluenceBoneIds) {
      node.meshInfluenceBoneIds = node.meshInfluenceBoneIds.filter(
        (id) => !selectedIds.has(id),
      );
    }
    if (node.boneId && selectedIds.has(node.boneId)) {
      node.boneId = null;
    }
    if (node.mesh?.jointBoneId && selectedIds.has(node.mesh.jointBoneId)) {
      node.mesh.jointBoneId = null;
    }
    const legacyMesh = node.mesh as LegacyMesh | null | undefined;
    if (legacyMesh?.geometry?.boneWeights) {
      legacyMesh.geometry.boneWeights = legacyMesh.geometry.boneWeights.map(
        (vertexInfs) =>
          vertexInfs.filter((inf) => !selectedIds.has(inf.boneId)),
      );
    }
    if (node.mesh?.influences) {
      node.mesh.influences = node.mesh.influences.map((vertexInfs) =>
        vertexInfs.filter((inf) => !selectedIds.has(inf.boneId)),
      );
    }
  }

  const impact = findModifiersAffectedByProjectChange(project, {
    deletedNodes: selectedIds,
    deletedBones: selectedIds,
  });
  for (const modId of impact.modifierIds) {
    const mod = (project.animationModifiers ?? []).find((m) => m.id === modId);
    if (mod) mod.enabled = false;
  }

  if (project.versionControl) {
    project.versionControl.transformVersion =
      (project.versionControl.transformVersion ?? 0) + 1;
    project.versionControl.geometryVersion =
      (project.versionControl.geometryVersion ?? 0) + 1;
  }

  return { changed: true, affectedIds: [...allRemovedIds] };
}

export function deleteConstraints(
  project: MutableProjectDocument,
  constraintIds: readonly string[],
): AnimationCommandResult {
  const ids = new Set<string>(constraintIds);
  const existing = (project.constraints ?? []).filter((c) => ids.has(c.id));
  if (existing.length === 0) return { changed: false, affectedIds: [] };

  project.constraints = (project.constraints ?? []).filter(
    (c) => !ids.has(c.id),
  );

  for (const animation of project.animations ?? []) {
    animation.tracks = (animation.tracks ?? []).filter(
      (t) => !ids.has(t.targetId),
    );
  }

  if (project.versionControl) {
    project.versionControl.transformVersion =
      (project.versionControl.transformVersion ?? 0) + 1;
  }

  return { changed: true, affectedIds: existing.map((c) => c.id) };
}
