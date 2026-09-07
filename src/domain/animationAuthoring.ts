/**
 * Pure animation authoring rules — no React, Zustand, DOM, Pixi, or Worker.
 *
 * Contracts:
 *   K2 — AnimationEditIntent
 *   K3 — AnimationDraftState
 *   K4 — AnimationCommitResult
 *
 * Rules:
 *   R3 — preview writes draft; commit writes named project commands
 *   R4 — manual K snapshots selected targets when no draft exists
 *   R5 — new track at non-start time gets baseline at loop start
 *   R6 — draft identity: context {animationId, timeMs}
 *   R8 — pointer-move → preview; pointer-up auto-key = one transaction
 */

import type {
  Animation,
  AnimationId,
  AnimationTargetId,
  Bone,
  Constraint,
  KeyframeAuthoringMeta,
  Node,
  ProjectDocument,
} from "@kukla2d/contracts";

import type { UpsertAnimationKeyframePayload } from "./animationCommandTypes.types.js";
import type { AnimationDraft } from "./animationDraftState.types.js";

interface AnimationCommitBatch {
  edits: UpsertAnimationKeyframePayload[];
  committedAddresses: string[];
  materializedCount?: number;
}

type RestPose = ReadonlyMap<AnimationTargetId, object>;
type PoseOverrides = Map<AnimationTargetId, Record<string, unknown>>;
type AnimationTarget = Node | Bone | Constraint;

interface KeyframeEditBuildInput {
  animationId: AnimationId;
  timeMs: number;
  loopStartMs: number;
  _endMs?: number;
  targetId: AnimationTargetId;
  property: string;
  currentValue: unknown;
  node?: Node;
  bone?: Bone;
  constraint?: Constraint;
  restPose?: RestPose | null;
}

/**
 * Build baseline keyframe edits for R5: when a property is first keyed
 * at a time > loopStart, insert a baseline at loopStart with the
 * setup/default value.
 *
 * Pure — does not touch the project.
 *
 * @param {Object} args
 * @param {string} args.animationId
 * @param {number} args.timeMs - Current playhead
 * @param {number} args.loopStartMs - Loop start in ms
 * @param {number} args.endMs - Loop end in ms
 * @param {string} args.targetId
 * @param {string} args.property
 * @param {unknown} args.currentValue - Value to key at timeMs
 * @param {Object} args.node - The target node (for getNodePropertyValue fallback)
 * @param {Object} [args.bone] - The target bone (for bone properties)
 * @param {Object} [args.constraint] - The target constraint
 * @param {Map} args.restPose - Rest pose map
 * @returns {{ edits: Array<{animationId,targetId,property,timeMs,value,easing}>, baseline?: {animationId,targetId,property,timeMs,value,easing} }}
 */
export function buildKeyframeEdits({
  animationId,
  timeMs,
  loopStartMs,
  targetId,
  property,
  currentValue,
  node,
  bone,
  constraint,
  restPose,
}: KeyframeEditBuildInput): {
  edits: UpsertAnimationKeyframePayload[];
  baseline: UpsertAnimationKeyframePayload | null;
} {
  const edits: UpsertAnimationKeyframePayload[] = [];
  let baseline: UpsertAnimationKeyframePayload | null = null;

  const fallbackValue = getDefaultValue(
    property,
    node,
    bone,
    constraint,
    restPose,
    targetId,
  );

  const valueToKey = currentValue !== undefined ? currentValue : fallbackValue;

  edits.push({
    animationId,
    targetId,
    property,
    timeMs,
    value: valueToKey,
    easing: "linear",
  });

  if (timeMs > loopStartMs) {
    baseline = {
      animationId,
      targetId,
      property,
      timeMs: loopStartMs,
      value: fallbackValue,
      easing: "linear",
    };
  }

  return { edits, baseline };
}

/**
 * Build a complete commit batch from draft values.
 * Handles R5 baselines for all channels with provenance metadata.
 *
 * Pure — does not touch the project.
 *
 * @param {Object} args
 * @param {Object} args.draft - K3 draft state
 * @param {Object} args.project - Project state
 * @param {number} args.loopStartMs
 * @param {Map<string, Record<string, Object>>} [args.draftAuthoring] - parallel provenance map
 * @returns {{ edits: Array, committedAddresses: string[], materializedCount?: number }}
 */
export function buildCommitBatch({
  draft,
  project,
  loopStartMs,
  draftAuthoring,
}: {
  draft: Pick<AnimationDraft, "context" | "values">;
  project: ProjectDocument;
  loopStartMs: number;
  draftAuthoring?: Map<string, Record<string, KeyframeAuthoringMeta>>;
}): AnimationCommitBatch {
  const edits: UpsertAnimationKeyframePayload[] = [];
  const committedAddresses: string[] = [];
  let materializedCount = 0;

  const draftContext = draft.context;
  const animation = project.animations?.find(
    (a) => a.id === draftContext?.animationId,
  );
  if (!animation || !draftContext) return { edits, committedAddresses };

  const timeMs = draftContext.timeMs;

  for (const [targetId, partial] of draft.values) {
    for (const [property, value] of Object.entries(partial)) {
      const node = project.nodes?.find((n) => n.id === targetId);
      const bone = project.bones?.find((b) => b.id === targetId);
      const constraint = project.constraints?.find((c) => c.id === targetId);

      if (!node && !bone && !constraint) continue;

      const fallbackValue = getDefaultValue(
        property,
        node,
        bone,
        constraint,
        null,
        targetId,
      );
      const valueToKey = value ?? fallbackValue;

      const meta = draftAuthoring?.get(targetId)?.[property] || null;

      edits.push({
        animationId: animation.id,
        targetId,
        property,
        timeMs,
        value: valueToKey,
        easing: "linear",
        ...(meta ? { authoring: { ...meta } } : {}),
      });

      committedAddresses.push(`${targetId}::${property}@${timeMs}`);

      if (
        shouldMaterializeSupport(
          animation,
          targetId,
          property,
          timeMs,
          loopStartMs,
          meta,
        )
      ) {
        const supportMeta: KeyframeAuthoringMeta | null = meta
          ? { gestureId: meta.gestureId, role: "support", source: meta.source }
          : null;
        edits.push({
          animationId: animation.id,
          targetId,
          property,
          timeMs: loopStartMs,
          value: fallbackValue,
          easing: "linear",
          ...(supportMeta ? { authoring: supportMeta } : {}),
        });
        materializedCount++;
      }
    }
  }

  return materializedCount > 0
    ? { edits, committedAddresses, materializedCount }
    : { edits, committedAddresses };
}

/**
 * Build a commit batch for manual K (no draft, snapshot pose).
 * Snapshots the given targets' current effective values with provenance.
 *
 * @param {Object} args
 * @param {string} args.animationId
 * @param {string[]} args.targetIds
 * @param {number} args.timeMs
 * @param {number} args.loopStartMs
 * @param {Object} args.project
 * @param {Map} args.keyframeOverrides - Current frame pose overrides
 * @param {Map} args.restPose
 * @param {string} [args.gestureId]
 * @param {string} [args.source] - 'manual-key'
 * @returns {{ edits: Array, committedAddresses: string[], materializedCount?: number }}
 */
export function buildManualKeyBatch({
  animationId,
  targetIds,
  timeMs,
  loopStartMs,
  project,
  keyframeOverrides,
  restPose,
  gestureId,
  source = "manual-key",
}: {
  animationId: AnimationId;
  targetIds: readonly AnimationTargetId[];
  timeMs: number;
  loopStartMs: number;
  project: ProjectDocument;
  keyframeOverrides?: PoseOverrides | null;
  restPose?: RestPose | null;
  gestureId?: string;
  source?: string;
}): AnimationCommitBatch {
  const edits: UpsertAnimationKeyframePayload[] = [];
  const committedAddresses: string[] = [];
  let materializedCount = 0;
  const animation = project.animations?.find(
    (candidate) => candidate.id === animationId,
  );

  for (const targetId of targetIds) {
    const node = project.nodes?.find((n) => n.id === targetId);
    const bone = project.bones?.find((b) => b.id === targetId);
    const constraint = project.constraints?.find((c) => c.id === targetId);

    if (!node && !bone && !constraint) continue;

    const target = node || bone || constraint;
    if (!target) continue;
    const properties = getManualKeyProperties(
      target,
      node,
      bone,
      constraint,
      animation,
      targetId,
    );

    const authoring: KeyframeAuthoringMeta | undefined = gestureId
      ? { gestureId, role: "authored", source }
      : undefined;

    for (const property of properties) {
      const existingValue = keyframeOverrides?.get(targetId)?.[property];
      const fallbackValue = getDefaultValue(
        property,
        node,
        bone,
        constraint,
        restPose,
        targetId,
      );
      const value = existingValue !== undefined ? existingValue : fallbackValue;

      edits.push({
        animationId,
        targetId,
        property,
        timeMs,
        value,
        easing: "linear",
        ...(authoring ? { authoring } : {}),
      });

      committedAddresses.push(`${targetId}::${property}@${timeMs}`);

      if (
        shouldMaterializeSupport(
          animation,
          targetId,
          property,
          timeMs,
          loopStartMs,
          authoring,
        )
      ) {
        const supportAuthoring: KeyframeAuthoringMeta | undefined = authoring
          ? { gestureId: authoring.gestureId, role: "support", source }
          : undefined;
        edits.push({
          animationId,
          targetId,
          property,
          timeMs: loopStartMs,
          value: fallbackValue,
          easing: "linear",
          ...(supportAuthoring ? { authoring: supportAuthoring } : {}),
        });
        materializedCount++;
      }
    }
  }

  return materializedCount > 0
    ? { edits, committedAddresses, materializedCount }
    : { edits, committedAddresses };
}

// ── Internal helpers ──────────────────────────────────────────────────────────

function shouldMaterializeSupport(
  animation: Animation | null | undefined,
  targetId: AnimationTargetId,
  property: string,
  timeMs: number,
  loopStartMs: number,
  nextAuthoring: KeyframeAuthoringMeta | null | undefined,
): boolean {
  if (timeMs <= loopStartMs) return false;

  const track = animation?.tracks?.find(
    (candidate) =>
      candidate.targetId === targetId && candidate.property === property,
  );
  const existingAtStart = track?.keyframes?.find(
    (keyframe) => keyframe.time === loopStartMs,
  );
  if (!existingAtStart) return true;

  // A real key at the loop start is user data. Never replace it with a hidden
  // fallback generated while authoring a later frame.
  if (existingAtStart.authoring?.role !== "support") return false;

  // Re-keying an authored gesture removes that gesture's old support. Recreate
  // only that soon-to-be-removed support; preserve supports owned elsewhere.
  const existingAtTime = track?.keyframes?.find(
    (keyframe) => keyframe.time === timeMs,
  );
  const previousAuthoring = existingAtTime?.authoring;
  const supersedesPreviousGesture =
    previousAuthoring?.role === "authored" &&
    nextAuthoring?.role === "authored" &&
    previousAuthoring.source === nextAuthoring.source &&
    previousAuthoring.gestureId !== nextAuthoring.gestureId;

  return (
    supersedesPreviousGesture &&
    existingAtStart.authoring?.gestureId === previousAuthoring.gestureId
  );
}

const MANUAL_KEY_NODE_PROPERTIES = [
  "x",
  "y",
  "rotation",
  "scaleX",
  "scaleY",
] as const;
const MANUAL_KEY_BONE_PROPERTIES = [
  "x",
  "y",
  "rotation",
  "scaleX",
  "scaleY",
] as const;
const MANUAL_KEY_CONSTRAINT_PROPERTIES = ["targetX", "targetY"] as const;

function getManualKeyProperties(
  _target: AnimationTarget,
  node: Node | undefined,
  bone: Bone | undefined,
  constraint: Constraint | undefined,
  animation: Animation | undefined,
  targetId: AnimationTargetId,
): string[] {
  let coreProperties: readonly string[] = [];
  if (constraint) coreProperties = MANUAL_KEY_CONSTRAINT_PROPERTIES;
  else if (bone) coreProperties = MANUAL_KEY_BONE_PROPERTIES;
  else if (node) coreProperties = MANUAL_KEY_NODE_PROPERTIES;
  if (coreProperties.length === 0) return [];

  // Smart K: once a target has animation tracks, key only those channels.
  // Avoid creating unrelated position/scale overrides that can pin a child
  // bone instead of letting it inherit movement from its animated parent.
  const animatedProperties = new Set(
    (animation?.tracks ?? [])
      .filter((track) => track.targetId === targetId)
      .map((track) => track.property),
  );
  const existingCoreProperties = coreProperties.filter((property) =>
    animatedProperties.has(property),
  );
  if (existingCoreProperties.length > 0) return existingCoreProperties;

  // Bone transforms are stored in world space. Full x/y/scale keys on a new
  // child would pin it and suppress parent inheritance. Rotation is the safe,
  // pose-oriented default; changed channels are still captured by Auto Key.
  if (bone?.parentId) return ["rotation"];
  return [...coreProperties];
}

function getDefaultValue(
  property: string,
  node: Node | undefined,
  bone: Bone | undefined,
  constraint: Constraint | undefined,
  restPose: RestPose | null | undefined,
  targetId: AnimationTargetId,
): unknown {
  if (restPose?.has(targetId)) {
    const rp = restPose.get(targetId)! as Record<string, unknown>;
    if (rp[property] !== undefined) return rp[property];
  }

  if (property === "opacity") return node?.opacity ?? 1;
  if (property === "visible") return node?.visible ?? true;
  if (property === "mesh_verts") {
    return node?.type === "part"
      ? (node.mesh?.vertices?.map((v) => ({ x: v.x, y: v.y })) ?? [])
      : [];
  }
  if (property.startsWith("blendShape:")) {
    const shapeId = property.slice("blendShape:".length);
    return node?.type === "part" ? (node.blendShapeValues?.[shapeId] ?? 0) : 0;
  }
  if (constraint) {
    if (property === "order") return 0;
    if (property === "bendPositive") return true;
    if (property === "mix") return constraint.mix ?? 1;
    if (property === "fkIk") return constraint.fkIk ?? 1;
    if (property === "targetX") return constraint.targetX ?? 0;
    if (property === "targetY") return constraint.targetY ?? 0;
    return 0;
  }
  if (bone) {
    if (property === "x") return bone.setup.x;
    if (property === "y") return bone.setup.y;
    if (property === "rotation") return bone.setup.rotation;
    if (property === "scaleX") return bone.setup.scaleX;
    if (property === "scaleY") return bone.setup.scaleY;
    if (property === "shearX") return bone.setup.shearX;
    if (property === "shearY") return bone.setup.shearY;
    if (property === "length") return bone.setup.length;
    return 0;
  }
  if (node) {
    if (property === "scaleX" || property === "scaleY") return 1;
    return 0;
  }
  return 0;
}

/**
 * Pure description of K scope for tooltip/status display.
 *
 * @param {{ dirty: boolean, hasSelection: boolean }} opts
 * @returns {string|null}
 */
export function describeKeyScope({
  dirty,
  hasSelection,
}: {
  dirty: boolean;
  hasSelection: boolean;
}): string | null {
  if (dirty) return "Key changed channels";
  if (hasSelection) return "Key animated channels for selection";
  return null;
}

/**
 * Pure navigation guard (R7, K5).
 * Returns whether a navigation transition (seek, play, stop, switch, mode-exit)
 * is allowed given the current draft state.
 *
 * @param {{ dirty: boolean, values: { size: number } | null }} state
 * @returns {{ allowed: boolean, reason?: string }}
 */
export function canNavigate(
  state: { dirty: boolean; values: { size: number } | null } | null | undefined,
): { allowed: true } | { allowed: false; reason: "pending-draft" } {
  if (!state) return { allowed: true };
  if (state.dirty && state.values && state.values.size > 0) {
    return { allowed: false, reason: "pending-draft" };
  }
  return { allowed: true };
}
