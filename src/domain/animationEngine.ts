/**
 * Animation engine — keyframe interpolation utilities.
 *
 * Animation data model (stored in project.animations):
 *   { id, name, duration (ms), fps,
 *     tracks: [{ targetId, property, keyframes: [{ time (ms), value, easing }] }] }
 *
 * Supported properties:
 *   'x' | 'y' | 'rotation' | 'scaleX' | 'scaleY' | 'opacity' | 'visible' | 'mesh_verts' | 'blendShape:{id}'
 */

import type {
  Animation,
  BlendShape,
  Keyframe,
  Transform,
} from "@kukla2d/contracts";

import { lerp } from "@/lib/math";

import { getBoomerangSourceTime } from "./animationBoomerang.js";
import {
  getTrackValueCategory,
  TRACK_VALUE_CATEGORIES,
} from "./animationProperties.js";
import { sampleTimeAtFps } from "./animationTransport.js";

import type { AnimationEasing } from "./animationCommandTypes.types.js";
import type { PoseOverrides } from "./animationEngine.types.js";

interface Point2D {
  x: number;
  y: number;
}

function bezier1D(t: number, startTension: number, endTension: number): number {
  const t2 = t * t;
  const t3 = t2 * t;
  const mt = 1 - t;
  const mt2 = mt * mt;
  return 3 * mt2 * t * startTension + 3 * mt * t2 * endTension + t3;
}

/**
 * 1D Cubic Bezier Solver (X -> Y)
 */
export function evaluateCubicBezier(
  x: number,
  cx1: number,
  cy1: number,
  cx2: number,
  cy2: number,
): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  if (cx1 === cy1 && cx2 === cy2) return x; // Linear shortcut

  // Binary search for t given x
  let lower = 0;
  let upper = 1;
  let t = x;

  for (let i = 0; i < 12; i++) {
    const currentX = bezier1D(t, cx1, cx2);
    if (Math.abs(currentX - x) < 0.0001) break;
    if (x > currentX) lower = t;
    else upper = t;
    t = (lower + upper) / 2;
  }

  return bezier1D(t, cy1, cy2);
}

/**
 * Evaluate a given easing shape
 */
export function evaluateEasing(t: number, easing?: AnimationEasing): number {
  if (easing === "linear") return t;
  if (!easing || easing === "ease" || easing === "ease-both") {
    // defaults to standard smooth curve (Ease Both)
    return evaluateCubicBezier(t, 0.42, 0, 0.58, 1);
  }
  if (easing === "ease-in") {
    return evaluateCubicBezier(t, 0.42, 0, 1, 1);
  }
  if (easing === "ease-out") {
    return evaluateCubicBezier(t, 0, 0, 0.58, 1);
  }
  if (easing === "stepped") return 0;
  if (Array.isArray(easing) && easing.length === 4) {
    return evaluateCubicBezier(t, easing[0], easing[1], easing[2], easing[3]);
  }
  return t;
}

/**
 * Interpolate a single track's keyframes at the given time (ms).
 * Returns undefined if no keyframes.
 */
export function interpolateTrack(
  keyframes: readonly Keyframe[],
  timeMs: number,
  loopKeyframes = false,
  endMs = 0,
): unknown {
  if (!keyframes || keyframes.length === 0) return undefined;

  // Clamp to edge values
  const firstKeyframe = keyframes[0]!;
  const lastKeyframe = keyframes[keyframes.length - 1]!;
  if (timeMs <= firstKeyframe.time) return firstKeyframe.value;

  if (timeMs >= lastKeyframe.time) {
    if (loopKeyframes && timeMs < endMs && keyframes.length > 0) {
      const kLast = lastKeyframe;
      const kFirst = firstKeyframe;
      const t = (timeMs - kLast.time) / (endMs - kLast.time);
      const te = evaluateEasing(t, kLast.easing);
      return typeof kLast.value === "number" && typeof kFirst.value === "number"
        ? lerp(kLast.value, kFirst.value, te)
        : kLast.value;
    }
    return lastKeyframe.value;
  }

  // Binary search for the surrounding pair
  let lo = 0;
  let hi = keyframes.length - 2;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (keyframes[mid + 1]!.time <= timeMs) lo = mid + 1;
    else hi = mid;
  }

  const kA = keyframes[lo]!;
  const kB = keyframes[lo + 1]!;
  const t = (timeMs - kA.time) / (kB.time - kA.time);
  const te = evaluateEasing(t, kA.easing); // Easing from the *start* keyframe of the segment

  if (typeof kA.value === "boolean") {
    // Discrete step interpolation for boolean properties like 'visible'
    return kA.value;
  }

  return typeof kA.value === "number" && typeof kB.value === "number"
    ? lerp(kA.value, kB.value, te)
    : kA.value;
}

function isPointArray(value: unknown): value is Point2D[] {
  return (
    Array.isArray(value) &&
    value.every(
      (point) =>
        point !== null &&
        typeof point === "object" &&
        typeof (point as Point2D).x === "number" &&
        typeof (point as Point2D).y === "number",
    )
  );
}

/**
 * Interpolate an array of {x,y} vertex positions between two keyframes.
 * Both keyframe values must have the same vertex count.
 */
export function interpolateMeshVerts(
  keyframes: readonly Keyframe[],
  timeMs: number,
  loopKeyframes = false,
  endMs = 0,
): Point2D[] | undefined {
  if (!keyframes || keyframes.length === 0) return undefined;
  const firstKeyframe = keyframes[0]!;
  const lastKeyframe = keyframes[keyframes.length - 1]!;
  if (!isPointArray(firstKeyframe.value) || !isPointArray(lastKeyframe.value))
    return undefined;
  const firstValue = firstKeyframe.value;
  const lastValue = lastKeyframe.value;
  if (timeMs <= firstKeyframe.time) return firstValue;

  if (timeMs >= lastKeyframe.time) {
    if (loopKeyframes && timeMs < endMs && keyframes.length > 0) {
      const kLast = lastKeyframe;
      const t = (timeMs - kLast.time) / (endMs - kLast.time);
      const te = evaluateEasing(t, kLast.easing);

      return lastValue.map((vA, i) => {
        const vB = firstValue[i];
        if (!vB) return { x: vA.x, y: vA.y };
        return { x: vA.x + (vB.x - vA.x) * te, y: vA.y + (vB.y - vA.y) * te };
      });
    }
    return lastValue;
  }

  let lo = 0;
  let hi = keyframes.length - 2;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (keyframes[mid + 1]!.time <= timeMs) lo = mid + 1;
    else hi = mid;
  }

  const kA = keyframes[lo]!;
  const kB = keyframes[lo + 1]!;
  if (!isPointArray(kA.value) || !isPointArray(kB.value)) return undefined;
  const valueA = kA.value;
  const valueB = kB.value;
  const t = (timeMs - kA.time) / (kB.time - kA.time);
  const te = evaluateEasing(t, kA.easing); // Easing from the *start* keyframe of the segment

  return valueA.map((vA, i) => {
    const vB = valueB[i];
    if (!vB) return { x: vA.x, y: vA.y };
    return { x: vA.x + (vB.x - vA.x) * te, y: vA.y + (vB.y - vA.y) * te };
  });
}

/**
 * Compute pose overrides for all tracks in an animation at the given time.
 *
 * @param {Object|null} animation  - single animation object (project.animations[i])
 * @param {number}      timeMs     - current playhead position in milliseconds
 * @returns {Map<string, Object>}  targetId → {
 *   x?, y?, rotation?, scaleX?, scaleY?, opacity?,
 *   mesh_verts?: [{x,y},...]
 * }
 */
export function computePoseOverrides(
  animation: Animation | null | undefined,
  timeMs: number,
  loopKeyframes = false,
  endMs = 0,
): PoseOverrides {
  const overrides: PoseOverrides = new Map();
  if (!animation) return overrides;
  const sampledTimeMs = sampleTimeAtFps(timeMs, animation.fps);

  for (const track of animation.tracks) {
    const targetId = track.targetId;
    if (!targetId) continue;
    const category = getTrackValueCategory(track.property);
    if (!category || category === TRACK_VALUE_CATEGORIES.EVENT) continue;

    const { mappedTimeMs } = getBoomerangSourceTime(
      animation,
      targetId,
      sampledTimeMs,
    );

    let value: unknown;
    if (track.property === "mesh_verts") {
      value = interpolateMeshVerts(
        track.keyframes,
        mappedTimeMs,
        loopKeyframes,
        endMs,
      );
    } else {
      value = interpolateTrack(
        track.keyframes,
        mappedTimeMs,
        loopKeyframes,
        endMs,
      );
      if (track.property === "drawOrder") {
        if (typeof value === "number") value = Math.round(value);
      }
    }
    if (value === undefined) continue;

    if (!overrides.has(targetId)) overrides.set(targetId, {});
    overrides.get(targetId)![track.property] = value;
  }

  return overrides;
}

/**
 * Pure animation pose evaluator (K5).
 *
 * Maps a canonical animation clip and timing context to a Map of pose
 * overrides keyed by targetId.  No side effects; does not read stores,
 * React, DOM, WebGL or Worker state.
 *
 * @param {Object|null} clip               - canonical animation clip { tracks }
 * @param {Object}      opts
 * @param {number}      opts.timeMs        - current playhead position in ms
 * @param {boolean}     [opts.loopKeyframes] - loop keyframes within clip window
 * @param {number}      [opts.endMs]         - loop end boundary in ms
 * @returns {Map<string, Object>}          targetId → { property: value, … }
 */
export function evaluateAnimationPose(
  clip: Animation | null | undefined,
  {
    timeMs = 0,
    loopKeyframes = false,
    endMs = 0,
  }: {
    timeMs?: number;
    loopKeyframes?: boolean;
    endMs?: number;
  } = {},
): PoseOverrides {
  return computePoseOverrides(clip, timeMs, loopKeyframes, endMs);
}

/**
 * Insert or update a keyframe in a track's keyframe array (mutates in place).
 * Keeps keyframes sorted by time.
 */
export function upsertKeyframe(
  keyframes: Keyframe[],
  timeMs: number,
  value: unknown,
  easing: AnimationEasing = "ease-both",
): void {
  const existing = keyframes.find((kf) => kf.time === timeMs);
  if (existing) {
    existing.value = value;
    existing.easing = easing;
  } else {
    keyframes.push({ time: timeMs, value, easing });
    keyframes.sort((a, b) => a.time - b.time);
  }
}

/** All keyframeable transform properties (in display order) */
export const KEYFRAME_PROPS = [
  "x",
  "y",
  "rotation",
  "scaleX",
  "scaleY",
  "opacity",
  "visible",
] as const;

/** Prefix for blend shape influence track properties */
export const BLEND_SHAPE_TRACK_PREFIX = "blendShape:";

/** Human-readable labels */
export const PROP_LABELS = {
  x: "X",
  y: "Y",
  rotation: "Rotation",
  scaleX: "Scale X",
  scaleY: "Scale Y",
  opacity: "Opacity",
  visible: "Visible",
};

/**
 * Get the current value of a property from a node (used when inserting keyframes).
 * Reads from transform for transform props, directly from node for opacity.
 * Handles blend shape influences via blendShape:{shapeId} property names.
 */
export function getNodePropertyValue(
  node: {
    opacity?: number;
    visible?: boolean;
    transform?: Partial<Transform>;
    blendShapeValues?: Record<string, number>;
  },
  property: string,
): unknown {
  if (property === "opacity") return node.opacity ?? 1;
  if (property === "visible") return node.visible ?? true;
  if (property.startsWith(BLEND_SHAPE_TRACK_PREFIX)) {
    const shapeId = property.slice(BLEND_SHAPE_TRACK_PREFIX.length);
    return node.blendShapeValues?.[shapeId] ?? 0;
  }
  if (!node.transform) return 0;
  if (property === "x") return node.transform.x ?? 0;
  if (property === "y") return node.transform.y ?? 0;
  if (property === "rotation") return node.transform.rotation ?? 0;
  if (property === "scaleX") return node.transform.scaleX ?? 1;
  if (property === "scaleY") return node.transform.scaleY ?? 1;
  if (property === "pivotX") return node.transform.pivotX ?? 0;
  if (property === "pivotY") return node.transform.pivotY ?? 0;
  return 0;
}

export function applyBlendShapeDeltas(
  baseVertices: readonly Point2D[] | null | undefined,
  blendShapes: readonly BlendShape[] | null | undefined,
  blendShapeValues: Readonly<Record<string, number>> | null | undefined,
): readonly Point2D[] | null | undefined {
  if (!baseVertices?.length || !blendShapes?.length || !blendShapeValues)
    return baseVertices;
  const out = baseVertices.map((v) => ({ x: v.x, y: v.y }));
  for (const shape of blendShapes) {
    const influence = blendShapeValues[shape.id] ?? 0;
    if (influence <= 0 || !shape.deltas) continue;
    for (let i = 0; i < Math.min(out.length, shape.deltas.length); i++) {
      const vertex = out[i];
      const delta = shape.deltas[i];
      if (!vertex || !delta) continue;
      vertex.x += delta.dx * influence;
      vertex.y += delta.dy * influence;
    }
  }
  return out;
}
