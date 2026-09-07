import {
  isAuthorableProperty,
  isPropertyAllowedForTargetKind,
} from "./animationProperties.js";

import type { AnimationTargetKind } from "./animationProperties.types.js";

type PolicyTargetKind =
  AnimationTargetKind | "image" | "tool" | "navigation" | "modeTransition";
type EditorActionChannel =
  | "animation-channel"
  | "setup-structure"
  | "navigation"
  | "blocked"
  | "mode-transition";

interface EditorActionDecision {
  allowed: boolean;
  mode: string;
  actionId: string;
  channel: EditorActionChannel;
  reasonCode?: string;
  message?: string;
  suggestedAction?: string;
}

interface EditorModePolicyInput {
  mode: string;
  actionId: string;
  targetKind?: PolicyTargetKind;
  property?: string;
  draftDirty?: boolean;
}

/**
 * Canonical editor-mode policy — pure, no React/Zustand/DOM/Pixi.
 *
 * Contracts:
 *   K1 — EditorActionDecision DTO
 *   K2 — editorModePolicy(input) -> decision
 *   K4 — delegates property authorability to animationProperties
 *   K5 — reason codes map 1:1 to feedback entries
 *   K12 — invalid preview returns valid:false with reasonCode
 */

/** @typedef {'staging'|'animation'} EditorMode */

/** @typedef {'node'|'bone'|'constraint'|'slot'|'image'|'tool'|'navigation'|'modeTransition'} TargetKind */

/**
 * Discriminated action catalog.
 * Every call-site uses one of these IDs.
 */
export const ACTION_IDS = Object.freeze({
  // Node transform
  NODE_MOVE: "node.move",
  NODE_ROTATE: "node.rotate",
  NODE_SCALE: "node.scale",
  // Node appearance
  NODE_OPACITY: "node.opacity",
  NODE_VISIBLE: "node.visible",
  NODE_DRAW_ORDER: "node.drawOrder",
  // Node mesh
  NODE_MESH_DEFORM: "node.meshDeform",
  NODE_BLEND_SHAPE: "node.blendShape",
  // Bone transform
  BONE_MOVE: "bone.move",
  BONE_ROTATE: "bone.rotate",
  BONE_SCALE: "bone.scale",
  // Bone setup-only
  BONE_LENGTH: "bone.length",
  BONE_PIVOT: "bone.pivot",
  // Constraint
  CONSTRAINT_EDIT: "constraint.edit",
  // Structure — bones
  BONE_CREATE: "bone.create",
  BONE_DELETE: "bone.delete",
  BONE_REPARENT: "bone.reparent",
  BONE_RENAME: "bone.rename",
  // Structure — IK
  IK_CREATE: "ik.create",
  IK_ASSIGN: "ik.assign",
  // Structure — topology / weights
  REMESH: "remesh",
  WEIGHTS_EDIT: "weights.edit",
  // Structure — links
  LINK_TOGGLE: "link.toggle",
  BIND_TOGGLE: "bind.toggle",
  // Slots
  SLOT_CREATE: "slot.create",
  SLOT_DELETE: "slot.delete",
  // Hierarchy
  HIERARCHY_REORDER: "hierarchy.reorder",
  // Library organization (R13 — allowed in both modes)
  RENAME: "rename",
  LIBRARY_ORGANIZE: "library.organize",
  // Navigation — always allowed
  SELECTION: "selection",
  ZOOM: "zoom",
  PAN: "pan",
  PLAYBACK: "playback",
  // Mode transition
  MODE_SWITCH: "mode.switch",
});

/** @typedef {keyof typeof ACTION_IDS} ActionId */

/**
 * Reason codes — stable, no duplication across components.
 * K5: each code maps to exactly one feedback entry.
 */
export const REASON_CODES = Object.freeze({
  ACTIVE_CLIP_REQUIRED: "ACTIVE_CLIP_REQUIRED",
  ANIMATION_CHANNEL_UNSUPPORTED: "ANIMATION_CHANNEL_UNSUPPORTED",
  STAGING_ONLY_STRUCTURE: "STAGING_ONLY_STRUCTURE",
  STAGING_ONLY_BONE_LENGTH: "STAGING_ONLY_BONE_LENGTH",
  STAGING_ONLY_PIVOT: "STAGING_ONLY_PIVOT",
  DIRTY_DRAFT: "DIRTY_DRAFT",
  POSE_MUST_BE_RESOLVED: "POSE_MUST_BE_RESOLVED",
  UNKNOWN_ACTION: "UNKNOWN_ACTION",
});

/**
 * K1 — Pure DTO returned by the policy.
 *
 * @typedef {Object} EditorActionDecision
 * @property {boolean} allowed
 * @property {EditorMode} mode
 * @property {string} actionId
 * @property {'animation-channel'|'setup-structure'|'navigation'|'blocked'|'mode-transition'} channel
 * @property {string} [reasonCode]
 * @property {string} [message]
 * @property {string} [suggestedAction]
 */

// ── Action classification tables ──────────────────────────────────────────────

/**
 * Staging policy: which actions are allowed in staging mode.
 * true = allowed, false = blocked.
 */
const STAGING_ALLOWED: Readonly<Record<string, boolean>> = Object.freeze({
  [ACTION_IDS.NODE_MOVE]: true,
  [ACTION_IDS.NODE_ROTATE]: true,
  [ACTION_IDS.NODE_SCALE]: true,
  [ACTION_IDS.NODE_OPACITY]: true,
  [ACTION_IDS.NODE_VISIBLE]: true,
  [ACTION_IDS.NODE_DRAW_ORDER]: true,
  [ACTION_IDS.NODE_MESH_DEFORM]: true,
  [ACTION_IDS.NODE_BLEND_SHAPE]: true,
  [ACTION_IDS.BONE_MOVE]: true,
  [ACTION_IDS.BONE_ROTATE]: true,
  [ACTION_IDS.BONE_SCALE]: true,
  [ACTION_IDS.BONE_LENGTH]: true,
  [ACTION_IDS.BONE_PIVOT]: true,
  [ACTION_IDS.CONSTRAINT_EDIT]: true,
  [ACTION_IDS.BONE_CREATE]: true,
  [ACTION_IDS.BONE_DELETE]: true,
  [ACTION_IDS.BONE_REPARENT]: true,
  [ACTION_IDS.BONE_RENAME]: true,
  [ACTION_IDS.IK_CREATE]: true,
  [ACTION_IDS.IK_ASSIGN]: true,
  [ACTION_IDS.REMESH]: true,
  [ACTION_IDS.WEIGHTS_EDIT]: true,
  [ACTION_IDS.LINK_TOGGLE]: true,
  [ACTION_IDS.BIND_TOGGLE]: true,
  [ACTION_IDS.SLOT_CREATE]: true,
  [ACTION_IDS.SLOT_DELETE]: true,
  [ACTION_IDS.HIERARCHY_REORDER]: true,
  [ACTION_IDS.RENAME]: true,
  [ACTION_IDS.LIBRARY_ORGANIZE]: true,
  [ACTION_IDS.SELECTION]: true,
  [ACTION_IDS.ZOOM]: true,
  [ACTION_IDS.PAN]: true,
  [ACTION_IDS.PLAYBACK]: true,
  [ACTION_IDS.MODE_SWITCH]: true,
});

/**
 * Animation policy: which actions are allowed in animation mode.
 * true = allowed, false = blocked.
 */
const ANIMATION_ALLOWED: Readonly<Record<string, boolean>> = Object.freeze({
  [ACTION_IDS.NODE_MOVE]: true,
  [ACTION_IDS.NODE_ROTATE]: true,
  [ACTION_IDS.NODE_SCALE]: true,
  [ACTION_IDS.NODE_OPACITY]: true,
  [ACTION_IDS.NODE_VISIBLE]: true,
  [ACTION_IDS.NODE_DRAW_ORDER]: true,
  [ACTION_IDS.NODE_MESH_DEFORM]: true,
  [ACTION_IDS.NODE_BLEND_SHAPE]: true,
  [ACTION_IDS.BONE_MOVE]: true,
  [ACTION_IDS.BONE_ROTATE]: true,
  [ACTION_IDS.BONE_SCALE]: true,
  [ACTION_IDS.BONE_LENGTH]: false,
  [ACTION_IDS.BONE_PIVOT]: false,
  [ACTION_IDS.CONSTRAINT_EDIT]: true,
  [ACTION_IDS.BONE_CREATE]: false,
  [ACTION_IDS.BONE_DELETE]: false,
  [ACTION_IDS.BONE_REPARENT]: false,
  [ACTION_IDS.BONE_RENAME]: true,
  [ACTION_IDS.IK_CREATE]: false,
  [ACTION_IDS.IK_ASSIGN]: false,
  [ACTION_IDS.REMESH]: false,
  [ACTION_IDS.WEIGHTS_EDIT]: false,
  [ACTION_IDS.LINK_TOGGLE]: false,
  [ACTION_IDS.BIND_TOGGLE]: false,
  [ACTION_IDS.SLOT_CREATE]: false,
  [ACTION_IDS.SLOT_DELETE]: false,
  [ACTION_IDS.HIERARCHY_REORDER]: false,
  [ACTION_IDS.RENAME]: true,
  [ACTION_IDS.LIBRARY_ORGANIZE]: true,
  [ACTION_IDS.SELECTION]: true,
  [ACTION_IDS.ZOOM]: true,
  [ACTION_IDS.PAN]: true,
  [ACTION_IDS.PLAYBACK]: true,
  [ACTION_IDS.MODE_SWITCH]: true,
});

/**
 * Action -> reason code for blocked-in-animation actions.
 */
const ANIMATION_BLOCK_REASON: Readonly<Record<string, string>> = Object.freeze({
  [ACTION_IDS.BONE_LENGTH]: REASON_CODES.STAGING_ONLY_BONE_LENGTH,
  [ACTION_IDS.BONE_PIVOT]: REASON_CODES.STAGING_ONLY_PIVOT,
  [ACTION_IDS.BONE_CREATE]: REASON_CODES.STAGING_ONLY_STRUCTURE,
  [ACTION_IDS.BONE_DELETE]: REASON_CODES.STAGING_ONLY_STRUCTURE,
  [ACTION_IDS.BONE_REPARENT]: REASON_CODES.STAGING_ONLY_STRUCTURE,
  [ACTION_IDS.IK_CREATE]: REASON_CODES.STAGING_ONLY_STRUCTURE,
  [ACTION_IDS.IK_ASSIGN]: REASON_CODES.STAGING_ONLY_STRUCTURE,
  [ACTION_IDS.REMESH]: REASON_CODES.STAGING_ONLY_STRUCTURE,
  [ACTION_IDS.WEIGHTS_EDIT]: REASON_CODES.STAGING_ONLY_STRUCTURE,
  [ACTION_IDS.LINK_TOGGLE]: REASON_CODES.STAGING_ONLY_STRUCTURE,
  [ACTION_IDS.BIND_TOGGLE]: REASON_CODES.STAGING_ONLY_STRUCTURE,
  [ACTION_IDS.SLOT_CREATE]: REASON_CODES.STAGING_ONLY_STRUCTURE,
  [ACTION_IDS.SLOT_DELETE]: REASON_CODES.STAGING_ONLY_STRUCTURE,
  [ACTION_IDS.HIERARCHY_REORDER]: REASON_CODES.STAGING_ONLY_STRUCTURE,
});

// ── Property-channel helpers (K4 delegation) ──────────────────────────────────

/**
 * Returns true if the given action is a property-edit action
 * that should be validated against the animation property registry.
 *
 * @param {string} actionId
 * @returns {boolean}
 */
function isPropertyAction(actionId: string): boolean {
  return (
    actionId.startsWith("node.") ||
    actionId.startsWith("bone.") ||
    actionId === ACTION_IDS.CONSTRAINT_EDIT
  );
}

/**
 * Map actionId + targetKind to the animation property name for K4 validation.
 *
 * @param {string} actionId
 * @param {TargetKind} targetKind
 * @returns {string|null}
 */
function actionToProperty(
  actionId: string,
  targetKind?: PolicyTargetKind,
): string | null {
  if (targetKind === "constraint") return "targetX";

  const map: Readonly<Record<string, string>> = {
    [ACTION_IDS.NODE_MOVE]: "x",
    [ACTION_IDS.NODE_ROTATE]: "rotation",
    [ACTION_IDS.NODE_SCALE]: "scaleX",
    [ACTION_IDS.NODE_OPACITY]: "opacity",
    [ACTION_IDS.NODE_VISIBLE]: "visible",
    [ACTION_IDS.NODE_DRAW_ORDER]: "drawOrder",
    [ACTION_IDS.NODE_MESH_DEFORM]: "mesh_verts",
    [ACTION_IDS.BONE_MOVE]: "x",
    [ACTION_IDS.BONE_ROTATE]: "rotation",
    [ACTION_IDS.BONE_SCALE]: "scaleX",
    [ACTION_IDS.BONE_LENGTH]: "length",
    [ACTION_IDS.BONE_PIVOT]: "pivotX",
  };
  return map[actionId] ?? null;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * K2 — Pure decision function.
 *
 * @param {Object} input
 * @param {EditorMode} input.mode - Current editor mode.
 * @param {string} input.actionId - Action ID from ACTION_IDS.
 * @param {TargetKind} [input.targetKind] - What the action targets.
 * @param {string} [input.property] - Animation property name (for property actions).
 * @param {boolean} [input.draftDirty] - Whether the draft is dirty.
 * @returns {EditorActionDecision}
 */
export function editorModePolicy({
  mode,
  actionId,
  targetKind,
  property,
  draftDirty,
}: EditorModePolicyInput): EditorActionDecision {
  if (mode !== "staging" && mode !== "animation") {
    return {
      allowed: false,
      mode,
      actionId,
      channel: "blocked",
      reasonCode: REASON_CODES.UNKNOWN_ACTION,
      message: `Unknown editor mode "${mode}".`,
      suggestedAction: "Reload the editor.",
    };
  }

  const table = mode === "staging" ? STAGING_ALLOWED : ANIMATION_ALLOWED;
  const allowedInMode = table[actionId];

  if (allowedInMode === undefined) {
    return {
      allowed: false,
      mode,
      actionId,
      channel: "blocked",
      reasonCode: REASON_CODES.UNKNOWN_ACTION,
      message: `Unknown action "${actionId}".`,
      suggestedAction: "Report this as a bug.",
    };
  }

  if (!allowedInMode) {
    const reasonCode =
      ANIMATION_BLOCK_REASON[actionId] ??
      REASON_CODES.ANIMATION_CHANNEL_UNSUPPORTED;
    return {
      allowed: false,
      mode,
      actionId,
      channel: "blocked",
      reasonCode,
    };
  }

  // Animation-specific guards for allowed actions
  if (mode === "animation") {
    // Navigation actions are always allowed when in the table
    if (
      actionId === ACTION_IDS.SELECTION ||
      actionId === ACTION_IDS.ZOOM ||
      actionId === ACTION_IDS.PAN ||
      actionId === ACTION_IDS.PLAYBACK
    ) {
      return {
        allowed: true,
        mode,
        actionId,
        channel: "navigation",
      };
    }

    // Mode switch with dirty draft
    if (actionId === ACTION_IDS.MODE_SWITCH && draftDirty) {
      return {
        allowed: false,
        mode,
        actionId,
        channel: "blocked",
        reasonCode: REASON_CODES.DIRTY_DRAFT,
      };
    }

    // Property-channel validation (K4)
    if (isPropertyAction(actionId) && property) {
      const animProperty = actionToProperty(actionId, targetKind);
      if (animProperty && !isAuthorableProperty(animProperty)) {
        return {
          allowed: false,
          mode,
          actionId,
          channel: "blocked",
          reasonCode: REASON_CODES.ANIMATION_CHANNEL_UNSUPPORTED,
        };
      }
      if (
        animProperty &&
        targetKind &&
        (targetKind === "node" ||
          targetKind === "bone" ||
          targetKind === "constraint" ||
          targetKind === "slot") &&
        !isPropertyAllowedForTargetKind(animProperty, targetKind)
      ) {
        return {
          allowed: false,
          mode,
          actionId,
          channel: "blocked",
          reasonCode: REASON_CODES.ANIMATION_CHANNEL_UNSUPPORTED,
        };
      }
    }

    return {
      allowed: true,
      mode,
      actionId,
      channel: "animation-channel",
    };
  }

  // Staging: everything in the table is allowed
  return {
    allowed: true,
    mode,
    actionId,
    channel: "setup-structure",
  };
}
