/**
 * Animation target kinds and validation utilities.
 *
 * A target is any entity that can receive animation tracks:
 *   - 'node': part, group, warpDeformer
 *   - 'bone': skeleton bone
 *   - 'constraint': IK constraint
 *   - 'slot': slot (draw order, color)
 */

import type {
  AnimationTargetId,
  Bone,
  Constraint,
  Node,
  ProjectDocument,
  Slot,
} from "@kukla2d/contracts";

import {
  getAnimationPropertySpec,
  isSupportedTrackProperty,
} from "./animationProperties.js";

import type { AnimationTargetKind as TargetKind } from "./animationProperties.types.js";

type AnimationTarget = Node | Bone | Constraint | Slot;

/** @typedef {'node'|'bone'|'constraint'|'slot'} TargetKind */

/**
 * Infer the target kind from a project entity.
 *
 * @param {Object} entity - A project node, bone, constraint, or slot.
 * @returns {TargetKind | null}
 */
export function inferTargetKind(entity: unknown): TargetKind | null {
  if (!entity || typeof entity !== "object") return null;
  const candidate = entity as Record<string, unknown>;
  if (
    candidate.type === "part" ||
    candidate.type === "group" ||
    candidate.type === "warpDeformer"
  )
    return "node";
  if (
    candidate.setup !== undefined &&
    candidate.parentId !== undefined &&
    candidate.length === undefined
  )
    return "bone";
  if (candidate.type === "ik") return "constraint";
  if (
    candidate.boneId !== undefined &&
    candidate.id !== undefined &&
    candidate.setup === undefined
  )
    return "slot";
  return null;
}

/**
 * Returns the default value for a property in the given target kind context.
 *
 * @param {string} property
 * @param {string} targetKind
 * @returns {unknown}
 */
export function getDefaultValue(
  property: string,
  targetKind: TargetKind,
): unknown {
  const spec = getAnimationPropertySpec(property);
  if (!spec) return undefined;

  if (property === "opacity") return 1;
  if (property === "visible") return true;
  if (property === "bendPositive") return true;
  if (property === "mix") return 1;
  if (property === "fkIk") return 0;
  if (property === "order") return 0;
  if (property === "drawOrder") return 0;
  if (property === "targetX") return 0;
  if (property === "targetY") return 0;
  if (property.startsWith("blendShape:")) return 0;
  if (targetKind === "bone") {
    if (property === "scaleX" || property === "scaleY") return 1;
    return 0;
  }
  if (targetKind === "node") {
    if (property === "scaleX" || property === "scaleY") return 1;
    return 0;
  }
  return 0;
}

/**
 * Validate that a target exists in the project and the property is compatible
 * with that target's kind.
 *
 * @param {Object} project - Full project document.
 * @param {string} targetId
 * @param {string} property
 * @returns {{ valid: boolean, targetKind?: TargetKind, error?: string }}
 */
export function validateTargetProperty(
  project: ProjectDocument,
  targetId: AnimationTargetId,
  property: string,
): { valid: true; targetKind: TargetKind } | { valid: false; error: string } {
  if (!isSupportedTrackProperty(property)) {
    return { valid: false, error: `Unknown animation property "${property}"` };
  }

  const entity = findTarget(project, targetId);
  if (!entity) {
    return { valid: false, error: `Target "${targetId}" not found in project` };
  }

  const targetKind = inferTargetKind(entity);
  if (!targetKind) {
    return {
      valid: false,
      error: `Cannot determine target kind for "${targetId}"`,
    };
  }

  const spec = getAnimationPropertySpec(property);
  if (spec && !spec.targetKinds.includes(targetKind)) {
    return {
      valid: false,
      error: `Property "${property}" is not allowed for target kind "${targetKind}"`,
    };
  }

  return { valid: true, targetKind };
}

/**
 * Find a target entity by ID in the project.
 *
 * @param {Object} project
 * @param {string} targetId
 * @returns {Object | null}
 */
export function findTarget(
  project: ProjectDocument | null | undefined,
  targetId: AnimationTargetId,
): AnimationTarget | null {
  if (!project || !targetId) return null;

  const node = project.nodes?.find((n) => n.id === targetId);
  if (node) return node;

  const bone = project.bones?.find((b) => b.id === targetId);
  if (bone) return bone;

  const constraint = project.constraints?.find((c) => c.id === targetId);
  if (constraint) return constraint;

  const slot = project.slots?.find((s) => s.id === targetId);
  if (slot) return slot;

  return null;
}

/**
 * Returns all target IDs of a given kind in the project.
 *
 * @param {Object} project
 * @param {TargetKind} kind
 * @returns {string[]}
 */
export function getTargetsByKind(
  project: ProjectDocument | null | undefined,
  kind: TargetKind,
): string[] {
  if (!project) return [];

  switch (kind) {
    case "node":
      return (project.nodes ?? []).map((n) => n.id);
    case "bone":
      return (project.bones ?? []).map((b) => b.id);
    case "constraint":
      return (project.constraints ?? []).map((c) => c.id);
    case "slot":
      return (project.slots ?? []).map((s) => s.id);
    default:
      return [];
  }
}
