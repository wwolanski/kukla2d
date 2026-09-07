/**
 * Builds effective canvas state from animation and draft pose layers.
 *
 * Shared source of truth for viewport and overlay rendering.
 *
 * Merge order, from lowest to highest priority:
 *  1. project node transform, opacity, and visibility
 *  2. animation keyframe overrides
 *  3. draft pose from the active edit gesture
 *
 * Outside Animation mode, keyframe transforms are ignored while draft mesh
 * vertices remain available for staging edits.
 */
import type { Bone, Node, ProjectDocument, Vertex } from "@kukla2d/contracts";

import {
  computePoseOverrides,
  applyBlendShapeDeltas,
} from "@/domain/animationEngine";
import type { PoseOverrides } from "@/domain/animationEngine.types.js";

import { applyBoneConstraintOverrides } from "./constraintPose.js";
import { buildEffectiveMeshFrame } from "./meshDeformation.js";
import {
  applyBoneLinkedNodeOverrides,
  mergePoseLayers,
  poseRecordToMap,
} from "./poseModel.js";

import type { FrameAnimationState, FramePose } from "./framePose.types.js";
import type { EffectiveMeshFrame } from "./meshDeformation.types.js";

type DraftPose = Map<string, Record<string, unknown>>;

interface FrameEditorState {
  editorMode?: string;
}

const ANIM_TRANSFORM_KEYS = ["x", "y", "rotation", "scaleX", "scaleY"] as const;
const BONE_SETUP_KEYS = [
  "x",
  "y",
  "rotation",
  "scaleX",
  "scaleY",
  "length",
] as const;

interface BlendShapeDraft {
  meshVerts?: Map<string, Vertex[]>;
}

/**
 * Build animation keyframe overrides from project/anim.
 * Returns per-target animation overrides, or null outside Animation mode.
 */
export function buildAnimationOverrides({
  project,
  animationState,
  editorMode,
}: {
  project: ProjectDocument;
  animationState: FrameAnimationState;
  editorMode?: string | undefined;
}): PoseOverrides | null {
  if (editorMode !== "animation") return null;
  const activeAnim =
    project.animations.find(
      (animation) => animation.id === animationState.activeAnimationId,
    ) ?? null;
  if (!activeAnim) return null;
  const endMs =
    ((animationState.endFrame ?? 0) / (animationState.fps || 1)) * 1000;
  return computePoseOverrides(
    activeAnim,
    animationState.currentTime,
    animationState.loopKeyframes,
    endMs,
  );
}

/**
 * Merge modifier pose overrides between animation keyframes and draft pose.
 * Modifier layer is applied after keyframes, before draft/user edit.
 */
export function mergeModifierPoseOverrides(
  baseOverrides: PoseOverrides | null,
  modifierOverrides?: PoseOverrides | null,
): PoseOverrides | null {
  if (!modifierOverrides?.size) return baseOverrides;
  if (!baseOverrides) return new Map(modifierOverrides);
  const merged = new Map(baseOverrides);
  for (const [nodeId, partial] of modifierOverrides) {
    const existing = merged.get(nodeId) ?? {};
    merged.set(nodeId, { ...existing, ...partial });
  }
  return merged;
}

/**
 * Merge runtime pose overrides onto the pre-physics frame.
 * Runtime layer is applied after draft/blend and before final constraints/linking.
 * When runtimePoseOverrides is provided, the composer re-resolves constraints
 * and linked nodes on the merged result (K6 contract).
 */
export function mergeRuntimePoseOverrides(
  baseOverrides: PoseOverrides | null,
  runtimeOverrides?: PoseOverrides | null,
): PoseOverrides | null {
  if (!runtimeOverrides?.size) return baseOverrides;
  if (!baseOverrides) return new Map(runtimeOverrides);
  const merged = new Map(baseOverrides);
  for (const [nodeId, partial] of runtimeOverrides) {
    const existing = merged.get(nodeId) ?? {};
    merged.set(nodeId, { ...existing, ...partial });
  }
  return merged;
}

/**
 * Merge draft overrides at the highest authoring priority.
 */
export function mergeDraftPoseOverrides({
  baseOverrides,
  draftPose,
}: {
  baseOverrides: PoseOverrides | null;
  draftPose?: DraftPose | null;
}): PoseOverrides | null {
  if (!draftPose?.size) return baseOverrides;
  if (!baseOverrides) return new Map(draftPose);
  const merged = new Map(baseOverrides);
  for (const [nodeId, partial] of draftPose) {
    const existing = merged.get(nodeId) ?? {};
    merged.set(nodeId, { ...existing, ...partial });
  }
  return merged;
}

/**
 * Apply blend-shape preview vertices for selected parts.
 */
export function applyBlendShapePreviewOverrides({
  baseOverrides,
  draftPose,
}: {
  baseOverrides: PoseOverrides | null;
  draftPose?: DraftPose | BlendShapeDraft | null;
}): PoseOverrides | null {
  if (!draftPose || !("meshVerts" in draftPose) || !draftPose.meshVerts)
    return baseOverrides;
  if (!baseOverrides) return new Map();
  const merged = new Map(baseOverrides);
  for (const [partId, verts] of draftPose.meshVerts) {
    const existing = merged.get(partId) ?? {};
    merged.set(partId, { ...existing, mesh_verts: verts });
  }
  return merged;
}

/**
 * Build effective nodes from project state and pose overrides.
 */
export function buildEffectiveNodes(
  project: ProjectDocument,
  baseOverrides: PoseOverrides | null,
): Node[] {
  if (!baseOverrides?.size) return project.nodes;
  return project.nodes.map((node) => {
    const ov = baseOverrides.get(node.id);
    if (!ov) return node;
    const tr = { ...node.transform };
    for (const k of ANIM_TRANSFORM_KEYS) {
      const value = ov[k];
      if (typeof value === "number") tr[k] = value;
    }
    return {
      ...node,
      transform: tr,
      opacity: typeof ov.opacity === "number" ? ov.opacity : node.opacity,
      visible: typeof ov.visible === "boolean" ? ov.visible : node.visible,
      ...(typeof ov.drawOrder === "number"
        ? { draw_order: ov.drawOrder }
        : "draw_order" in node
          ? { draw_order: node.draw_order }
          : {}),
    };
  });
}

/**
 * Build effective bones with overrides applied.
 */
export function buildEffectiveBones(
  project: ProjectDocument,
  baseOverrides: PoseOverrides | null,
  editorMode?: string,
): Bone[] {
  void editorMode;
  const bones = project.bones ?? [];
  if (!bones.length || !baseOverrides?.size) return bones;
  return bones.map((bone) => {
    const ov = baseOverrides.get(bone.id);
    if (!ov) return bone;
    const setup = { ...(bone.setup ?? {}) };
    for (const key of BONE_SETUP_KEYS) {
      const value = ov[key];
      if (typeof value === "number") setup[key] = value;
    }
    return { ...bone, setup };
  });
}

/**
 * Compose every pose layer for one editor frame.
 *
 * Layer order (R4):
 *  1. defaultPose
 *  2. parameter-driven (keyframe-protected)
 *  3. animation keyframes
 *  4. animation modifier overrides (procedural)
 *  5. draft pose / blend shape preview
 *  6. runtime pose overrides (optional — physics policy adapter)
 *  7. bone constraints (IK)
 *  8. linked node overrides
 *
 * Without runtime overrides, the result represents the pre-physics frame.
 * Runtime overrides trigger a final constraint and linked-node resolution pass.
 *
 * @param {Object} args
 * @param {Object} args.project
 * @param {Object} args.editorState           - editor store state
 * @param {Object} args.animationState         - animation store state
 * @param {Map}    [args.modifierPoseOverrides] - animation modifier overrides (between keyframes and draft)
 * @param {Map}    [args.runtimePoseOverrides] - optional runtime layer (K6)
 * @returns {{ poseOverrides: Map|null, effectiveNodes: Array, effectiveBones: Array, physicsActive: boolean, preLinkedNodes: Array }}
 */
export function buildFramePose({
  project,
  editorState,
  animationState,
  modifierPoseOverrides,
  runtimePoseOverrides,
}: {
  project: ProjectDocument;
  editorState: FrameEditorState;
  animationState: FrameAnimationState;
  modifierPoseOverrides?: PoseOverrides | null;
  runtimePoseOverrides?: PoseOverrides | null;
}): FramePose {
  const defaultOverrides = poseRecordToMap(project.defaultPose);
  const kfOverrides = buildAnimationOverrides({
    project,
    animationState,
    editorMode: editorState?.editorMode,
  });
  const animationMerged = mergePoseLayers(defaultOverrides, kfOverrides);
  const modifierMerged = mergeModifierPoseOverrides(
    animationMerged,
    modifierPoseOverrides,
  );
  const draftMerged = mergeDraftPoseOverrides({
    baseOverrides: modifierMerged,
    draftPose: animationState?.draftPose,
  });
  const withBlend = applyBlendShapePreviewOverrides({
    baseOverrides: draftMerged,
    draftPose: animationState?.draftPose,
  });
  const withRuntime = mergeRuntimePoseOverrides(
    withBlend,
    runtimePoseOverrides,
  );
  const withBones = applyBoneConstraintOverrides(project, withRuntime);
  const preLinkedNodes = buildEffectiveNodes(project, withBones);
  const withLinkedNodes = applyBoneLinkedNodeOverrides(project, withBones);

  const withBlendShapes: PoseOverrides = new Map(withLinkedNodes ?? []);
  for (const node of project.nodes ?? []) {
    if (node.type !== "part" || !node.blendShapes?.length) continue;
    const ov = withLinkedNodes?.get(node.id) ?? {};
    if (ov.mesh_verts) {
      withBlendShapes.set(node.id, ov);
      continue;
    }
    const baseVerts = node.mesh?.vertices;
    if (!baseVerts?.length) continue;
    const blendShapeValues = { ...(node.blendShapeValues ?? {}) };
    for (const shape of node.blendShapes) {
      const animated = ov[`blendShape:${shape.id}`];
      if (typeof animated === "number") blendShapeValues[shape.id] = animated;
    }
    const deformed = applyBlendShapeDeltas(
      baseVerts,
      node.blendShapes,
      blendShapeValues,
    );
    withBlendShapes.set(node.id, { ...ov, mesh_verts: deformed });
  }

  const finalOverrides =
    withBlendShapes.size > 0 ? withBlendShapes : (withLinkedNodes ?? null);
  const effectiveNodes = buildEffectiveNodes(project, withBlendShapes);
  const effectiveBones = buildEffectiveBones(
    project,
    withBones,
    editorState?.editorMode,
  );
  // rest/bind bones come from project setup without defaultPose overrides.
  const restBones = buildEffectiveBones(project, null, editorState?.editorMode);
  const effectiveMeshes = buildEffectiveMeshFrames(
    project,
    finalOverrides,
    effectiveBones,
    restBones,
  );
  const physicsActive =
    runtimePoseOverrides != null && runtimePoseOverrides.size > 0;
  return {
    poseOverrides: finalOverrides,
    effectiveNodes,
    effectiveBones,
    effectiveMeshes,
    physicsActive,
    preLinkedNodes,
  };
}

function buildEffectiveMeshFrames(
  project: ProjectDocument,
  poseOverrides: PoseOverrides | null,
  effectiveBones: Bone[],
  restBones: Bone[],
): Map<string, EffectiveMeshFrame> {
  const frames = new Map<string, EffectiveMeshFrame>();
  const allNodes = project.nodes ?? [];
  for (const node of allNodes) {
    if (node.type !== "part" || !node.mesh?.vertices?.length) continue;
    const frame = buildEffectiveMeshFrame({
      partNode: node,
      poseOverrides,
      effectiveBones,
      restBones,
      warpFrames: null,
      allNodes,
    });
    frames.set(node.id, frame);
  }
  return frames;
}
