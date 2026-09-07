import type {
  AnimationTargetId,
  KeyframeAuthoringMeta,
} from "@kukla2d/contracts";

import type { DraftPoseValue } from "@/store/animationStoreTypes.types.js";

import type {
  AnimationAuthoringApi,
  AnimationCommitResult,
} from "@/features/animation";

type CanvasAuthoringResult =
  | { valid: true }
  | {
      valid: false;
      error?: string;
      reasonCode?:
        | "no_active_animation"
        | "no_authorable_properties"
        | "property_not_authorable"
        | "invalid_track_value";
      property?: string;
    };

interface CanvasAuthoringMeta {
  gestureId?: string;
  role?: KeyframeAuthoringMeta["role"];
  source?: string;
}

export interface CanvasAuthoringAdapter {
  beginGesture(): string;
  previewEdit: AnimationAuthoringApi["preview"];
  previewPartial(
    targetId: AnimationTargetId,
    partial: DraftPoseValue,
    meta?: CanvasAuthoringMeta,
  ): CanvasAuthoringResult;
  commitGesture(args?: { source?: string }): AnimationCommitResult;
  commitAndContinueGesture(args?: { source?: string }): AnimationCommitResult;
  endGesture(): void;
  cancelGesture(): void;
  getDraftState: AnimationAuthoringApi["getDraftState"];
}
