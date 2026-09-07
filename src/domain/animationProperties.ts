import { isFiniteNumber } from "@/lib/math";

import type {
  AnimationPropertySpec,
  AnimationTargetKind,
  TrackValueCategory,
} from "./animationProperties.types.js";

type InterpolationMode = "none" | "linear" | "cubic";

export const TRACK_VALUE_CATEGORIES = Object.freeze({
  NUMERIC: "numeric",
  BOOLEAN: "boolean",
  MESH_VERTICES: "meshVertices",
  BLEND_SHAPE: "blendShape",
  EVENT: "event",
});

const VALID_EASING_PRESETS: readonly string[] = Object.freeze([
  "linear",
  "ease",
  "ease-both",
  "ease-in",
  "ease-out",
  "stepped",
]);

const ANIMATION_PROPERTY_SPECS: readonly AnimationPropertySpec[] =
  Object.freeze([
    Object.freeze({
      property: "x",
      targetKinds: ["node", "bone"],
      valueCategory: TRACK_VALUE_CATEGORIES.NUMERIC,
      interpolation: "cubic",
      authorable: true,
      rendered: true,
    }),
    Object.freeze({
      property: "y",
      targetKinds: ["node", "bone"],
      valueCategory: TRACK_VALUE_CATEGORIES.NUMERIC,
      interpolation: "cubic",
      authorable: true,
      rendered: true,
    }),
    Object.freeze({
      property: "rotation",
      targetKinds: ["node", "bone"],
      valueCategory: TRACK_VALUE_CATEGORIES.NUMERIC,
      interpolation: "cubic",
      authorable: true,
      rendered: true,
    }),
    Object.freeze({
      property: "scaleX",
      targetKinds: ["node", "bone"],
      valueCategory: TRACK_VALUE_CATEGORIES.NUMERIC,
      interpolation: "cubic",
      authorable: true,
      rendered: true,
    }),
    Object.freeze({
      property: "scaleY",
      targetKinds: ["node", "bone"],
      valueCategory: TRACK_VALUE_CATEGORIES.NUMERIC,
      interpolation: "cubic",
      authorable: true,
      rendered: true,
    }),
    Object.freeze({
      property: "opacity",
      targetKinds: ["node"],
      valueCategory: TRACK_VALUE_CATEGORIES.NUMERIC,
      interpolation: "cubic",
      authorable: true,
      rendered: true,
      min: 0,
      max: 1,
    }),
    Object.freeze({
      property: "visible",
      targetKinds: ["node"],
      valueCategory: TRACK_VALUE_CATEGORIES.BOOLEAN,
      interpolation: "none",
      authorable: true,
      rendered: true,
    }),
    Object.freeze({
      property: "mesh_verts",
      targetKinds: ["node"],
      valueCategory: TRACK_VALUE_CATEGORIES.MESH_VERTICES,
      interpolation: "cubic",
      authorable: true,
      rendered: true,
    }),
    Object.freeze({
      property: "targetX",
      targetKinds: ["constraint"],
      valueCategory: TRACK_VALUE_CATEGORIES.NUMERIC,
      interpolation: "cubic",
      authorable: true,
      rendered: true,
    }),
    Object.freeze({
      property: "targetY",
      targetKinds: ["constraint"],
      valueCategory: TRACK_VALUE_CATEGORIES.NUMERIC,
      interpolation: "cubic",
      authorable: true,
      rendered: true,
    }),
    Object.freeze({
      property: "mix",
      targetKinds: ["constraint"],
      valueCategory: TRACK_VALUE_CATEGORIES.NUMERIC,
      interpolation: "cubic",
      authorable: true,
      rendered: true,
      min: 0,
      max: 1,
    }),
    Object.freeze({
      property: "fkIk",
      targetKinds: ["constraint"],
      valueCategory: TRACK_VALUE_CATEGORIES.NUMERIC,
      interpolation: "cubic",
      authorable: true,
      rendered: true,
      min: 0,
      max: 1,
    }),
    Object.freeze({
      property: "bendPositive",
      targetKinds: ["constraint"],
      valueCategory: TRACK_VALUE_CATEGORIES.BOOLEAN,
      interpolation: "none",
      authorable: true,
      rendered: true,
    }),
    Object.freeze({
      property: "order",
      targetKinds: ["constraint"],
      valueCategory: TRACK_VALUE_CATEGORIES.NUMERIC,
      interpolation: "none",
      authorable: true,
      rendered: true,
      integer: true,
    }),
    Object.freeze({
      property: "drawOrder",
      targetKinds: ["node", "slot"],
      valueCategory: TRACK_VALUE_CATEGORIES.NUMERIC,
      interpolation: "none",
      authorable: true,
      rendered: true,
      integer: true,
    }),
    Object.freeze({
      property: "event",
      targetKinds: ["node"],
      valueCategory: TRACK_VALUE_CATEGORIES.EVENT,
      interpolation: "none",
      authorable: false,
      rendered: false,
    }),
  ]);

const SPECS_BY_PROPERTY = new Map(
  ANIMATION_PROPERTY_SPECS.map((spec) => [spec.property, spec]),
);

function isFiniteVector(
  value: unknown,
): value is readonly { x: number; y: number }[] {
  return (
    Array.isArray(value) &&
    value.every((point: unknown) => {
      if (!point || typeof point !== "object") return false;
      const vector = point as Record<string, unknown>;
      return Number.isFinite(vector.x) && Number.isFinite(vector.y);
    })
  );
}

/**
 * Returns the canonical value category for a track property.
 *
 * @param {string} property
 * @returns {string | null}
 */
export function getTrackValueCategory(
  property: string,
): TrackValueCategory | null {
  if (typeof property !== "string" || property.length === 0) return null;
  if (property.startsWith("blendShape:"))
    return TRACK_VALUE_CATEGORIES.BLEND_SHAPE;
  return SPECS_BY_PROPERTY.get(property)?.valueCategory ?? null;
}

/**
 * Named property validator for animation tracks.
 *
 * @param {string} property
 * @returns {boolean}
 */
export function isSupportedTrackProperty(property: string): boolean {
  return getTrackValueCategory(property) !== null;
}

/**
 * Returns the AnimationPropertySpec for a property, or null if unknown.
 * For dynamic 'blendShape:*' properties, returns a generated spec with pattern prefix.
 *
 * @param {string} property
 * @returns {AnimationPropertySpec | null}
 */
export function getAnimationPropertySpec(
  property: string,
): AnimationPropertySpec | null {
  if (typeof property !== "string" || property.length === 0) return null;

  const staticSpec = SPECS_BY_PROPERTY.get(property);
  if (staticSpec) return staticSpec;

  if (property.startsWith("blendShape:")) {
    return Object.freeze({
      property: "blendShape:",
      targetKinds: ["node"],
      valueCategory: TRACK_VALUE_CATEGORIES.BLEND_SHAPE,
      interpolation: "cubic",
      authorable: true,
      rendered: true,
      min: 0,
      max: 1,
    });
  }

  return null;
}

/**
 * Returns all static AnimationPropertySpecs (excludes dynamic blendShape:*).
 *
 * @returns {readonly AnimationPropertySpec[]}
 */
export function getAllAnimationPropertySpecs(): readonly AnimationPropertySpec[] {
  return ANIMATION_PROPERTY_SPECS;
}

/**
 * Returns all supported property names (static + 'blendShape:*' pattern).
 *
 * @returns {string[]}
 */
export function getSupportedPropertyNames(): string[] {
  return ANIMATION_PROPERTY_SPECS.map((spec) => spec.property);
}

/**
 * Returns true if the property is authorable (can be written via authoring API).
 *
 * @param {string} property
 * @returns {boolean}
 */
export function isAuthorableProperty(property: string): boolean {
  const spec = getAnimationPropertySpec(property);
  return spec !== null && spec.authorable === true;
}

/**
 * Returns true if the property is rendered (reaches the renderer frame).
 *
 * @param {string} property
 * @returns {boolean}
 */
export function isRenderedProperty(property: string): boolean {
  const spec = getAnimationPropertySpec(property);
  return spec !== null && spec.rendered === true;
}

/**
 * Returns true if the property can be used with the given target kind.
 *
 * @param {string} property
 * @param {string} targetKind - 'node' | 'bone' | 'constraint' | 'slot'
 * @returns {boolean}
 */
export function isPropertyAllowedForTargetKind(
  property: string,
  targetKind: AnimationTargetKind,
): boolean {
  const spec = getAnimationPropertySpec(property);
  return spec !== null && spec.targetKinds.includes(targetKind);
}

/**
 * Returns the interpolation mode for a property.
 *
 * @param {string} property
 * @returns {'none'|'linear'|'cubic'|null}
 */
export function getPropertyInterpolation(
  property: string,
): InterpolationMode | null {
  const spec = getAnimationPropertySpec(property);
  return spec?.interpolation ?? null;
}

/**
 * Validates a keyframe value against the property's canonical category
 * and optional range constraints from the spec.
 *
 * @param {string} property
 * @param {unknown} value
 * @returns {boolean}
 */
export function validateTrackValue(property: string, value: unknown): boolean {
  const category = getTrackValueCategory(property);
  const spec = getAnimationPropertySpec(property);

  switch (category) {
    case TRACK_VALUE_CATEGORIES.NUMERIC:
    case TRACK_VALUE_CATEGORIES.BLEND_SHAPE: {
      if (!isFiniteNumber(value)) return false;
      if (spec?.min !== undefined && value < spec.min) return false;
      if (spec?.max !== undefined && value > spec.max) return false;
      if (spec?.integer && !Number.isInteger(value)) return false;
      return true;
    }
    case TRACK_VALUE_CATEGORIES.BOOLEAN:
      return typeof value === "boolean";
    case TRACK_VALUE_CATEGORIES.MESH_VERTICES:
      return isFiniteVector(value);
    case TRACK_VALUE_CATEGORIES.EVENT:
      return (
        typeof value === "string" ||
        (typeof value === "object" && value !== null)
      );
    default:
      return false;
  }
}

/**
 * Returns true if the easing value is a valid easing preset or cubic bezier tuple.
 *
 * @param {unknown} easing
 * @returns {boolean}
 */
export function isValidEasing(easing: unknown): boolean {
  if (typeof easing === "string") {
    return VALID_EASING_PRESETS.includes(easing);
  }
  if (Array.isArray(easing) && easing.length === 4) {
    return easing.every((v) => isFiniteNumber(v));
  }
  return false;
}

/**
 * Returns true if two easing values are structurally equal.
 * Arrays are compared element-wise.
 *
 * @param {unknown} a
 * @param {unknown} b
 * @returns {boolean}
 */
export function easingEquals(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    return a.every((v, i) => v === b[i]);
  }
  return false;
}
