import {
  toAnimationTargetId,
  type AnimationId,
  type AnimationTargetId,
  type KeyframeAuthoringMeta,
} from "@kukla2d/contracts";

import {
  isAuthorableProperty,
  validateTrackValue,
} from "./animationProperties.js";

import type { AnimationDraft } from "./animationDraftState.types.js";

type DraftChannelValue = unknown;

type DraftProvenance = Map<
  AnimationTargetId,
  Record<string, KeyframeAuthoringMeta>
>;

interface PreviewIntent {
  phase: "preview" | "commit";
  targetId: AnimationTargetId;
  property: string;
  value: unknown;
  gestureId?: string;
  role?: KeyframeAuthoringMeta["role"];
  source?: string;
}

type DraftSnapshot = Record<string, Record<string, DraftChannelValue>>;

export function createDraftContext(
  animationId: AnimationId,
  timeMs: number,
): AnimationDraft {
  return {
    context: { animationId, timeMs },
    values: new Map(),
    dirty: false,
    revision: 0,
  };
}

export function isDraftContextValid(
  draft: AnimationDraft | null | undefined,
  animationId: AnimationId,
  timeMs: number,
): boolean {
  if (!draft || !draft.context) return false;
  return (
    draft.context.animationId === animationId && draft.context.timeMs === timeMs
  );
}

export function snapshotDraftChannels(draft: AnimationDraft): DraftSnapshot {
  const snapshot: DraftSnapshot = {};
  for (const [targetId, partial] of draft.values)
    snapshot[targetId] = { ...partial };
  return snapshot;
}

export function restoreDraftFromSnapshot(
  draft: AnimationDraft,
  snapshot: DraftSnapshot,
): void {
  draft.values.clear();
  for (const [targetId, partial] of Object.entries(snapshot)) {
    draft.values.set(toAnimationTargetId(targetId), { ...partial });
  }
  draft.dirty = Object.keys(snapshot).length > 0;
  draft.revision++;
}

export function applyPreviewIntent(
  draft: AnimationDraft,
  intent: PreviewIntent,
  provenance?: DraftProvenance | null,
): { valid: false; error: string } | { valid: true } {
  if (intent.phase !== "preview") {
    return {
      valid: false,
      error: "applyPreviewIntent requires phase: preview",
    };
  }
  if (!isAuthorableProperty(intent.property)) {
    return {
      valid: false,
      error: `Property "${intent.property}" is not authorable`,
    };
  }
  if (!validateTrackValue(intent.property, intent.value)) {
    return { valid: false, error: `Invalid value for "${intent.property}"` };
  }
  const partial = draft.values.get(intent.targetId) ?? {};
  partial[intent.property] = intent.value;
  draft.values.set(intent.targetId, partial);
  draft.dirty = true;
  draft.revision++;
  if (provenance && intent.gestureId) {
    const meta = {
      gestureId: intent.gestureId,
      role: intent.role || "authored",
      source: intent.source || "gesture",
    };
    const targetMeta = provenance.get(intent.targetId)
      ? { ...provenance.get(intent.targetId) }
      : {};
    targetMeta[intent.property] = meta;
    provenance.set(intent.targetId, targetMeta);
  }
  return { valid: true };
}

export function clearDraftChannels(
  draft: AnimationDraft,
  targetIds: readonly AnimationTargetId[],
): void {
  for (const id of targetIds) draft.values.delete(id);
  draft.dirty = draft.values.size > 0;
  draft.revision++;
}

export function resetDraft(draft: AnimationDraft): void {
  draft.context = null;
  draft.values.clear();
  draft.dirty = false;
  draft.revision = 0;
}
