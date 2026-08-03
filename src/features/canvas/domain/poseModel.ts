import type {
  Bone,
  BoneSetup,
  Node,
  PartNode,
  ProjectDocument,
  Transform,
  Vertex,
} from '@kukla2d/contracts';

import type { PoseOverrides } from '@/domain/animationEngine';
import {
  computeWorldMatrices,
  decomposeAffineMatrix,
  makeLocalMatrix,
  mat3Inverse,
  mat3Mul,
} from '@/domain/transforms';
import type { Matrix3 } from '@/domain/transforms';

const TRANSFORM_KEYS = ['x', 'y', 'rotation', 'scaleX', 'scaleY', 'length'] as const;
const HIERARCHY_KEYS = ['x', 'y', 'rotation', 'scaleX', 'scaleY'] as const;
type PoseOverride = Record<string, unknown>;
type VertexInput = readonly Vertex[] | readonly number[];

export function poseRecordToMap(
  record: ProjectDocument['defaultPose'] | null | undefined,
): PoseOverrides | null {
  if (!record || typeof record !== 'object') return null;
  const entries = Object.entries(record);
  return entries.length ? new Map(entries) : null;
}

export function mergePoseLayers(
  base: PoseOverrides | null,
  overlay: PoseOverrides | null | undefined,
): PoseOverrides | null {
  if (!overlay?.size) return base;
  const merged = base ? new Map(base) : new Map();
  for (const [targetId, partial] of overlay) {
    merged.set(targetId, { ...(merged.get(targetId) ?? {}), ...partial });
  }
  return merged;
}

export function mergeDraftIntoDefaultPose(
  defaultPose: ProjectDocument['defaultPose'] | null | undefined,
  draftPose: PoseOverrides,
): ProjectDocument['defaultPose'] {
  const next = { ...(defaultPose ?? {}) };
  for (const [targetId, partial] of draftPose ?? []) {
    const serializable: ProjectDocument['defaultPose'][string] = {};
    for (const [key, value] of Object.entries(partial ?? {})) {
      if (typeof value === 'number' || typeof value === 'boolean') serializable[key] = value;
    }
    if (Object.keys(serializable).length) {
      next[targetId] = { ...(next[targetId] ?? {}), ...serializable };
    }
  }
  return next;
}

/**
 * Remove one target from persistent default-pose overrides.
 * Keeps the property absent when the last override is removed.
 */
export function clearDefaultPoseTarget(
  project: { defaultPose?: ProjectDocument['defaultPose'] },
  targetId: string,
): boolean {
  if (!targetId || !project.defaultPose?.[targetId]) return false;
  const next = { ...project.defaultPose };
  delete next[targetId];
  project.defaultPose = next;
  return true;
}

function assignedBoneId(node: PartNode, boneIds: ReadonlySet<string>): string | null {
  const candidates = [
    node.boneId,
    node.mesh?.jointBoneId,
    ...(node.mesh?.influences?.flatMap(vertex => vertex.map(influence => influence?.boneId)) ?? []),
  ];
  return candidates.find(id => id && boneIds.has(id)) ?? null;
}

function transformPoint(matrix: Matrix3, x: number, y: number): Vertex {
  return {
    x: matrix[0] * x + matrix[3] * y + matrix[6],
    y: matrix[1] * x + matrix[4] * y + matrix[7],
  };
}

/**
 * Bone setup coordinates are authored in world space. parentId therefore
 * means inheritance of the parent's bind→pose delta, not matrix nesting of
 * two local transforms.
 */
export function applyBoneHierarchyOverrides(
  project: ProjectDocument,
  poseOverrides: PoseOverrides,
): PoseOverrides {
  const bones = project.bones;
  if (!bones.length || !poseOverrides?.size) return poseOverrides;
  const bonesById = new Map<string, Bone>(bones.map(bone => [bone.id, bone]));
  const effectiveById = new Map<string, BoneSetup>();
  const next: PoseOverrides = new Map(poseOverrides);
  const resolving = new Set<string>();

  const resolve = (bone: Bone): BoneSetup => {
    const cached = effectiveById.get(bone.id);
    if (cached) return cached;
    if (resolving.has(bone.id)) return bone.setup;
    resolving.add(bone.id);

    const bind = bone.setup;
    const explicit = poseOverrides.get(bone.id) ?? {};
    let inherited = { ...bind };
    const parent = bone.parentId ? bonesById.get(bone.parentId) : null;
    if (parent) {
      const parentBind = parent.setup;
      const parentPose = resolve(parent);
      const parentDelta = mat3Mul(
        makeLocalMatrix(parentPose),
        mat3Inverse(makeLocalMatrix(parentBind)),
      );
      const inheritedPosition = transformPoint(parentDelta, bind.x ?? 0, bind.y ?? 0);
      inherited = {
        ...inherited,
        x: inheritedPosition.x,
        y: inheritedPosition.y,
        rotation: (bind.rotation ?? 0)
          + ((parentPose.rotation ?? 0) - (parentBind.rotation ?? 0)),
        scaleX: (bind.scaleX ?? 1)
          * ((parentPose.scaleX ?? 1) / ((parentBind.scaleX ?? 1) || 1)),
        scaleY: (bind.scaleY ?? 1)
          * ((parentPose.scaleY ?? 1) / ((parentBind.scaleY ?? 1) || 1)),
      };
    }

    const effective = { ...inherited };
    for (const key of HIERARCHY_KEYS) {
      const value = explicit[key];
      if (typeof value === 'number') effective[key] = value;
    }
    if (typeof explicit.length === 'number') effective.length = explicit.length;
    effectiveById.set(bone.id, effective);
    resolving.delete(bone.id);

    const inheritedOverride: PoseOverride = {};
    for (const key of HIERARCHY_KEYS) {
      if (effective[key] !== bind[key]) inheritedOverride[key] = effective[key];
    }
    if (typeof explicit.length === 'number') inheritedOverride.length = explicit.length;
    if (Object.keys(inheritedOverride).length) {
      next.set(bone.id, { ...explicit, ...inheritedOverride });
    }
    return effective;
  };

  for (const bone of bones) resolve(bone);
  return next;
}

interface SkinMeshVerticesArgs {
  node: PartNode;
  vertices: VertexInput;
  bindBones: ReadonlyMap<string, Bone>;
  posedBones: ReadonlyMap<string, Bone>;
  nodeWorldMatrix: Matrix3;
}

function isVertex(value: unknown): value is Vertex {
  return typeof value === 'object'
    && value !== null
    && 'x' in value
    && typeof value.x === 'number'
    && 'y' in value
    && typeof value.y === 'number';
}

function isVertexInput(value: unknown): value is VertexInput {
  return Array.isArray(value)
    && (value.every(item => typeof item === 'number') || value.every(isVertex));
}

function normalizeVertices(vertices: VertexInput): Vertex[] {
  if (vertices.every(isVertex)) return vertices.map(vertex => ({ x: vertex.x, y: vertex.y }));
  const points: Vertex[] = [];
  for (let index = 0; index + 1 < vertices.length; index += 2) {
    const x = vertices[index];
    const y = vertices[index + 1];
    if (typeof x === 'number' && typeof y === 'number') points.push({ x, y });
  }
  return points;
}

function skinMeshVertices({
  node,
  vertices,
  bindBones,
  posedBones,
  nodeWorldMatrix,
}: SkinMeshVerticesArgs): Vertex[] | null {
  const influences = node.mesh?.influences;
  if (!influences?.length || !vertices?.length) return null;
  const objectVertices = normalizeVertices(vertices);
  const bindToPose = new Map<string, Matrix3>();
  for (const [boneId, bindBone] of bindBones) {
    const posedBone = posedBones.get(boneId);
    if (!posedBone) continue;
    bindToPose.set(
      boneId,
      mat3Mul(makeLocalMatrix(posedBone.setup), mat3Inverse(makeLocalMatrix(bindBone.setup))),
    );
  }

  const worldToNode = mat3Inverse(nodeWorldMatrix);
  const result: Vertex[] = new Array<Vertex>(objectVertices.length);
  for (let index = 0; index < objectVertices.length; index++) {
    const vertex = objectVertices[index]!;
    const sourceWorld = transformPoint(
      nodeWorldMatrix,
      vertex.x,
      vertex.y,
    );
    let worldX = 0;
    let worldY = 0;
    let totalWeight = 0;
    for (const influence of influences[index] ?? []) {
      const deltaMatrix = bindToPose.get(influence.boneId);
      if (!deltaMatrix || influence.weight <= 0) continue;
      const posedWorld = transformPoint(deltaMatrix, sourceWorld.x, sourceWorld.y);
      worldX += posedWorld.x * influence.weight;
      worldY += posedWorld.y * influence.weight;
      totalWeight += influence.weight;
    }
    if (totalWeight < 1) {
      worldX += sourceWorld.x * (1 - totalWeight);
      worldY += sourceWorld.y * (1 - totalWeight);
    }
    const local = transformPoint(worldToNode, worldX, worldY);
    result[index] = local;
  }
  return result;
}

/**
 * Rigid attachment pass. Bone setup remains bind data; effective bone deltas
 * are converted to node overrides without mutating project nodes.
 */
export function applyBoneLinkedNodeOverrides(
  project: ProjectDocument,
  poseOverrides: PoseOverrides | null,
): PoseOverrides | null {
  if (!project.bones.length || !poseOverrides?.size) return poseOverrides;
  const bonesById = new Map<string, Bone>(project.bones.map(bone => [bone.id, bone]));
  const boneIds = new Set(bonesById.keys());
  const next: PoseOverrides = new Map(poseOverrides);
  const posedBones = new Map<string, Bone>(project.bones.map(bone => {
    const override = next.get(bone.id);
    const setup = { ...bone.setup };
    for (const key of TRANSFORM_KEYS) {
      const value = override?.[key];
      if (typeof value === 'number') setup[key] = value;
    }
    return [bone.id, { ...bone, setup }];
  }));
  const sourceNodes: Node[] = project.nodes.map(node => {
    const override = next.get(node.id);
    if (!override) return node;
    const transform = { ...node.transform };
    for (const key of HIERARCHY_KEYS) {
      const value = override[key];
      if (typeof value === 'number') transform[key] = value;
    }
    return { ...node, transform };
  });
  const nodeWorldMatrices = computeWorldMatrices(sourceNodes);

  for (const node of project.nodes) {
    if (node.type !== 'part' || node.boneLinkLocked === false) continue;
    const boneId = assignedBoneId(node, boneIds);
    if (!boneId) continue;
    const bindBone = bonesById.get(boneId);
    const boneOverride = next.get(boneId);
    if (!bindBone || !boneOverride) continue;

    // Soft-skinned meshes are deformed by the effective mesh pipeline
    // (applyLinearBlendSkinning in meshDeformation). Skip the legacy linked-node
    // skinning path to avoid double deformation now that renderer/overlay use
    // effectiveMeshes as the single source of truth.
    if (node.mesh?.influences?.length) continue;

    const existing = next.get(node.id) ?? {};
    const overrideVertices = isVertexInput(existing.mesh_verts) ? existing.mesh_verts : undefined;
    const meshVertices = overrideVertices ?? node.mesh?.vertices;
    const nodeWorldMatrix = nodeWorldMatrices.get(node.id);
    const skinnedVertices = meshVertices && nodeWorldMatrix
      ? skinMeshVertices({
        node,
        vertices: meshVertices,
        bindBones: bonesById,
        posedBones,
        nodeWorldMatrix,
      })
      : null;
    if (skinnedVertices) {
      next.set(node.id, { ...existing, mesh_verts: skinnedVertices });
      continue;
    }

    const bind = bindBone.setup;
    const posed = posedBones.get(boneId)?.setup ?? bind;
    const boneDelta = mat3Mul(
      makeLocalMatrix(posed),
      mat3Inverse(makeLocalMatrix(bind)),
    );
    const sourceWorld = nodeWorldMatrices.get(node.id);
    if (!sourceWorld) continue;
    const posedWorld = mat3Mul(boneDelta, sourceWorld);
    const parentWorld = node.parent
      ? nodeWorldMatrices.get(node.parent)
      : null;
    const posedLocal = parentWorld
      ? mat3Mul(mat3Inverse(parentWorld), posedWorld)
      : posedWorld;
    const source: Partial<Transform> = { ...node.transform };
    for (const key of HIERARCHY_KEYS) {
      const value = existing[key];
      if (typeof value === 'number') source[key] = value;
    }
    // Pose evaluation needs the canonical matrix angle. The authored branch
    // (for example an imported -720deg staging transform) is preserved by
    // direct transform edits, but must not leak into interpolated animation
    // output where -45deg and -405deg represent the same frame.
    const transformed = decomposeAffineMatrix(posedLocal, {
      pivotX: source.pivotX ?? 0,
      pivotY: source.pivotY ?? 0,
    });

    next.set(node.id, {
      ...existing,
      x: transformed.x,
      y: transformed.y,
      rotation: transformed.rotation,
      scaleX: transformed.scaleX,
      scaleY: transformed.scaleY,
    });
  }

  return next;
}
