import { REASON_CODES } from "./editorModePolicy.js";

/**
 * Canonical feedback catalog — pure, no React/icons/store.
 *
 * K5: Each reasonCode maps to exactly one { message, tooltip, suggestedAction }.
 * Components never duplicate these texts; they consume this catalog.
 */

interface FeedbackEntry {
  message: string;
  tooltip: string;
  suggestedAction: string;
}

const FEEDBACK_BY_REASON: Readonly<Record<string, FeedbackEntry>> =
  Object.freeze({
    [REASON_CODES.ACTIVE_CLIP_REQUIRED]: Object.freeze({
      message: "Select or create an animation clip first.",
      tooltip: "Pose editing requires an active animation clip.",
      suggestedAction:
        "Create a new clip in the timeline or select an existing one.",
    }),
    [REASON_CODES.ANIMATION_CHANNEL_UNSUPPORTED]: Object.freeze({
      message: "This property cannot be animated.",
      tooltip: "The property is not an authorable animation channel.",
      suggestedAction: "Edit this property in Staging mode instead.",
    }),
    [REASON_CODES.STAGING_ONLY_STRUCTURE]: Object.freeze({
      message: "Structure changes are locked in Animation mode.",
      tooltip:
        "Creating, deleting, reparenting, linking, binding, remeshing, and weight editing modify the rig setup and are only available in Staging.",
      suggestedAction: "Switch to Staging mode to modify the rig structure.",
    }),
    [REASON_CODES.STAGING_ONLY_BONE_LENGTH]: Object.freeze({
      message: "Bone length defines the Staging rig.",
      tooltip:
        "Bone length is a setup-only property. To animate stretching, use Scale X.",
      suggestedAction: "Use Scale X to animate bone stretch.",
    }),
    [REASON_CODES.STAGING_ONLY_PIVOT]: Object.freeze({
      message: "Pivot is a setup-only property.",
      tooltip: "Pivot offsets define the rig origin and cannot be animated.",
      suggestedAction: "Adjust pivot in Staging mode.",
    }),
    [REASON_CODES.DIRTY_DRAFT]: Object.freeze({
      message: "Unsaved changes in the current pose.",
      tooltip:
        "You have unsaved animation pose changes. Discard, commit, or cancel before switching modes.",
      suggestedAction: "Commit, discard, or cancel the current draft.",
    }),
    [REASON_CODES.POSE_MUST_BE_RESOLVED]: Object.freeze({
      message: "Apply or reset the pose before editing setup.",
      tooltip:
        "A pose overlay is active. Setup edits require resolving the pose first.",
      suggestedAction:
        "Apply the pose to bake it into setup, or reset to discard.",
    }),
    [REASON_CODES.UNKNOWN_ACTION]: Object.freeze({
      message: "Unknown action.",
      tooltip: "This action is not recognized by the editor policy.",
      suggestedAction: "Report this as a bug.",
    }),
  });

const FALLBACK_ENTRY = Object.freeze({
  message: "Action not allowed.",
  tooltip: "This action is blocked by the current editor mode.",
  suggestedAction: "Check the current mode and try a different action.",
});

/**
 * K5 — Returns the feedback entry for a reason code.
 * Never returns undefined; unknown codes get a fallback.
 *
 * @param {string} reasonCode
 * @returns {FeedbackEntry}
 */
export function getFeedback(reasonCode: string): FeedbackEntry {
  return FEEDBACK_BY_REASON[reasonCode] ?? FALLBACK_ENTRY;
}

/**
 * Returns all registered reason codes.
 *
 * @returns {string[]}
 */
export function getAllReasonCodes(): string[] {
  return Object.keys(FEEDBACK_BY_REASON);
}
