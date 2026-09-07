import type { AnimationModifier } from "@kukla2d/contracts";

let currentDraft: AnimationModifier | null = null;

export function setPreviewModifierDraft(draft: AnimationModifier | null): void {
  currentDraft = draft;
}

export function getPreviewModifierDraft(): AnimationModifier | null {
  return currentDraft;
}

export function clearPreviewModifierDraft(): void {
  currentDraft = null;
}
