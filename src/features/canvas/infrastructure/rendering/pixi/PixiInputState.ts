import type {
  Bone,
  Node,
  ProjectDocument,
  WarpDeformerNode,
} from "@kukla2d/contracts";

import { computePoseOverrides } from "@/domain/animationEngine";
import type { PoseOverrides } from "@/domain/animationEngine.types.js";

import { applyBoneConstraintOverrides } from "@/features/canvas/domain/constraintPose.js";
import {
  mergePoseLayers,
  poseRecordToMap,
} from "@/features/canvas/domain/poseModel.js";
import { buildRestGrid } from "@/features/canvas/domain/warpKeyframes.js";

import type {
  EditorRuntimePort,
  FramePoseSnapshot,
} from "./pixiInteractionContracts.types.js";
import type { PixiInteractionSystem } from "./PixiInteractionSystem.js";
import type { CanvasAnimationRuntimePort } from "../../../application/canvasRenderer.types.js";

const ANIM_TRANSFORM_KEYS = ["x", "y", "rotation", "scaleX", "scaleY"] as const;

interface EffectiveStateInput {
  project: ProjectDocument;
  editor: EditorRuntimePort;
  animation: CanvasAnimationRuntimePort;
}

export function getEffectiveNodes({
  project,
  editor,
  animation,
}: EffectiveStateInput): Node[] {
  if (!project || !editor || !animation) return project?.nodes ?? [];

  const isAnimMode = editor.editorMode === "animation";
  const activeAnim = isAnimMode
    ? (project.animations.find((a) => a.id === animation.activeAnimationId) ??
      null)
    : null;
  const kfOverrides = isAnimMode
    ? computePoseOverrides(activeAnim, animation.currentTime)
    : null;

  if (!isAnimMode || (!kfOverrides?.size && !animation.draftPose.size)) {
    return project.nodes;
  }

  return project.nodes.map((node) => {
    const keyframeOverride = kfOverrides?.get(node.id);
    const draftOverride = animation.draftPose.get(node.id);
    if (!keyframeOverride && !draftOverride) return node;

    const transform = { ...node.transform };
    if (keyframeOverride) {
      for (const key of ANIM_TRANSFORM_KEYS) {
        const value = keyframeOverride[key];
        if (typeof value === "number") transform[key] = value;
      }
    }
    if (draftOverride) {
      for (const key of ANIM_TRANSFORM_KEYS) {
        const value = draftOverride[key];
        if (typeof value === "number") transform[key] = value;
      }
    }

    return {
      ...node,
      transform,
      opacity:
        readNumber(draftOverride?.opacity) ??
        readNumber(keyframeOverride?.opacity) ??
        node.opacity,
      visible:
        readBoolean(draftOverride?.visible) ??
        readBoolean(keyframeOverride?.visible) ??
        node.visible,
    };
  });
}

export function getWarpGrid({
  wdNode,
  animation,
  poseOverrides,
}: {
  wdNode: WarpDeformerNode | null | undefined;
  animation?: CanvasAnimationRuntimePort | null;
  poseOverrides?: PoseOverrides | null;
}): Array<{ x: number; y: number }> | null {
  if (!wdNode) return null;

  const draft = animation?.draftPose?.get?.(wdNode.id)?.mesh_verts;
  const draftPoints = readPoints(draft);
  if (draftPoints.length) return draftPoints;

  const override = poseOverrides?.get?.(wdNode.id)?.mesh_verts;
  const overridePoints = readPoints(override);
  if (overridePoints.length) return overridePoints;

  const col = wdNode.col ?? 2;
  const row = wdNode.row ?? 2;
  const gridX = wdNode.gridX ?? 0;
  const gridY = wdNode.gridY ?? 0;
  const gridW = wdNode.gridW ?? 100;
  const gridH = wdNode.gridH ?? 100;
  return buildRestGrid({ gridX, gridY, gridW, gridH, col, row });
}

function readNumber(value: unknown): number | undefined {
  return typeof value === "number" ? value : undefined;
}

function readBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function readPoints(value: unknown): Array<{ x: number; y: number }> {
  if (!Array.isArray(value)) return [];
  const points: unknown[] = value;
  return points.flatMap((point) => {
    if (
      typeof point !== "object" ||
      point === null ||
      !("x" in point) ||
      !("y" in point)
    )
      return [];
    return typeof point.x === "number" && typeof point.y === "number"
      ? [{ x: point.x, y: point.y }]
      : [];
  });
}

export function getEffectiveBones({
  project,
  effectiveNodes,
  editor,
  animation,
}: EffectiveStateInput & { effectiveNodes: readonly Node[] }): Bone[] {
  if (!project?.bones?.length) return [];
  const activeAnim =
    editor?.editorMode === "animation"
      ? project.animations.find(
          (item) => item.id === animation?.activeAnimationId,
        )
      : null;
  const keyframes = activeAnim
    ? computePoseOverrides(activeAnim, animation?.currentTime ?? 0)
    : null;
  const defaults = poseRecordToMap(project.defaultPose);
  const withKeyframes = mergePoseLayers(defaults, keyframes);
  const withDraft = mergePoseLayers(withKeyframes, animation?.draftPose);
  const overrides = applyBoneConstraintOverrides(project, withDraft);
  return project.bones.map((bone) => {
    const node = effectiveNodes?.find((n) => n.id === bone.nodeId);
    const override = overrides?.get(bone.id);
    return {
      ...bone,
      setup: {
        ...(node?.transform ?? {}),
        ...bone.setup,
        ...override,
      },
    };
  });
}

export function getEffectiveRigState({
  project,
  editor,
  animation,
  framePose,
}: EffectiveStateInput & { framePose?: FramePoseSnapshot | null }): {
  nodes: Node[];
  bones: Bone[];
  poseOverrides: PoseOverrides | null;
} {
  if (framePose?.effectiveNodes && framePose?.effectiveBones) {
    return {
      nodes: framePose.effectiveNodes,
      bones: framePose.effectiveBones,
      poseOverrides: framePose.poseOverrides ?? null,
    };
  }
  const nodes = getEffectiveNodes({ project, editor, animation });
  const bones = getEffectiveBones({
    project,
    effectiveNodes: nodes,
    editor,
    animation,
  });
  return { nodes, bones, poseOverrides: null };
}

export function getAdapterEffectiveRigState(
  adapter: PixiInteractionSystem,
): ReturnType<typeof getEffectiveRigState> {
  return getEffectiveRigState({
    project: adapter.projectRef.current,
    editor: adapter.editorRef.current,
    animation: adapter.animationRef?.current,
    framePose: adapter.readFramePose?.(),
  });
}
