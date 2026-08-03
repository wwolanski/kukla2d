import type { Bone, BoneId, Mesh, Node, NodeId, ProjectDocument } from '@kukla2d/contracts';

interface AssignableNode {
  id: string;
  boneId?: BoneId | null;
  boneLinkLocked?: boolean;
  meshInfluenceBoneIds?: string[];
  mesh?: Mesh | null;
}
type RigProject = Pick<ProjectDocument, 'nodes' | 'bones'>;
export type BoneAssignmentAction =
  | { changed: false }
  | { changed: true; action: 'owner' | 'influence'; ownerBoneId: BoneId };

export function isNodeAssignedToBone(node: AssignableNode | null | undefined, bone: Bone | null | undefined): boolean {
  if (!node || !bone) return false;
  if (node.boneId === bone.id) return true;
  // Optional legacy references must be present before comparing them. Without
  // these guards, `undefined === undefined` made every mesh-less part match
  // every modern bone that did not have a legacy nodeId.
  if (bone.nodeId != null && node.id === bone.nodeId) return true;
  const jointBoneId = node.mesh?.jointBoneId;
  if (jointBoneId != null && (
    jointBoneId === bone.id
    || (bone.nodeId != null && jointBoneId === bone.nodeId)
  )) return true;
  return node.mesh?.influences?.some(vertex => vertex.some(inf => inf.boneId === bone.id)) ?? false;
}

/**
 * Structural ownership only. Mesh influences describe skin deformation and
 * must never make a layer a child of every bone that affects its vertices.
 */
export function isNodeDirectlyAssignedToBone(node: AssignableNode | null | undefined, bone: Bone | null | undefined): boolean {
  if (!node || !bone) return false;
  if (node.boneId) return node.boneId === bone.id;
  if (bone.nodeId != null && node.id === bone.nodeId) return true;
  const jointBoneId = node.mesh?.jointBoneId;
  return jointBoneId != null && (
    jointBoneId === bone.id
    || (bone.nodeId != null && jointBoneId === bone.nodeId)
  );
}

export function doesBoneInfluenceNode(node: AssignableNode | null | undefined, boneId: BoneId | null | undefined): boolean {
  if (!node?.mesh || !boneId) return false;
  return node.mesh.influences?.some(
    vertex => vertex?.some(influence => influence?.boneId === boneId && influence.weight > 0),
  ) ?? false;
}

function uniqueBoneIds(ids: readonly (string | null | undefined)[] | null | undefined): string[] {
  return [...new Set((ids ?? []).filter((id): id is string => id != null))];
}

/**
 * Explicit deformation palette used by Auto Weights. Older projects did not
 * store it, so expose their current weighted/owned bones as a visible fallback.
 */
export function getNodeMeshInfluenceBoneIds(node: AssignableNode | null | undefined): string[] {
  if (!node) return [];
  if (Array.isArray(node.meshInfluenceBoneIds)) {
    return uniqueBoneIds(node.meshInfluenceBoneIds);
  }
  const weighted = node.mesh?.influences?.flatMap(vertex =>
    (vertex ?? []).filter(influence => influence?.weight > 0).map(influence => influence.boneId)
  ) ?? [];
  return uniqueBoneIds([
    ...weighted,
    node.boneId,
    node.mesh?.jointBoneId,
  ]);
}

export function setNodeMeshInfluenceBone(node: AssignableNode | null | undefined, boneId: BoneId | null | undefined, included: boolean): void {
  if (!node || !boneId) return;
  const current = getNodeMeshInfluenceBoneIds(node);
  node.meshInfluenceBoneIds = included
    ? uniqueBoneIds([...current, boneId])
    : current.filter(id => id !== boneId);
}

/**
 * Canonical structural assignment. Existing soft-skin weights are preserved.
 * A mesh without weights gets an initial rigid 100% binding to its owner.
 *
 * Link state defaults to OFF (explicit false) — user must toggle ON to follow.
 */
export function assignNodeToBone(node: AssignableNode | null | undefined, boneId: BoneId | null | undefined): void {
  if (!node || !boneId) return;
  node.boneId = boneId;
  node.boneLinkLocked = false;
  setNodeMeshInfluenceBone(node, boneId, true);
  if (!node.mesh?.vertices?.length) return;
  const count = node.mesh.vertices.length;
  node.mesh.jointBoneId = boneId;
  const hasWeights = node.mesh.influences?.some(vertex =>
    vertex?.some(influence => influence?.boneId && influence.weight > 0)
  );
  if (!hasWeights) {
    node.mesh.influences = Array.from({ length: count }, () => [{ boneId, weight: 1 }]);
    node.mesh.boneWeights = Array.from({ length: count }, () => 1);
  }
}

/**
 * Canonical structural clear. Soft-skin weights and explicit influence palette
 * survive; those have separate visible controls in the weights inspector.
 */
export function clearNodeBoneAssignment(node: AssignableNode | null | undefined): void {
  if (!node) return;
  node.boneId = null;
  delete node.boneLinkLocked;
  if (!node.mesh) return;
  node.mesh.jointBoneId = null;
}

/** Keeps both modern node ownership and legacy `bone.nodeId` references coherent. */
export function assignProjectNodeToBone(project: RigProject | null | undefined, nodeId: NodeId | null | undefined, boneId: BoneId | null | undefined): void {
  if (!project || !nodeId || !boneId) return;
  const node = (project.nodes ?? []).find(candidate => candidate.id === nodeId);
  if (!node) return;
  for (const bone of project.bones ?? []) {
    if (bone.id !== boneId && bone.nodeId === nodeId) bone.nodeId = null;
  }
  assignNodeToBone(node, boneId);
}

/**
 * Auto-assign intent from drawing a bone over artwork. First bone becomes the
 * structural owner. Later bones join the explicit deformation palette without
 * replacing ownership or rewriting vertex weights.
 */
export function assignOrAddProjectNodeBoneInfluence(project: RigProject | null | undefined, nodeId: NodeId | null | undefined, boneId: BoneId | null | undefined): BoneAssignmentAction {
  if (!project || !nodeId || !boneId) return { changed: false };
  const node = (project.nodes ?? []).find(candidate => candidate.id === nodeId);
  if (!node) return { changed: false };
  const legacyOwner = (project.bones ?? []).find(bone => bone.nodeId === nodeId)?.id ?? null;
  const assignableNode: AssignableNode = node;
  const ownerBoneId = assignableNode.boneId ?? legacyOwner;
  if (ownerBoneId && ownerBoneId !== boneId) {
    setNodeMeshInfluenceBone(assignableNode, boneId, true);
    return { changed: true, action: 'influence', ownerBoneId };
  }
  assignProjectNodeToBone(project, nodeId, boneId);
  return { changed: true, action: 'owner', ownerBoneId: boneId };
}

/** Clears structural assignment, transform link, and legacy reverse references. */
export function clearProjectNodeBoneAssignment(project: RigProject | null | undefined, nodeId: NodeId | null | undefined): void {
  if (!project || !nodeId) return;
  const node = (project.nodes ?? []).find(candidate => candidate.id === nodeId);
  clearNodeBoneAssignment(node);
  for (const bone of project.bones ?? []) {
    if (bone.nodeId === nodeId) bone.nodeId = null;
  }
}

/**
 * `true` when the node has an active transform link to its assigned bone.
 * `node.boneLinkLocked !== false` is ON; missing field is backward-compatible
 * ON; explicit `false` is the only OFF.
 */
export function isBoneLinkLocked(node: AssignableNode | null | undefined): boolean {
  if (!node) return false;
  return node.boneLinkLocked !== false;
}

/**
 * Set or clear the link lock. `true` removes any explicit OFF so the field is
 * absent (still ON by default); `false` writes the explicit OFF flag.
 */
export function setBoneLinkLocked(node: AssignableNode | null | undefined, locked: boolean): void {
  if (!node) return;
  if (locked === false) {
    node.boneLinkLocked = false;
    return;
  }
  delete node.boneLinkLocked;
}

/**
 * Linked-transform helpers - used by drag flows in later stages to know
 * which nodes should follow a bone move. These stay pure: no React, no
 * store, no DOM.
 */

export function getAssignedBoneForNode(project: RigProject | null | undefined, nodeId: NodeId | null | undefined): Bone | null {
  if (!project || !nodeId) return null;
  const node = (project.nodes ?? []).find(n => n.id === nodeId);
  if (!node) return null;
  const bones = project.bones ?? [];
  return bones.find(b => isNodeAssignedToBone(node, b)) ?? null;
}

export function isLinkedNodeAssignedToBone(node: AssignableNode | null | undefined, bone: Bone | null | undefined): boolean {
  return isNodeAssignedToBone(node, bone) && isBoneLinkLocked(node);
}

export function getLinkedNodesForBone(project: RigProject | null | undefined, boneId: BoneId | null | undefined): Node[] {
  if (!project || !boneId) return [];
  const bone = (project.bones ?? []).find(b => b.id === boneId);
  if (!bone) return [];
  return (project.nodes ?? []).filter(node => isLinkedNodeAssignedToBone(node, bone));
}
