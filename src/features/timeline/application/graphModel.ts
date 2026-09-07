import type { AnimationTargetId, Keyframe } from "@kukla2d/contracts";

import { evaluateCubicBezier } from "@/domain/animationEngine";
import { getAnimationPropertySpec } from "@/domain/animationProperties";

type CubicBezierTuple = [number, number, number, number];
type TimelineEasing = Keyframe["easing"] | null;

interface ValueRange {
  min: number;
  max: number;
}

interface GraphHandle {
  x: number;
  y: number;
}

interface NumericKeyframe extends Keyframe {
  value: number;
}

interface NumericPropertyRow {
  targetId: AnimationTargetId;
  property: string;
  valueCategory: string | null;
  keyframes: NumericKeyframe[];
}

interface GraphPoint {
  timeMs: number;
  value: number;
  easing: NonNullable<Keyframe["easing"]>;
  x: number;
  y: number;
  address: string;
}

const PADDING = 0.1;

export function computeValueRange(
  keyframes: readonly Keyframe[] | null | undefined,
): ValueRange {
  if (!keyframes || keyframes.length === 0) return { min: 0, max: 1 };
  let min = Infinity;
  let max = -Infinity;
  for (const kf of keyframes) {
    if (typeof kf.value !== "number") continue;
    if (kf.value < min) min = kf.value;
    if (kf.value > max) max = kf.value;
  }
  if (!Number.isFinite(min)) return { min: 0, max: 1 };
  if (min === max) return { min: min - 1, max: max + 1 };
  return { min, max };
}

export function fitValueRange(range: ValueRange): ValueRange {
  const span = range.max - range.min;
  const pad = span * PADDING || 0.5;
  return { min: range.min - pad, max: range.max + pad };
}

export function applyPropertyRange(
  _keyframes: readonly Keyframe[],
  property: string,
): ValueRange | null {
  const spec = getAnimationPropertySpec(property);
  if (!spec) return null;
  if (spec.min !== undefined && spec.max !== undefined) {
    return { min: spec.min, max: spec.max };
  }
  return null;
}

export function valueToScreen(
  value: number,
  valueRange: ValueRange,
  graphHeight: number,
): number {
  if (valueRange.max === valueRange.min) return graphHeight / 2;
  return (
    graphHeight -
    ((value - valueRange.min) / (valueRange.max - valueRange.min)) * graphHeight
  );
}

export function screenToValue(
  y: number,
  valueRange: ValueRange,
  graphHeight: number,
): number {
  if (graphHeight <= 0) return valueRange.min;
  const t = 1 - y / graphHeight;
  return valueRange.min + t * (valueRange.max - valueRange.min);
}

export function timeToScreenX(
  timeMs: number,
  startFrame: number,
  totalFrames: number,
  fps: number,
): number {
  if (totalFrames <= 0) return 0;
  const frame = (timeMs / 1000) * Math.max(1, fps);
  return ((frame - startFrame) / totalFrames) * 100;
}

export function screenXToTime(
  xPercent: number,
  startFrame: number,
  totalFrames: number,
  fps: number,
): number {
  if (totalFrames <= 0) return 0;
  const frame = startFrame + (xPercent / 100) * totalFrames;
  return (frame / Math.max(1, fps)) * 1000;
}

export function snapTimeToFrame(timeMs: number, fps: number): number {
  const frame = Math.round((timeMs / 1000) * Math.max(1, fps));
  return (frame / Math.max(1, fps)) * 1000;
}

export function clampTime(timeMs: number, durationMs: number): number {
  return Math.max(0, Math.min(durationMs, timeMs));
}

export function clampValue(value: number, property: string): number {
  const spec = getAnimationPropertySpec(property);
  if (!spec) return value;
  let v = value;
  if (spec.min !== undefined && v < spec.min) v = spec.min;
  if (spec.max !== undefined && v > spec.max) v = spec.max;
  if (spec.integer) v = Math.round(v);
  return v;
}

export function isNumericTrack(
  propertyRow:
    | {
        valueCategory?: string | null;
        keyframes?: readonly Keyframe[];
      }
    | null
    | undefined,
): propertyRow is NumericPropertyRow {
  if (!propertyRow || !propertyRow.keyframes) return false;
  if (
    propertyRow.valueCategory !== "numeric" &&
    propertyRow.valueCategory !== "blendShape"
  )
    return false;
  return propertyRow.keyframes.every((kf) => typeof kf.value === "number");
}

export function easingToCubicTuple(easing: TimelineEasing): CubicBezierTuple {
  if (Array.isArray(easing) && easing.length === 4) {
    return [easing[0], easing[1], easing[2], easing[3]];
  }
  switch (easing) {
    case "linear":
      return [0, 0, 1, 1];
    case "ease-in":
      return [0.42, 0, 1, 1];
    case "ease-out":
      return [0, 0, 0.58, 1];
    case "ease-both":
    case "ease":
    case undefined:
    case null:
      return [0.42, 0, 0.58, 1];
    default:
      return [0.42, 0, 0.58, 1];
  }
}

export function cubicTupleToEasing(
  tuple: readonly number[],
): NonNullable<Keyframe["easing"]> {
  if (!Array.isArray(tuple) || tuple.length !== 4) return "ease-both";
  if (tuple[0] === tuple[1] && tuple[2] === tuple[3]) return "linear";
  if (tuple[0] === 0.42 && tuple[1] === 0 && tuple[2] === 1 && tuple[3] === 1)
    return "ease-in";
  if (tuple[0] === 0 && tuple[1] === 0 && tuple[2] === 0.58 && tuple[3] === 1)
    return "ease-out";
  if (
    tuple[0] === 0.42 &&
    tuple[1] === 0 &&
    tuple[2] === 0.58 &&
    tuple[3] === 1
  )
    return "ease-both";
  return [tuple[0]!, tuple[1]!, tuple[2]!, tuple[3]!];
}

function clampHandleX(x: number): number {
  return Math.max(0, Math.min(1, x));
}

export function handlesFromTuple(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  tuple: CubicBezierTuple,
): { outHandle: GraphHandle; inHandle: GraphHandle } {
  const dx = x1 - x0;
  return {
    outHandle: {
      x: x0 + clampHandleX(tuple[0]) * dx,
      y: y0 + tuple[1] * (y1 - y0),
    },
    inHandle: {
      x: x0 + clampHandleX(tuple[2]) * dx,
      y: y0 + tuple[3] * (y1 - y0),
    },
  };
}

export function tupleFromHandles(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  outHandle: GraphHandle,
  inHandle: GraphHandle,
): CubicBezierTuple {
  const dx = x1 - x0 || 1;
  const dy = y1 - y0 || 1;
  return [
    clampHandleX((outHandle.x - x0) / dx),
    (outHandle.y - y0) / dy,
    clampHandleX((inHandle.x - x0) / dx),
    (inHandle.y - y0) / dy,
  ];
}

export function buildSegmentPath(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  easing: TimelineEasing,
): string {
  if (easing === "stepped") {
    return `M ${x0} ${y0} L ${x1} ${y0} L ${x1} ${y1}`;
  }
  const tuple = easingToCubicTuple(easing);
  const { outHandle, inHandle } = handlesFromTuple(x0, y0, x1, y1, tuple);
  return `M ${x0} ${y0} C ${outHandle.x} ${outHandle.y}, ${inHandle.x} ${inHandle.y}, ${x1} ${y1}`;
}

export function evaluateGraphCurve(x: number, easing: TimelineEasing): number {
  if (easing === "stepped") return 0;
  const tuple = easingToCubicTuple(easing);
  return evaluateCubicBezier(x, tuple[0], tuple[1], tuple[2], tuple[3]);
}

export function buildGraphPoints(
  propertyRow: NumericPropertyRow | null | undefined,
  startFrame: number,
  totalFrames: number,
  fps: number,
  valueRange: ValueRange,
  graphHeight: number,
): GraphPoint[] {
  if (!propertyRow || !propertyRow.keyframes) return [];
  return propertyRow.keyframes.map((kf) => ({
    timeMs: kf.time,
    value: kf.value,
    easing: kf.easing ?? "ease-both",
    x: timeToScreenX(kf.time, startFrame, totalFrames, fps),
    y: valueToScreen(kf.value, valueRange, graphHeight),
    address: `${propertyRow.targetId}:${propertyRow.property}:${kf.time}`,
  }));
}

export function buildSegmentPathForPoints(
  p0: GraphPoint,
  p1: GraphPoint,
): string {
  return buildSegmentPath(p0.x, p0.y, p1.x, p1.y, p0.easing);
}
