import { useAnimationStore } from "@/store/animationStore";
import { useEditorStore } from "@/store/editorStore";

import {
  isAuthorableProperty,
  validateTrackValue,
} from "@/domain/animationProperties";

import { createAnimationAuthoringApi } from "@/features/animation";

import type { CanvasAuthoringAdapter } from "./createCanvasAuthoringAdapter.types.js";

function readActiveTool(state: object): string | undefined {
  if (!("activeTool" in state)) return undefined;
  const value = state.activeTool;
  return typeof value === "string" ? value : undefined;
}

export function createCanvasAuthoringAdapter(): CanvasAuthoringAdapter {
  const api = createAnimationAuthoringApi();
  let adapterGestureId: string | null = null;

  return {
    /**
     * Begin a new gesture. Returns a stable gestureId for the transaction.
     * @returns {string} gestureId
     */
    beginGesture() {
      adapterGestureId = api.beginGesture(
        adapterGestureId ? { gestureId: adapterGestureId } : undefined,
      );
      return adapterGestureId;
    },

    previewEdit(intent) {
      return api.preview(intent);
    },

    previewPartial(targetId, partial, meta) {
      const animationState = useAnimationStore.getState();
      const editorState = useEditorStore.getState();
      if (editorState.editorMode !== "animation") {
        if (readActiveTool(editorState) !== "pose")
          return { valid: false, error: "not animation or pose mode" };
        useAnimationStore.getState().setDraftPose(targetId, partial);
        return { valid: true };
      }
      const animId = animationState.activeAnimationId;
      if (!animId) return { valid: false, reasonCode: "no_active_animation" };
      const timeMs = animationState.currentTime;
      const entries = Object.entries(partial);
      if (entries.length === 0) {
        return { valid: false, reasonCode: "no_authorable_properties" };
      }
      for (const [property, value] of entries) {
        if (!isAuthorableProperty(property)) {
          return {
            valid: false,
            reasonCode: "property_not_authorable",
            property,
          };
        }
        if (!validateTrackValue(property, value)) {
          return { valid: false, reasonCode: "invalid_track_value", property };
        }
      }
      const gestureId = meta?.gestureId || adapterGestureId;
      const role = meta?.role || "authored";
      const source = meta?.source || "gesture";
      for (const [property, value] of entries) {
        const result = api.preview({
          animationId: animId,
          targetId,
          property,
          value,
          timeMs,
          source,
          ...(gestureId ? { gestureId } : {}),
          role,
          phase: "preview",
          allowContextTimeChange: api.hasActiveGesture(),
        });
        if (!result.valid) return result;
      }
      return { valid: true };
    },

    commitGesture({ source = "auto-key" } = {}) {
      adapterGestureId = null;
      return api.commit({ source });
    },

    commitAndContinueGesture({ source = "in-air-key" } = {}) {
      const result = api.commitAndContinueGesture({ source });
      if (result.changed) {
        adapterGestureId = null;
      }
      return result;
    },

    endGesture() {
      adapterGestureId = null;
      api.endGesture();
    },

    cancelGesture() {
      adapterGestureId = null;
      api.cancelGesture();
    },

    getDraftState() {
      return api.getDraftState();
    },
  };
}
