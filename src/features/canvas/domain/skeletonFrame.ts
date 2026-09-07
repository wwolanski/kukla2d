import type {
  Bone,
  BoneId,
  Constraint,
  GroupNode,
  Node,
} from "@kukla2d/contracts";

import { resolveVisibleHoverHit } from "@/domain/hoverPolicy.js";
import { mat3Identity } from "@/domain/transforms.js";
import type { Matrix3 } from "@/domain/transforms.types.js";

import { clamp } from "@/lib/math";

import { getBoneSegment } from "./picking.js";
import { buildPoseHandle } from "./poseHandle.js";

const SKELETON_CONNECTIONS: readonly (readonly [string, string])[] = [
  ["torso", "neck"],
  ["neck", "head"],
  ["torso", "leftArm"],
  ["leftArm", "leftElbow"],
  ["torso", "rightArm"],
  ["rightArm", "rightElbow"],
  ["torso", "leftLeg"],
  ["leftLeg", "leftKnee"],
  ["torso", "rightLeg"],
  ["rightLeg", "rightKnee"],
  ["leftArm", "bothArms"],
  ["rightArm", "bothArms"],
  ["leftLeg", "bothLegs"],
  ["rightLeg", "bothLegs"],
];

/**
 * Pure helper: compute world-space skeleton overlay geometry.
 *
 * No React, DOM, or Pixi imports. Used by PixiOverlayRenderer and testable in isolation.
 *
 * @param {Object} args
 * @param {Array}  args.effectiveNodes  - buildFramePose effectiveNodes
 * @param {Array}  args.effectiveBones  - buildFramePose effectiveBones
 * @param {Map}    args.worldMatrices   - computeWorldMatrices output
 * @param {Object} [args.editorState]    - active/hover selection state
 * @returns {Object} skeleton frame
 */
interface SkeletonEditorState {
  activeBoneId?: string | null;
  selection?: string[];
  activeTool?: string;
  drawBonePreview?: unknown;
  weightPaintBoneId?: string | null;
  selectionTarget?: string;
  riggingTool?: string | null;
  editorMode?: string;
  hoverHit?: string | null;
  hoverSource?: string | null;
}
interface BoneLine {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  boneId: string;
  name: string;
  isActive: boolean;
  isSelected: boolean;
  isMultiSelected: boolean;
  isHovered: boolean;
}
interface SkeletonConnection {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  fromRole: string;
  toRole: string;
}
interface SkeletonJoint {
  x: number;
  y: number;
  boneId: string;
  name: string;
  isActive: boolean;
  isSelected: boolean;
  isMultiSelected: boolean;
  isHovered: boolean;
}
interface BoneTransformFrame {
  boneId: BoneId;
  start: { x: number; y: number };
  end: { x: number; y: number };
  rotateHandle: { x: number; y: number };
  lengthHandle: { x: number; y: number };
  rotateRingRadius: number;
  rotateHitRadius: number;
  lengthHandleRadius: number;
  lengthAllowed: boolean;
}
interface SkeletonFrame {
  boneNodes: Record<string, GroupNode>;
  boneLines: BoneLine[];
  connections: SkeletonConnection[];
  joints: SkeletonJoint[];
  boneTransformFrame: BoneTransformFrame | null;
  poseHandleFrame: ReturnType<typeof buildPoseHandle> | null;
}

export function buildSkeletonFrame({
  effectiveNodes,
  effectiveBones,
  worldMatrices,
  editorState = null,
  constraints = [],
  poseHandleExtensions = null,
}: {
  effectiveNodes: readonly Node[];
  effectiveBones: readonly Bone[];
  worldMatrices: ReadonlyMap<string, Matrix3>;
  editorState?: SkeletonEditorState | null;
  constraints?: readonly Constraint[];
  poseHandleExtensions?: ReadonlyMap<string, number> | null;
}): SkeletonFrame {
  const boneNodes: Record<string, GroupNode> = {};
  for (const n of effectiveNodes) {
    if (n.type === "group" && n.boneRole) boneNodes[n.boneRole] = n;
  }

  function worldPivotPos(node: GroupNode): { x: number; y: number } {
    const wm = worldMatrices.get(node.id) ?? mat3Identity();
    return {
      x: wm[0] * node.transform.pivotX + wm[3] * node.transform.pivotY + wm[6],
      y: wm[1] * node.transform.pivotX + wm[4] * node.transform.pivotY + wm[7],
    };
  }

  const boneLines: BoneLine[] = [];
  const boneMap = new Map<string, Bone>(
    effectiveBones.map((bone) => [bone.id, bone]),
  );
  const activeBoneId = editorState?.activeBoneId ?? null;
  const selection = editorState?.selection ?? [];
  const isDrawingBone =
    editorState?.activeTool === "drawBone" &&
    editorState?.drawBonePreview != null;
  const hoverHit: unknown = resolveVisibleHoverHit(editorState);
  const hoveredBoneIds = resolveHoveredBoneIds(hoverHit, constraints);
  const weightPaintBoneId = editorState?.weightPaintBoneId ?? null;
  const isMulti = selection.length > 1;
  for (const bone of effectiveBones) {
    if (isDrawingBone && bone.id === activeBoneId) continue;
    const seg = getBoneSegment(bone, boneMap);
    const inSelection = selection.includes(bone.id);
    const isActive = activeBoneId === bone.id;
    const isSelected = inSelection && !isDrawingBone;
    const isMultiSelected = inSelection && isMulti && !isDrawingBone;
    const isHovered =
      hoveredBoneIds.has(bone.id) || weightPaintBoneId === bone.id;
    boneLines.push({
      x1: seg.x1,
      y1: seg.y1,
      x2: seg.x2,
      y2: seg.y2,
      boneId: bone.id,
      name: bone.name,
      isActive: isActive && !isDrawingBone,
      isSelected,
      isMultiSelected,
      isHovered,
    });
  }

  const connections: SkeletonConnection[] = [];
  for (const [fromRole, toRole] of SKELETON_CONNECTIONS) {
    const from = boneNodes[fromRole];
    const to = boneNodes[toRole];
    if (!from || !to) continue;
    const p1 = worldPivotPos(from);
    const p2 = worldPivotPos(to);
    connections.push({
      x1: p1.x,
      y1: p1.y,
      x2: p2.x,
      y2: p2.y,
      fromRole,
      toRole,
    });
  }

  const joints: SkeletonJoint[] = [];
  for (const bone of effectiveBones) {
    if (isDrawingBone && bone.id === activeBoneId) continue;
    const inSelection = selection.includes(bone.id);
    joints.push({
      x: bone.setup?.x ?? 0,
      y: bone.setup?.y ?? 0,
      boneId: bone.id,
      name: bone.name,
      isActive: activeBoneId === bone.id && !isDrawingBone,
      isSelected: inSelection && !isDrawingBone,
      isMultiSelected: inSelection && isMulti && !isDrawingBone,
      isHovered: hoveredBoneIds.has(bone.id) || weightPaintBoneId === bone.id,
    });
  }

  const boneTransformFrame = buildBoneTransformFrame({
    effectiveBones,
    editorState,
    boneMap,
  });
  const poseHandleFrame = buildPoseHandleFrame({
    effectiveBones,
    editorState,
    poseHandleExtensions,
  });

  return {
    boneNodes,
    boneLines,
    connections,
    joints,
    boneTransformFrame,
    poseHandleFrame,
  };
}

export function resolveHoveredBoneIds(
  hoverHit: unknown,
  constraints: readonly Constraint[] = [],
): Set<string> {
  if (typeof hoverHit !== "string") return new Set<string>();
  if (hoverHit.startsWith("bone:"))
    return new Set([hoverHit.slice("bone:".length)]);
  if (!hoverHit.startsWith("constraint:")) return new Set<string>();
  const constraintId = hoverHit.slice("constraint:".length);
  const constraint = constraints.find(
    (candidate) => candidate.id === constraintId,
  );
  return constraint?.assignedBoneId
    ? new Set([constraint.assignedBoneId])
    : new Set<string>();
}

export function buildPoseHandleFrame({
  effectiveBones,
  editorState = null,
  poseHandleExtensions = null,
}: {
  effectiveBones: readonly Bone[];
  editorState?: SkeletonEditorState | null;
  poseHandleExtensions?: ReadonlyMap<string, number> | null;
}): ReturnType<typeof buildPoseHandle> | null {
  if (editorState?.activeTool !== "pose") return null;
  const hoverHit: unknown = resolveVisibleHoverHit(editorState);
  const hoveredBoneId =
    typeof hoverHit === "string" && hoverHit.startsWith("bone:")
      ? hoverHit.slice("bone:".length)
      : null;
  const activeBoneId =
    hoveredBoneId ??
    editorState?.activeBoneId ??
    editorState?.selection?.find((id) =>
      effectiveBones?.some((bone) => bone.id === id),
    );
  const bone = effectiveBones?.find(
    (candidate) => candidate.id === activeBoneId,
  );
  if (!bone) return null;
  return buildPoseHandle({
    bone,
    extension: poseHandleExtensions?.get(bone.id) ?? null,
  });
}

const RING_K = 0.16;
const RING_MIN = 10;
const RING_MAX = 38;
const HIT_GAP = 8;
const HIT_MIN = 18;
const HIT_MAX = 46;
const OFF_K_EXTRA = 10;
const LEN_RADIUS = 7;

/**
 * Build the bone transform overlay frame for a single bone. The selected
 * bone (activeBoneId, falling back to the first selected bone) gets:
 *  - `start`, `end`: world-space bone segment endpoints
 *  - `rotateHandle`: ring point below the bone, perpendicular to its axis
 *  - `lengthHandle`: tip of the bone
 *  - `rotateRingRadius`: world-space ring radius
 *  - `lengthHandleRadius`: world-space length handle radius
 *
 * Returns `null` when there is no eligible bone.
 *
 * @param {Object} args
 * @param {Array}  args.effectiveBones
 * @param {Object} args.editorState
 * @param {Map}    args.boneMap
 */
export function buildBoneTransformFrame({
  effectiveBones,
  editorState = null,
  boneMap,
}: {
  effectiveBones: readonly Bone[];
  editorState?: SkeletonEditorState | null;
  boneMap?: ReadonlyMap<string, Bone> | null;
}): BoneTransformFrame | null {
  if (!effectiveBones?.length) return null;
  if (!["all", "rig"].includes(editorState?.selectionTarget ?? "")) return null;
  if (editorState?.activeTool !== "transform") return null;
  if (editorState?.riggingTool && editorState.riggingTool !== "select")
    return null;
  const activeBoneId = editorState?.activeBoneId ?? null;
  const selection = editorState?.selection ?? [];
  const target = activeBoneId
    ? effectiveBones.find((b) => b.id === activeBoneId)
    : selection.find((id) => effectiveBones.some((b) => b.id === id))
      ? effectiveBones.find(
          (b) =>
            b.id ===
            selection.find((id) => effectiveBones.some((b) => b.id === id)),
        )
      : null;
  if (!target) return null;
  if (selection.length > 1 && !selection.includes(target.id)) return null;
  const map =
    boneMap ?? new Map<string, Bone>(effectiveBones.map((b) => [b.id, b]));
  const seg = getBoneSegment(target, map);
  const dx = seg.x2 - seg.x1;
  const dy = seg.y2 - seg.y1;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  const px = -uy;
  const py = ux;
  const ringR = clamp(len * RING_K, RING_MIN, RING_MAX);
  const offR = ringR + OFF_K_EXTRA;
  const rotateHandle = {
    x: seg.x1 + px * offR,
    y: seg.y1 + py * offR,
  };
  const isLengthAllowed = editorState?.editorMode !== "animation";
  return {
    boneId: target.id,
    start: { x: seg.x1, y: seg.y1 },
    end: { x: seg.x2, y: seg.y2 },
    rotateHandle,
    lengthHandle: { x: seg.x2, y: seg.y2 },
    rotateRingRadius: ringR,
    rotateHitRadius: clamp(ringR + HIT_GAP, HIT_MIN, HIT_MAX),
    lengthHandleRadius: LEN_RADIUS,
    lengthAllowed: isLengthAllowed,
  };
}
