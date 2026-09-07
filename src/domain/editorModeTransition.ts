import { canNavigate } from "./animationAuthoring.js";

type EditorMode = "staging" | "animation";
type TransitionResult = "changed" | "unchanged" | "blocked-draft";

interface EditorModeTransitionResult {
  result: TransitionResult;
  reason?: string;
}

interface EditorModeTransitionInput {
  currentMode: EditorMode;
  nextMode: EditorMode;
  draftState?: { dirty: boolean; values: { size: number } | null };
  hasActiveClip?: boolean;
}

/**
 * K6 — Pure mode transition decision.
 * No React, no Zustand, no side effects.
 *
 * @typedef {'changed'|'unchanged'|'blocked-draft'} TransitionResult
 *
 * @param {Object} input
 * @param {'staging'|'animation'} input.currentMode
 * @param {'staging'|'animation'} input.nextMode
 * @param {{ dirty: boolean, values: { size: number } | null }} [input.draftState]
 * @param {boolean} [input.hasActiveClip]
 * @returns {{ result: TransitionResult, reason?: string }}
 */
export function requestEditorMode({
  currentMode,
  nextMode,
  draftState,
}: EditorModeTransitionInput): EditorModeTransitionResult {
  if (currentMode === nextMode) {
    return { result: "unchanged" };
  }

  if (nextMode === "animation") {
    return { result: "changed" };
  }

  if (nextMode === "staging") {
    if (draftState) {
      const nav = canNavigate(draftState);
      if (!nav.allowed) {
        return nav.reason
          ? { result: "blocked-draft", reason: nav.reason }
          : { result: "blocked-draft" };
      }
    }
    return { result: "changed" };
  }

  return { result: "unchanged" };
}
