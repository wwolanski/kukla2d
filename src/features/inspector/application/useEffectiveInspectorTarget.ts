import { useMemo } from "react";

import type {
  Animation,
  Bone,
  Constraint,
  Node,
  Transform,
} from "@kukla2d/contracts";

import { useAnimationStore } from "@/store/animationStore";
import type { DraftPose } from "@/store/animationStoreTypes.types.js";
import { useEditorStore } from "@/store/editorStore";
import type { EditorStore } from "@/store/editorStoreTypes.types.js";
import { useProjectStore } from "@/store/projectStore";

import { computePoseOverrides } from "@/domain/animationEngine";
import { sampleTimeAtFps } from "@/domain/animationTransport";

import { finiteNumberOrUndefined } from "@/lib/math";

interface AnimationResolutionContext {
  editorMode: EditorStore["editorMode"];
  activeAnimation: Animation | null;
  currentTime: number;
  draftPose: DraftPose;
  loopKeyframes: boolean;
  fps: number;
  endFrame: number;
}

interface NodeResolutionOptions extends AnimationResolutionContext {
  node: Node | null;
}

interface BoneResolutionOptions extends AnimationResolutionContext {
  bone: Bone | null;
}

interface ConstraintResolutionOptions extends AnimationResolutionContext {
  constraint: Constraint | null;
}

interface InspectorTargetOptions extends AnimationResolutionContext {
  selection: readonly string[];
  nodes: readonly Node[];
  bones: readonly Bone[];
  constraints: readonly Constraint[];
  activeBoneId: string | null;
  activeConstraintId: string | null;
}

type EffectiveInspectorTarget =
  | { mode: "multiple" | "empty"; target: null }
  | { mode: "node"; target: Node }
  | { mode: "bone"; target: Bone }
  | { mode: "constraint"; target: Constraint };

const NODE_ANIM_KEYS = [
  "x",
  "y",
  "rotation",
  "scaleX",
  "scaleY",
] as const satisfies readonly (keyof Transform)[];
const BONE_ANIM_KEYS = [
  "x",
  "y",
  "rotation",
  "scaleX",
  "scaleY",
] as const satisfies readonly (keyof Bone["setup"])[];

function booleanValue(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

export function resolveEffectiveInspectorNode({
  node,
  editorMode,
  activeAnimation,
  currentTime,
  draftPose,
  loopKeyframes,
  fps,
  endFrame,
}: NodeResolutionOptions): Node | null {
  if (!node) return null;
  if (editorMode !== "animation") return node;

  const endMs = (endFrame / fps) * 1000;
  const overrides = computePoseOverrides(
    activeAnimation,
    currentTime,
    loopKeyframes,
    endMs,
  );
  const keyframeOverrides = overrides.get(node.id);
  const draftOverrides = draftPose.get(node.id);

  if (!keyframeOverrides && !draftOverrides) return node;

  const transform = { ...(node.transform ?? {}) };
  if (keyframeOverrides) {
    for (const key of NODE_ANIM_KEYS) {
      const value = finiteNumberOrUndefined(keyframeOverrides[key]);
      if (value !== undefined) transform[key] = value;
    }
  }
  if (draftOverrides) {
    for (const key of NODE_ANIM_KEYS) {
      const value = finiteNumberOrUndefined(draftOverrides[key]);
      if (value !== undefined) transform[key] = value;
    }
  }

  const opacity =
    finiteNumberOrUndefined(draftOverrides?.opacity) ??
    finiteNumberOrUndefined(keyframeOverrides?.opacity) ??
    node.opacity;
  const visible =
    booleanValue(draftOverrides?.visible) ??
    booleanValue(keyframeOverrides?.visible) ??
    node.visible;
  if (node.type !== "part") return { ...node, transform, opacity, visible };

  const blendShapeValues = { ...(node.blendShapeValues ?? {}) };
  for (const shape of node.blendShapes ?? []) {
    const prop = `blendShape:${shape.id}`;
    blendShapeValues[shape.id] =
      finiteNumberOrUndefined(draftOverrides?.[prop]) ??
      finiteNumberOrUndefined(keyframeOverrides?.[prop]) ??
      blendShapeValues[shape.id] ??
      0;
  }

  return {
    ...node,
    transform,
    opacity,
    visible,
    blendShapeValues,
  };
}

function resolveEffectiveInspectorBone({
  bone,
  editorMode,
  activeAnimation,
  currentTime,
  draftPose,
  loopKeyframes,
  fps,
  endFrame,
}: BoneResolutionOptions): Bone | null {
  if (!bone) return null;
  if (editorMode !== "animation") return bone;

  const endMs = (endFrame / fps) * 1000;
  const overrides = computePoseOverrides(
    activeAnimation,
    currentTime,
    loopKeyframes,
    endMs,
  );
  const keyframeOverrides = overrides.get(bone.id);
  const draftOverrides = draftPose.get(bone.id);

  if (!keyframeOverrides && !draftOverrides) return bone;

  const setup = { ...(bone.setup ?? {}) };
  if (keyframeOverrides) {
    for (const key of BONE_ANIM_KEYS) {
      const value = finiteNumberOrUndefined(keyframeOverrides[key]);
      if (value !== undefined) setup[key] = value;
    }
  }
  if (draftOverrides) {
    for (const key of BONE_ANIM_KEYS) {
      const value = finiteNumberOrUndefined(draftOverrides[key]);
      if (value !== undefined) setup[key] = value;
    }
  }

  return { ...bone, setup };
}

function resolveEffectiveInspectorConstraint({
  constraint,
  editorMode,
  activeAnimation,
  currentTime,
  draftPose,
  loopKeyframes,
  fps,
  endFrame,
}: ConstraintResolutionOptions): Constraint | null {
  if (!constraint) return null;
  if (editorMode !== "animation") return constraint;

  const endMs = (endFrame / fps) * 1000;
  const overrides = computePoseOverrides(
    activeAnimation,
    currentTime,
    loopKeyframes,
    endMs,
  );
  const keyframeOverrides = overrides.get(constraint.id);
  const draftOverrides = draftPose.get(constraint.id);

  if (!keyframeOverrides && !draftOverrides) return constraint;

  const merged = { ...keyframeOverrides, ...draftOverrides };
  const resolved: Constraint = { ...constraint };
  for (const key of ["targetX", "targetY", "mix", "fkIk", "order"] as const) {
    const value = finiteNumberOrUndefined(merged[key]);
    if (value !== undefined) resolved[key] = value;
  }
  const bendPositive = booleanValue(merged.bendPositive);
  if (bendPositive !== undefined) resolved.bendPositive = bendPositive;

  return resolved;
}

export function resolveEffectiveInspectorTarget({
  selection,
  nodes,
  bones,
  constraints,
  editorMode,
  activeBoneId,
  activeConstraintId,
  activeAnimation,
  currentTime,
  draftPose,
  loopKeyframes,
  fps,
  endFrame,
}: InspectorTargetOptions): EffectiveInspectorTarget {
  if (selection.length > 1) {
    return { mode: "multiple", target: null };
  }

  const selectedId = selection[0];
  const selectedNode = nodes.find((node) => node.id === selectedId) ?? null;
  if (selectedNode) {
    const target = resolveEffectiveInspectorNode({
      node: selectedNode,
      editorMode,
      activeAnimation,
      currentTime,
      draftPose,
      loopKeyframes,
      fps,
      endFrame,
    });
    if (target) return { mode: "node", target };
  }

  const selectedBone =
    bones.find((bone) => bone.id === selectedId) ??
    (selection.length === 0
      ? (bones.find((bone) => bone.id === activeBoneId) ?? null)
      : null);
  if (selectedBone) {
    const target = resolveEffectiveInspectorBone({
      bone: selectedBone,
      editorMode,
      activeAnimation,
      currentTime,
      draftPose,
      loopKeyframes,
      fps,
      endFrame,
    });
    if (target) return { mode: "bone", target };
  }

  const selectedConstraint =
    constraints.find(
      (constraint) =>
        constraint.id === selectedId || constraint.id === activeConstraintId,
    ) ?? null;
  if (selectedConstraint) {
    const target = resolveEffectiveInspectorConstraint({
      constraint: selectedConstraint,
      editorMode,
      activeAnimation,
      currentTime,
      draftPose,
      loopKeyframes,
      fps,
      endFrame,
    });
    if (target) return { mode: "constraint", target };
  }

  return { mode: "empty", target: null };
}

export function useEffectiveInspectorTarget(): EffectiveInspectorTarget {
  const selection = useEditorStore((state) => state.selection);
  const editorMode = useEditorStore((state) => state.editorMode);
  const activeBoneId = useEditorStore((state) => state.activeBoneId);
  const activeConstraintId = useEditorStore(
    (state) => state.activeConstraintId,
  );
  const nodes = useProjectStore((state) => state.project.nodes);
  const bones = useProjectStore((state) => state.project.bones ?? []);
  const constraints = useProjectStore(
    (state) => state.project.constraints ?? [],
  );
  const animations = useProjectStore((state) => state.project.animations);
  const activeAnimationId = useAnimationStore(
    (state) => state.activeAnimationId,
  );
  const currentTime = useAnimationStore((state) =>
    sampleTimeAtFps(state.currentTime, state.fps),
  );
  const draftPose = useAnimationStore((state) => state.draftPose);
  const loopKeyframes = useAnimationStore((state) => state.loopKeyframes);
  const fps = useAnimationStore((state) => state.fps);
  const endFrame = useAnimationStore((state) => state.endFrame);

  const activeAnimation = useMemo(
    () =>
      animations.find((animation) => animation.id === activeAnimationId) ??
      null,
    [animations, activeAnimationId],
  );

  return useMemo(
    () =>
      resolveEffectiveInspectorTarget({
        selection,
        nodes,
        bones,
        constraints,
        editorMode,
        activeBoneId,
        activeConstraintId,
        activeAnimation,
        currentTime,
        draftPose,
        loopKeyframes,
        fps,
        endFrame,
      }),
    [
      selection,
      nodes,
      bones,
      constraints,
      editorMode,
      activeBoneId,
      activeConstraintId,
      activeAnimation,
      currentTime,
      draftPose,
      loopKeyframes,
      fps,
      endFrame,
    ],
  );
}
