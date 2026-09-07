import { toAnimationTargetId } from "@kukla2d/contracts";

import { useAnimationStore } from "@/store/animationStore";
import { useProjectStore } from "@/store/projectStore";
import { transaction } from "@/store/undoHistory";

import {
  buildCommitBatch,
  buildManualKeyBatch,
  canNavigate,
} from "@/domain/animationAuthoring.js";
import { applyPreviewIntent } from "@/domain/animationDraftState.js";
import { computePoseOverrides } from "@/domain/animationEngine.js";
import { validateAnimationEditBatch } from "@/domain/animationKeyframeBatchCommands.js";
import { normalizeKeyframeAuthoring } from "@/domain/keyframeProvenance.js";

import { uid } from "@/lib/uid";

import type {
  AnimationAuthoringApi,
  AnimationCommitResult,
} from "./createAnimationAuthoringApi.types.js";

let _gestureId: string | null = null;

function generateGestureId(): string {
  return `gesture-${uid()}`;
}

/**
 * Creates the animation authoring API — the sole public boundary for
 * preview/commit/discard/manual-key operations.
 *
 * Consumers: inspector, canvas gestures, K shortcut.
 * No raw recipe or synthetic KeyboardEvent — this is the only path.
 *
 * @returns {AnimationAuthoringApi}
 */
export function createAnimationAuthoringApi(): AnimationAuthoringApi {
  return {
    /**
     * Start a new gesture transaction. Generates a stable gestureId
     * valid until commit/cancel/discard.
     *
     * @param {Object} [opts]
     * @param {string} [opts.gestureId] - optional explicit ID (for testing)
     * @returns {string} gestureId
     */
    beginGesture({ gestureId } = {}) {
      _gestureId = gestureId || generateGestureId();
      return _gestureId;
    },

    /**
     * Preview: merge a K2 intent into the draft.
     * Does NOT touch project history.
     *
     * @param {AnimationEditIntent} intent
     * @returns {{ valid: boolean, error?: string }}
     */
    preview(intent) {
      const animationState = useAnimationStore.getState();
      const ctx = animationState.draftContext;

      // Only canvas's continuing pointer gesture may move a clean draft to a
      // new playhead. Other callers retain their established draft context.
      if (
        !ctx ||
        ctx.animationId !== intent.animationId ||
        (intent.allowContextTimeChange &&
          animationState.draftPose.size === 0 &&
          ctx.timeMs !== intent.timeMs)
      ) {
        useAnimationStore.getState().setDraftContext({
          animationId: intent.animationId,
          timeMs: intent.timeMs,
        });
      }

      const intentWithMeta = {
        ...intent,
        gestureId: intent.gestureId || _gestureId || generateGestureId(),
        role: intent.role || "authored",
      };

      const draft = {
        context: useAnimationStore.getState().draftContext,
        values: new Map(animationState.draftPose),
        dirty: animationState.draftDirty,
        revision: animationState.draftRevision,
      };

      const provenance = new Map(animationState.draftAuthoring);

      const result = applyPreviewIntent(draft, intentWithMeta, provenance);
      if (!result.valid) return result;

      useAnimationStore.getState().setDraftPose(intent.targetId, {
        [intent.property]: intent.value,
      });
      useAnimationStore.getState().markDraftDirty();

      if (intentWithMeta.gestureId) {
        const meta = normalizeKeyframeAuthoring({
          gestureId: intentWithMeta.gestureId,
          role: intentWithMeta.role,
          source: intentWithMeta.source || "gesture",
        });
        if (meta) {
          useAnimationStore
            .getState()
            .setDraftAuthoring(intent.targetId, intent.property, meta);
        }
      }

      return { valid: true };
    },

    /**
     * Commit: flush draft channels into project via atomic batch (K7).
     * One undo entry. Clears committed draft channels on success.
     *
     * @param {Object} [args]
     * @param {string} [args.source] - 'auto-key' | 'manual-key' | 'gesture'
     * @returns {AnimationCommitResult}
     */
    commit({ source = "auto-key" } = {}) {
      const animationState = useAnimationStore.getState();
      const project = useProjectStore.getState().project;
      const ctx = animationState.draftContext;

      if (!ctx || animationState.draftPose.size === 0) {
        _gestureId = null;
        return { changed: false, affectedIds: [], committedAddresses: [] };
      }

      const loopStartMs =
        (animationState.startFrame / animationState.fps) * 1000;

      const { edits, committedAddresses, materializedCount } = buildCommitBatch(
        {
          draft: {
            context: ctx,
            values: animationState.draftPose,
          },
          project,
          loopStartMs,
          draftAuthoring: animationState.draftAuthoring,
        },
      );

      if (edits.length === 0) {
        _gestureId = null;
        return { changed: false, affectedIds: [], committedAddresses: [] };
      }

      const validation = validateAnimationEditBatch(project, edits);
      if (!validation.valid) {
        _gestureId = null;
        return {
          changed: false,
          affectedIds: [],
          committedAddresses: [],
          error: validation.error,
        };
      }

      const targetIds = [...animationState.draftPose.keys()];

      let commitResult: AnimationCommitResult = {
        changed: false,
        affectedIds: [],
        committedAddresses: [],
      };
      transaction(`Authoring commit (${source})`, "animation", () => {
        useProjectStore.getState().upsertAnimationKeyframes({
          animationId: ctx.animationId,
          keyframes: edits,
        });
        commitResult = {
          changed: true,
          affectedIds: [ctx.animationId, ...targetIds],
          committedAddresses,
          materializedCount: materializedCount || 0,
        };
      });

      useAnimationStore.getState().clearDraftChannelsForTargets(targetIds);
      useAnimationStore.getState().setDraftContext(null);
      _gestureId = null;

      return commitResult;
    },

    /**
     * Commit and continue gesture (K6).
     * Flushes draft to project but keeps gesture alive so the user can
     * keep dragging. Generates a fresh gesture ID for subsequent previews.
     *
     * @param {Object} [args]
     * @param {string} [args.source='in-air-key']
     * @returns {AnimationCommitResult}
     */
    commitAndContinueGesture({ source = "in-air-key" } = {}) {
      const animationState = useAnimationStore.getState();
      const ctx = animationState.draftContext;

      const result = this.commit({ source });

      if (result.changed && ctx) {
        useAnimationStore.getState().setDraftContext({
          animationId: ctx.animationId,
          timeMs: ctx.timeMs,
        });
        _gestureId = generateGestureId();
      }

      return result;
    },

    /** True only while the canvas adapter owns a live authoring gesture. */
    hasActiveGesture() {
      return _gestureId !== null;
    },

    /** End a pointer gesture without discarding its pending draft. */
    endGesture() {
      _gestureId = null;
    },

    /**
     * Manual K: when there's a pending draft, commit it.
     * When there's no draft, snapshot the selected targets and commit.
     *
     * @param {Object} args
     * @param {string[]} args.targetIds
     * @param {string} [args.source]
     * @returns {AnimationCommitResult}
     */
    keySelected({ targetIds = [], source = "manual-key" } = {}) {
      const animationState = useAnimationStore.getState();

      if (animationState.draftDirty && animationState.draftPose.size > 0) {
        const result = this.commit({ source });
        return { ...result, mode: "draft" };
      }

      if (targetIds.length === 0) {
        return {
          changed: false,
          affectedIds: [],
          committedAddresses: [],
          mode: null,
        };
      }

      const gestureId = _gestureId || generateGestureId();

      const project = useProjectStore.getState().project;
      const animId =
        animationState.activeAnimationId ?? project.animations?.[0]?.id;
      if (!animId) {
        return {
          changed: false,
          affectedIds: [],
          committedAddresses: [],
          mode: null,
        };
      }

      const loopStartMs =
        (animationState.startFrame / animationState.fps) * 1000;
      const endMs = (animationState.endFrame / animationState.fps) * 1000;

      const activeAnimObj =
        project.animations.find((a) => a.id === animId) ?? null;
      const keyframeOverrides = computePoseOverrides(
        activeAnimObj,
        animationState.currentTime,
        animationState.loopKeyframes,
        endMs,
      );

      const { edits, committedAddresses, materializedCount } =
        buildManualKeyBatch({
          animationId: animId,
          targetIds,
          timeMs: animationState.currentTime,
          loopStartMs,
          project,
          keyframeOverrides: new Map(
            [...keyframeOverrides].map(([targetId, value]) => [
              toAnimationTargetId(targetId),
              value,
            ]),
          ),
          restPose: animationState.restPose,
          gestureId,
          source,
        });

      if (edits.length === 0) {
        _gestureId = null;
        return {
          changed: false,
          affectedIds: [],
          committedAddresses: [],
          mode: null,
        };
      }

      const validation = validateAnimationEditBatch(project, edits);
      if (!validation.valid) {
        _gestureId = null;
        return {
          changed: false,
          affectedIds: [],
          committedAddresses: [],
          error: validation.error,
          mode: null,
        };
      }

      let commitResult: AnimationCommitResult = {
        changed: false,
        affectedIds: [],
        committedAddresses: [],
      };
      transaction(`Manual key (${source})`, "animation", () => {
        useProjectStore.getState().upsertAnimationKeyframes({
          animationId: animId,
          keyframes: edits,
        });
        commitResult = {
          changed: true,
          affectedIds: [animId, ...targetIds],
          committedAddresses,
          materializedCount: materializedCount || 0,
          mode: "snapshot-core",
        };
      });

      for (const id of targetIds) {
        useAnimationStore.getState().clearDraftPoseForNode(id);
      }
      _gestureId = null;

      return commitResult;
    },

    /**
     * Discard: throw away the pending draft without writing to project.
     */
    discard() {
      useAnimationStore.getState().setDraftContext(null);
      useAnimationStore.getState().clearDraftPose();
      useAnimationStore.setState({ draftDirty: false, draftRevision: 0 });
      _gestureId = null;
    },

    /**
     * Cancel the current gesture (alias for discard with provenance cleanup).
     */
    cancelGesture() {
      this.discard();
    },

    /**
     * Check if navigation is allowed (R7).
     * Returns { allowed, reason? }.
     */
    checkNavigation() {
      const animationState = useAnimationStore.getState();
      return canNavigate({
        dirty: animationState.draftDirty,
        values: animationState.draftPose,
      });
    },

    /**
     * Get the current draft state snapshot (for UI rendering).
     */
    getDraftState() {
      const animationState = useAnimationStore.getState();
      return {
        context: animationState.draftContext,
        dirty: animationState.draftDirty,
        revision: animationState.draftRevision,
        pose: animationState.draftPose,
      };
    },
  };
}
