/**
 * Pure linked-transform helpers.
 *
 * Mutate an Immer draft (or any plain object) in place. No React, no store,
 * no DOM. Used by bone/image drag flows in `useSkeletonDrag` and
 * `useGizmoDrag` to keep link ON / OFF semantics consistent.
 */
import type { Bone, BoneId, BoneSetup, Node, NodeId, PartNode, ProjectDocument, Transform } from '@kukla2d/contracts';

import {
  computeWorldMatrices,
  decomposeAffineMatrix,
  mat3Inverse,
  mat3Mul,
} from '@/domain/transforms.js';
import type { Matrix3 } from '@/domain/transforms.js';

import {
  isBoneLinkLocked,
  isNodeAssignedToBone,
} from './boneAssignment.js';


type RigProject = Pick<ProjectDocument, 'bones' | 'nodes'>;
interface TranslationOptions { excludeNodeId?: NodeId | null }
interface BoneLengthOptions { scaleLinkedNodes?: boolean }
interface LinkedTranslationInput { boneId?: BoneId | null; nodeId?: NodeId | null; dx: number; dy: number }
interface LinkedScaleOptions { pivotWorld?: { x: number; y: number } }

const MIN_BONE_LENGTH = 10;

function getBoneList(project: RigProject): Bone[] {
  return project?.bones ?? [];
}

function getNodeList(project: RigProject): Node[] {
  return project?.nodes ?? [];
}

function getBoneById(project: RigProject, boneId: BoneId): Bone | null {
  return getBoneList(project).find(b => b.id === boneId) ?? null;
}

function collectBoneBranchIds(bones: readonly Bone[], rootId: BoneId): Set<BoneId> {
  const children = new Map<BoneId, BoneId[]>();
  for (const bone of bones) {
    if (!bone.parentId) continue;
    const list = children.get(bone.parentId) ?? [];
    list.push(bone.id);
    children.set(bone.parentId, list);
  }
  const out = new Set<BoneId>([rootId]);
  const stack: BoneId[] = [rootId];
  while (stack.length) {
    const id = stack.pop()!;
    for (const childId of children.get(id) ?? []) {
      if (out.has(childId)) continue;
      out.add(childId);
      stack.push(childId);
    }
  }
  return out;
}

function ensureSetup(bone: Bone): BoneSetup {
  return bone.setup;
}

function ensureTransform(node: Node): Transform {
  return node.transform;
}

function resolveAssignedBone(project: RigProject, node: PartNode | null | undefined): Bone | null {
  if (!node) return null;
  if (node.boneId) {
    const direct = getBoneById(project, node.boneId);
    if (direct) return direct;
  }
  const meshBoneId = node.mesh?.jointBoneId;
  if (meshBoneId) {
    const byMesh = getBoneList(project).find(bone => bone.id === meshBoneId) ?? null;
    if (byMesh) return byMesh;
  }
  if (node.mesh?.influences) {
    for (const vertex of node.mesh.influences) {
      for (const inf of vertex) {
        if (inf?.boneId) {
          const byInf = getBoneById(project, inf.boneId);
          if (byInf) return byInf;
        }
      }
    }
  }
  return null;
}

function findNodeLinkedBoneInBranch(project: RigProject, node: PartNode, boneIds: ReadonlySet<BoneId>): Bone | null {
  const assigned = resolveAssignedBone(project, node);
  if (!assigned) return null;
  return boneIds.has(assigned.id) ? assigned : null;
}

function rotateNodeAroundWorldPivot(node: Node, pivotX: number, pivotY: number, deltaDegrees: number): void {
  const t = ensureTransform(node);
  // Project/Pixi position semantics: the rendered pivot is x+pivot, y+pivot.
  // Rotate that point, then convert it back to the stored x/y coordinates.
  const anchorX = (t.x ?? 0) + (t.pivotX ?? 0);
  const anchorY = (t.y ?? 0) + (t.pivotY ?? 0);
  const rad = (deltaDegrees * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const dx = anchorX - pivotX;
  const dy = anchorY - pivotY;
  t.x = pivotX + dx * cos - dy * sin - (t.pivotX ?? 0);
  t.y = pivotY + dx * sin + dy * cos - (t.pivotY ?? 0);
  t.rotation = (t.rotation ?? 0) + deltaDegrees;
}

/**
 * Translate a bone (and its branch descendants) in world space. When a node
 * is linked to any bone in the branch (link ON), the node follows.
 *
 * Mutates the project draft in place. Pass `excludeNodeId` to skip moving a
 * specific node - this is used by `translateLinkedNodeGroup` so the source
 * node is not moved twice (once explicitly, once via the bone branch).
 *
 * @param {Object} project
 * @param {string} boneId
 * @param {number} dx
 * @param {number} dy
 * @param {Object} [options]
 * @param {string|null} [options.excludeNodeId]
 */
export function translateLinkedBoneGroup(project: RigProject | null | undefined, boneId: BoneId, dx: number, dy: number, { excludeNodeId = null }: TranslationOptions = {}): void {
  if (!project || !boneId) return;
  if (!Number.isFinite(dx) || !Number.isFinite(dy)) return;
  const bones = getBoneList(project);
  const root = getBoneById(project, boneId);
  if (!root) return;
  const boneIds = collectBoneBranchIds(bones, root.id);
  for (const bone of bones) {
    if (!boneIds.has(bone.id)) continue;
    const setup = ensureSetup(bone);
    setup.x = (setup.x ?? 0) + dx;
    setup.y = (setup.y ?? 0) + dy;
  }
  for (const node of getNodeList(project)) {
    if (excludeNodeId && node.id === excludeNodeId) continue;
    if (node.type !== 'part') continue;
    if (!isBoneLinkLocked(node)) continue;
    if (!findNodeLinkedBoneInBranch(project, node, boneIds)) continue;
    const t = ensureTransform(node);
    t.x = (t.x ?? 0) + dx;
    t.y = (t.y ?? 0) + dy;
  }
}

/**
 * Translate every selected bone branch once. Overlapping parent/child
 * selections are de-duplicated, as are linked nodes.
 */
export function translateLinkedBoneSelection(project: RigProject | null | undefined, boneIds: readonly BoneId[], dx: number, dy: number): void {
  if (!project || boneIds.length === 0) return;
  if (!Number.isFinite(dx) || !Number.isFinite(dy)) return;
  const bones = getBoneList(project);
  const movedBoneIds = new Set<BoneId>();
  for (const boneId of boneIds) {
    if (!getBoneById(project, boneId)) continue;
    for (const branchId of collectBoneBranchIds(bones, boneId)) movedBoneIds.add(branchId);
  }
  for (const bone of bones) {
    if (!movedBoneIds.has(bone.id)) continue;
    const setup = ensureSetup(bone);
    setup.x = (setup.x ?? 0) + dx;
    setup.y = (setup.y ?? 0) + dy;
  }
  for (const node of getNodeList(project)) {
    if (node.type !== 'part' || !isBoneLinkLocked(node)) continue;
    if (!findNodeLinkedBoneInBranch(project, node, movedBoneIds)) continue;
    const t = ensureTransform(node);
    t.x = (t.x ?? 0) + dx;
    t.y = (t.y ?? 0) + dy;
  }
}

/**
 * Rotate a bone by `deltaDegrees` and rotate every linked node around the
 * bone pivot. Rotation is applied in degrees; the bone pivot is its
 * `setup.x / setup.y`. Linked nodes rotate around that pivot.
 *
 * Position coupling is intentionally limited to rotation only - there is no
 * well-defined model for image mesh skinning under bone rotation in this
 * stage, so the contract is "rotation tied, translation tied via node
 * transform rotation only" and that limitation is documented in REPORTS.
 *
 * @param {Object} project
 * @param {string} boneId
 * @param {number} deltaDegrees
 */
export function rotateLinkedBone(project: RigProject | null | undefined, boneId: BoneId, deltaDegrees: number): void {
  if (!project || !boneId) return;
  if (!Number.isFinite(deltaDegrees)) return;
  const bone = getBoneById(project, boneId);
  if (!bone) return;
  const setup = ensureSetup(bone);
  const pivotX = setup.x ?? 0;
  const pivotY = setup.y ?? 0;
  setup.rotation = (setup.rotation ?? 0) + deltaDegrees;
  for (const node of getNodeList(project)) {
    if (node.type !== 'part') continue;
    if (!isBoneLinkLocked(node)) continue;
    if (!isNodeAssignedToBone(node, bone)) continue;
    rotateNodeAroundWorldPivot(node, pivotX, pivotY, deltaDegrees);
  }
}

/**
 * Rotate selected bones and their linked nodes around the selection center.
 * Single selection keeps the established single-bone pivot semantics.
 */
export function rotateLinkedBoneSelection(project: RigProject | null | undefined, boneIds: readonly BoneId[], deltaDegrees: number): void {
  if (!project || !Number.isFinite(deltaDegrees)) return;
  const selected = getBoneList(project).filter(bone => boneIds.includes(bone.id));
  if (selected.length === 0) return;
  if (selected.length === 1) {
    rotateLinkedBone(project, selected[0]!.id, deltaDegrees);
    return;
  }
  const pivotX = selected.reduce((sum, bone) => sum + (bone.setup?.x ?? 0), 0) / selected.length;
  const pivotY = selected.reduce((sum, bone) => sum + (bone.setup?.y ?? 0), 0) / selected.length;
  const rad = (deltaDegrees * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const selectedIds = new Set(selected.map(bone => bone.id));
  for (const bone of selected) {
    const setup = ensureSetup(bone);
    const dx = (setup.x ?? 0) - pivotX;
    const dy = (setup.y ?? 0) - pivotY;
    setup.x = pivotX + dx * cos - dy * sin;
    setup.y = pivotY + dx * sin + dy * cos;
    setup.rotation = (setup.rotation ?? 0) + deltaDegrees;
  }
  for (const node of getNodeList(project)) {
    if (node.type !== 'part' || !isBoneLinkLocked(node)) continue;
    const assigned = resolveAssignedBone(project, node);
    if (!assigned || !selectedIds.has(assigned.id)) continue;
    rotateNodeAroundWorldPivot(node, pivotX, pivotY, deltaDegrees);
  }
}

/**
 * Set the length of a bone. Length is clamped to `MIN_BONE_LENGTH`. Linked
 * nodes assigned to this bone are scaled uniformly, matching proportional
 * image resize (Shift): both axes use the bone length ratio.
 *
 * @param {Object} project
 * @param {string} boneId
 * @param {number} nextLength
 */
export function setBoneLength(project: RigProject | null | undefined, boneId: BoneId, nextLength: number, { scaleLinkedNodes = true }: BoneLengthOptions = {}): void {
  if (!project || !boneId) return;
  if (!Number.isFinite(nextLength)) return;
  const bone = getBoneById(project, boneId);
  if (!bone) return;
  const setup = ensureSetup(bone);
  const oldLength = setup.length ?? 0;
  const clamped = Math.max(MIN_BONE_LENGTH, nextLength);
  setup.length = clamped;
  if (oldLength === clamped) return;
  if (!scaleLinkedNodes) return;
  const factor = oldLength > 0 ? clamped / oldLength : 1;
  const nodes = getNodeList(project);
  const linkedNodes = nodes.filter(node => (
    node.type === 'part'
    && isBoneLinkLocked(node)
    && isNodeAssignedToBone(node, bone)
  ));
  const worldMatrices = computeWorldMatrices(nodes);
  const pivotX = setup.x ?? 0;
  const pivotY = setup.y ?? 0;
  const scaleAroundBoneStart = new Float32Array([
    factor, 0, 0,
    0, factor, 0,
    pivotX * (1 - factor), pivotY * (1 - factor), 1,
  ]);
  const scaledWorldMatrices = new Map<string, Matrix3>();
  for (const node of linkedNodes) {
    const world = worldMatrices.get(node.id);
    if (world) scaledWorldMatrices.set(node.id, mat3Mul(scaleAroundBoneStart, world));
  }
  for (const node of linkedNodes) {
    const t = ensureTransform(node);
    const scaledWorld = scaledWorldMatrices.get(node.id);
    if (!scaledWorld) continue;
    const parentWorld = node.parent
      ? (scaledWorldMatrices.get(node.parent) ?? worldMatrices.get(node.parent))
      : null;
    const scaledLocal = parentWorld
      ? mat3Mul(mat3Inverse(parentWorld), scaledWorld)
      : scaledWorld;
    Object.assign(t, decomposeAffineMatrix(scaledLocal, t));
  }
}

export function scaleBoneSelectionLengths(project: RigProject | null | undefined, startLengths: Readonly<Record<string, number>>, factor: number): void {
  if (!project || !startLengths || !Number.isFinite(factor)) return;
  for (const [boneId, startLength] of Object.entries(startLengths)) {
    if (!Number.isFinite(startLength)) continue;
    const bone = getBoneList(project).find(candidate => candidate.id === boneId);
    if (bone) setBoneLength(project, bone.id, startLength * factor);
  }
}

/**
 * Translate a node and, when the node is linked to a bone (link ON), the
 * bone (and its branch) follows. This is the image-gizmo side of the
 * contract; the bone drag side uses `translateLinkedBoneGroup`.
 *
 * @param {Object} project
 * @param {string} nodeId
 * @param {number} dx
 * @param {number} dy
 */
export function translateLinkedNodeGroup(project: RigProject | null | undefined, nodeId: NodeId, dx: number, dy: number): void {
  if (!project || !nodeId) return;
  if (!Number.isFinite(dx) || !Number.isFinite(dy)) return;
  const node = getNodeList(project).find(n => n.id === nodeId);
  if (!node) return;
  if (node.type === 'part' && isBoneLinkLocked(node)) {
    const assigned = resolveAssignedBone(project, node);
    if (assigned) {
      translateLinkedBoneGroup(project, assigned.id, dx, dy, { excludeNodeId: nodeId });
    }
  }
  const t = ensureTransform(node);
  t.x = (t.x ?? 0) + dx;
  t.y = (t.y ?? 0) + dy;
}

/**
 * Rotate a linked node around its own pivot and apply the same rotation to
 * its bone. Other nodes linked to that bone follow the bone pivot.
 */
export function rotateLinkedNodeGroup(project: RigProject | null | undefined, nodeId: NodeId, deltaDegrees: number): void {
  if (!project || !nodeId || !Number.isFinite(deltaDegrees)) return;
  const node = getNodeList(project).find(n => n.id === nodeId);
  if (!node) return;
  const assigned = node.type === 'part' && isBoneLinkLocked(node)
    ? resolveAssignedBone(project, node)
    : null;
  if (!assigned) {
    const t = ensureTransform(node);
    t.rotation = (t.rotation ?? 0) + deltaDegrees;
    return;
  }

  const nodes = getNodeList(project);
  const linkedNodes = nodes.filter(linkedNode => (
    linkedNode.type === 'part'
    && isBoneLinkLocked(linkedNode)
    && isNodeAssignedToBone(linkedNode, assigned)
  ));
  const worldMatrices = computeWorldMatrices(nodes);
  const sourceWorld = worldMatrices.get(node.id);
  if (!sourceWorld) return;

  const sourceTransform = ensureTransform(node);
  const localPivotX = sourceTransform.pivotX ?? 0;
  const localPivotY = sourceTransform.pivotY ?? 0;
  const pivotX = sourceWorld[0] * localPivotX + sourceWorld[3] * localPivotY + sourceWorld[6];
  const pivotY = sourceWorld[1] * localPivotX + sourceWorld[4] * localPivotY + sourceWorld[7];
  const radians = (deltaDegrees * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const rotateAroundSourcePivot = new Float32Array([
    cos, sin, 0,
    -sin, cos, 0,
    pivotX - cos * pivotX + sin * pivotY,
    pivotY - sin * pivotX - cos * pivotY,
    1,
  ]);

  const rotatedWorldMatrices = new Map<string, Matrix3>();
  for (const linkedNode of linkedNodes) {
    const world = worldMatrices.get(linkedNode.id);
    if (world) {
      rotatedWorldMatrices.set(
        linkedNode.id,
        mat3Mul(rotateAroundSourcePivot, world),
      );
    }
  }
  for (const linkedNode of linkedNodes) {
    const rotatedWorld = rotatedWorldMatrices.get(linkedNode.id);
    if (!rotatedWorld) continue;
    const parentWorld = linkedNode.parent
      ? (rotatedWorldMatrices.get(linkedNode.parent) ?? worldMatrices.get(linkedNode.parent))
      : null;
    const rotatedLocal = parentWorld
      ? mat3Mul(mat3Inverse(parentWorld), rotatedWorld)
      : rotatedWorld;
    Object.assign(
      ensureTransform(linkedNode),
      decomposeAffineMatrix(rotatedLocal, linkedNode.transform),
    );
  }

  const setup = ensureSetup(assigned);
  const startX = setup.x ?? 0;
  const startY = setup.y ?? 0;
  const boneRadians = ((setup.rotation ?? 0) * Math.PI) / 180;
  const length = setup.length ?? MIN_BONE_LENGTH;
  const endX = startX + Math.cos(boneRadians) * length;
  const endY = startY + Math.sin(boneRadians) * length;
  const nextStartX = cos * startX - sin * startY + rotateAroundSourcePivot[6]!;
  const nextStartY = sin * startX + cos * startY + rotateAroundSourcePivot[7]!;
  const nextEndX = cos * endX - sin * endY + rotateAroundSourcePivot[6]!;
  const nextEndY = sin * endX + cos * endY + rotateAroundSourcePivot[7]!;
  setup.x = nextStartX;
  setup.y = nextStartY;
  setup.rotation = Math.atan2(nextEndY - nextStartY, nextEndX - nextStartX) * (180 / Math.PI);
  setup.length = Math.hypot(nextEndX - nextStartX, nextEndY - nextStartY);
}

/**
 * Scale a linked node group. Horizontal scale changes bone length; both axes
 * propagate to all images linked to that bone.
 */
export function scaleLinkedNodeGroup(project: RigProject | null | undefined, nodeId: NodeId, factorX: number, factorY: number, options: LinkedScaleOptions = {}): void {
  if (!project || !nodeId || !Number.isFinite(factorX) || !Number.isFinite(factorY)) return;
  if (factorX === 0 || factorY === 0) return;
  const node = getNodeList(project).find(n => n.id === nodeId);
  if (!node) return;
  const assigned = node.type === 'part' && isBoneLinkLocked(node)
    ? resolveAssignedBone(project, node)
    : null;
  if (!assigned) {
    const t = ensureTransform(node);
    t.scaleX = (t.scaleX ?? 1) * factorX;
    t.scaleY = (t.scaleY ?? 1) * factorY;
    return;
  }

  const nodes = getNodeList(project);
  const linkedNodes = nodes.filter(linkedNode => (
    linkedNode.type === 'part'
    && isBoneLinkLocked(linkedNode)
    && isNodeAssignedToBone(linkedNode, assigned)
  ));
  const worldMatrices = computeWorldMatrices(nodes);
  const sourceWorld = worldMatrices.get(node.id);
  if (!sourceWorld) return;

  const sourceTransform = ensureTransform(node);
  const localPivotX = sourceTransform.pivotX ?? 0;
  const localPivotY = sourceTransform.pivotY ?? 0;
  const sourcePivotX = sourceWorld[0] * localPivotX + sourceWorld[3] * localPivotY + sourceWorld[6];
  const sourcePivotY = sourceWorld[1] * localPivotX + sourceWorld[4] * localPivotY + sourceWorld[7];
  const pivotWorld = options.pivotWorld;
  const pivotX = Number.isFinite(pivotWorld?.x) ? pivotWorld!.x : sourcePivotX;
  const pivotY = Number.isFinite(pivotWorld?.y) ? pivotWorld!.y : sourcePivotY;
  const axisLength = Math.hypot(sourceWorld[0], sourceWorld[1]) || 1;
  const cos = sourceWorld[0] / axisLength;
  const sin = sourceWorld[1] / axisLength;
  const m0 = cos * cos * factorX + sin * sin * factorY;
  const m1 = cos * sin * (factorX - factorY);
  const m3 = m1;
  const m4 = sin * sin * factorX + cos * cos * factorY;
  const scaleAroundSourcePivot = new Float32Array([
    m0, m1, 0,
    m3, m4, 0,
    pivotX - m0 * pivotX - m3 * pivotY,
    pivotY - m1 * pivotX - m4 * pivotY,
    1,
  ]);

  const scaledWorldMatrices = new Map<string, Matrix3>();
  for (const linkedNode of linkedNodes) {
    const world = worldMatrices.get(linkedNode.id);
    if (world) {
      scaledWorldMatrices.set(
        linkedNode.id,
        mat3Mul(scaleAroundSourcePivot, world),
      );
    }
  }
  for (const linkedNode of linkedNodes) {
    const scaledWorld = scaledWorldMatrices.get(linkedNode.id);
    if (!scaledWorld) continue;
    const parentWorld = linkedNode.parent
      ? (scaledWorldMatrices.get(linkedNode.parent) ?? worldMatrices.get(linkedNode.parent))
      : null;
    const scaledLocal = parentWorld
      ? mat3Mul(mat3Inverse(parentWorld), scaledWorld)
      : scaledWorld;
    Object.assign(
      ensureTransform(linkedNode),
      decomposeAffineMatrix(scaledLocal, linkedNode.transform),
    );
  }

  const setup = ensureSetup(assigned);
  const startX = setup.x ?? 0;
  const startY = setup.y ?? 0;
  const rotation = ((setup.rotation ?? 0) * Math.PI) / 180;
  const length = setup.length ?? MIN_BONE_LENGTH;
  const endX = startX + Math.cos(rotation) * length;
  const endY = startY + Math.sin(rotation) * length;
  const nextStartX = m0 * startX + m3 * startY + scaleAroundSourcePivot[6]!;
  const nextStartY = m1 * startX + m4 * startY + scaleAroundSourcePivot[7]!;
  const nextEndX = m0 * endX + m3 * endY + scaleAroundSourcePivot[6]!;
  const nextEndY = m1 * endX + m4 * endY + scaleAroundSourcePivot[7]!;
  setup.x = nextStartX;
  setup.y = nextStartY;
  setup.rotation = Math.atan2(nextEndY - nextStartY, nextEndX - nextStartX) * (180 / Math.PI);
  setup.length = Math.max(
    MIN_BONE_LENGTH,
    Math.hypot(nextEndX - nextStartX, nextEndY - nextStartY),
  );
}

/**
 * Apply a (dx, dy) world delta to the bone transform model using the
 * `isBoneLinkLocked` rule. Returns the same project draft (caller can
 * ignore the return value).
 *
 * Exposed as a single entry point for the integration in `useGizmoDrag` /
 * `useSkeletonDrag` so the link rule lives in one place.
 *
 * @param {Object} project
 * @param {Object} args
 * @param {string|null} [args.boneId]
 * @param {string|null} [args.nodeId]
 * @param {number} args.dx
 * @param {number} args.dy
 */
export function applyLinkedTranslation(project: RigProject | null | undefined, args: LinkedTranslationInput | null | undefined): void {
  if (!args) return;
  const { boneId = null, nodeId = null, dx, dy } = args;
  if (boneId) return translateLinkedBoneGroup(project, boneId, dx, dy);
  if (nodeId) return translateLinkedNodeGroup(project, nodeId, dx, dy);
}
