import type {
  AnimationId,
  AnimationTargetId,
  KeyframeAuthoringMeta,
} from "@kukla2d/contracts";

import type { DraftPose } from "@/store/animationStoreTypes.types.js";

interface AnimationEditIntent {
  animationId: AnimationId;
  targetId: AnimationTargetId;
  property: string;
  value: unknown;
  timeMs: number;
  phase: "preview";
  source?: string;
  gestureId?: string;
  role?: KeyframeAuthoringMeta["role"];
  allowContextTimeChange?: boolean;
}

export interface AnimationCommitResult {
  changed: boolean;
  affectedIds: string[];
  committedAddresses: string[];
  materializedCount?: number;
  error?: string;
  mode?: "draft" | "snapshot-core" | null;
}

export interface AnimationAuthoringApi {
  beginGesture(options?: { gestureId?: string }): string;
  preview(intent: AnimationEditIntent): { valid: boolean; error?: string };
  commit(args?: { source?: string }): AnimationCommitResult;
  commitAndContinueGesture(args?: { source?: string }): AnimationCommitResult;
  hasActiveGesture(): boolean;
  endGesture(): void;
  keySelected(args?: {
    targetIds?: readonly AnimationTargetId[];
    source?: string;
  }): AnimationCommitResult;
  discard(): void;
  cancelGesture(): void;
  checkNavigation():
    { allowed: true } | { allowed: false; reason: "pending-draft" };
  getDraftState(): {
    context: { animationId: AnimationId; timeMs: number } | null;
    dirty: boolean;
    revision: number;
    pose: DraftPose;
  };
}
