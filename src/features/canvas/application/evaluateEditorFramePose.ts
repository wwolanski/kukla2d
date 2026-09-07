import type { AnimationModifier, ProjectDocument } from "@kukla2d/contracts";

import type { AnimationState } from "@/store/animationStoreTypes.types.js";

import {
  evaluateAnimationModifiers,
  evaluateReactionModifiers,
} from "@/domain/autoMotion/modifierEvaluation.js";

import { buildFramePose } from "@/features/canvas/domain/framePose.js";
import type { FramePose } from "@/features/canvas/domain/framePose.types.js";

import type { CanvasEditorSnapshot } from "./canvasApplication.types.js";
import type { PhysicsRuntime } from "./evaluateEditorFramePose.types.js";

interface EvaluateEditorFramePoseArgs {
  project: ProjectDocument;
  editorState: CanvasEditorSnapshot;
  animationState: AnimationState;
  physicsRuntime: PhysicsRuntime | null;
  timestamp: number;
  previewModifierDraft?: AnimationModifier | null;
}

/**
 * Single named orchestrator for editor frame evaluation.
 *
 * Pipeline: time modifiers → pre-frame → reaction modifiers → final frame.
 *  0. evaluateAnimationModifiers (time procedural pose overrides)
 *  1. buildFramePose with time modifierPoseOverrides (pre-reaction frame)
 *  2. evaluateReactionModifiers from pre-reaction effectiveBones
 *  3. merge reaction overrides into combined modifier overrides
 *  4. buildFramePose with combined overrides (pre-physics frame)
 *  5. physics adapter evaluate on pre-physics effectiveBones
 *  6. buildFramePose with runtime overrides only when physics returns overrides
 *
 * Pure function — no React, Zustand, DOM, Pixi, or rAF.
 *
 * @param {Object} args
 * @param {Object} args.project          - canonical document
 * @param {Object} args.editorState      - editor store snapshot
 * @param {Object} args.animationState   - animation store snapshot
 * @param {Object|null} args.physicsRuntime - stateful physics adapter (with .evaluate())
 * @param {number} args.timestamp        - rAF timestamp in ms
 * @param {Map}    [args.previewModifierDraft] - optional wizard preview modifier (Etap 06+)
 * @returns {{ poseOverrides: Map|null, effectiveNodes: Array, effectiveBones: Array, physicsActive: boolean }}
 */
export function evaluateEditorFramePose({
  project,
  editorState,
  animationState,
  physicsRuntime,
  timestamp,
  previewModifierDraft,
}: EvaluateEditorFramePoseArgs): FramePose {
  const activeAnimationId = animationState?.activeAnimationId ?? null;
  const transportTimeMs = Number.isFinite(animationState?.currentTime)
    ? animationState.currentTime
    : (timestamp ?? 0);
  const liveTimeMs = Number.isFinite(timestamp) ? timestamp : transportTimeMs;
  const timeMs =
    editorState?.editorMode === "animation" || animationState?.isPlaying
      ? transportTimeMs
      : liveTimeMs;

  const timeModifierPoseOverrides = evaluateAnimationModifiers({
    project,
    activeAnimationId,
    timeMs,
    ...(previewModifierDraft === undefined ? {} : { previewModifierDraft }),
  });

  const preReactionFrame = buildFramePose({
    project,
    editorState,
    animationState,
    modifierPoseOverrides: timeModifierPoseOverrides,
  });

  const reactionOverrides = evaluateReactionModifiers({
    project,
    activeAnimationId,
    effectiveBones: preReactionFrame.effectiveBones,
    poseOverrides: preReactionFrame.poseOverrides,
  });

  const combinedModifierOverrides = new Map(timeModifierPoseOverrides);
  if (reactionOverrides?.size) {
    for (const [targetId, partial] of reactionOverrides) {
      const existing = combinedModifierOverrides.get(targetId) ?? {};
      combinedModifierOverrides.set(targetId, { ...existing, ...partial });
    }
  }

  const prePhysicsFrame = buildFramePose({
    project,
    editorState,
    animationState,
    modifierPoseOverrides: combinedModifierOverrides,
  });

  if (!physicsRuntime?.evaluate) {
    return prePhysicsFrame;
  }

  const physicsResult = physicsRuntime.evaluate({
    project,
    effectiveBones: prePhysicsFrame.effectiveBones,
    timestamp,
    enabled: editorState.activeTool === "pose",
  });

  if (!physicsResult.overrides?.size) {
    return { ...prePhysicsFrame, physicsActive: physicsResult.active };
  }

  return buildFramePose({
    project,
    editorState,
    animationState,
    modifierPoseOverrides: combinedModifierOverrides,
    runtimePoseOverrides: physicsResult.overrides,
  });
}
