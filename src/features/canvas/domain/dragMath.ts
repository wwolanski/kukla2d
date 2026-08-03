/**
 * Shared pure drag math helpers.
 *
 * Extracted from useGizmoDrag.js. No React, DOM, WebGL, or Pixi imports.
 * Used by Pixi input system.
 */

import { mat3Mul } from '@/domain/transforms.js';
import type { Matrix3 } from '@/domain/transforms.js';

/**
 * Compute move delta in world-space from a client-space drag.
 *
 * @param {{ startClientX: number, startClientY: number, currentClientX: number, currentClientY: number, zoom: number }} args
 * @returns {{ dx: number, dy: number }}
 */
interface Point { x: number; y: number }
interface MoveDeltaInput { startClientX: number; startClientY: number; currentClientX: number; currentClientY: number; zoom: number }
interface RotationDeltaInput { startAngle: number; currentPoint: Point; pivotPoint: Point; snap15?: boolean }
interface PivotTransformInput {
  startPivotX: number; startPivotY: number; startX: number; startY: number;
  localDeltaX: number; localDeltaY: number; rotation: number; scaleX: number; scaleY: number;
}
export interface ResizeTransformInput {
  fixedLocalX: number; fixedLocalY: number; pivotX: number; pivotY: number;
  startX: number; startY: number; startRotation: number;
  startScaleX: number; startScaleY: number;
}

export const MIN_ABS_RESIZE_SCALE = 1e-4;
export const MAX_ABS_RESIZE_SCALE = 1e4;

export function safeResizeScale(value: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  const bounded = Math.max(-MAX_ABS_RESIZE_SCALE, Math.min(MAX_ABS_RESIZE_SCALE, value));
  if (Math.abs(bounded) >= MIN_ABS_RESIZE_SCALE) return bounded;
  const sign = bounded < 0 ? -1 : (fallback < 0 ? -1 : 1);
  return sign * MIN_ABS_RESIZE_SCALE;
}

export function safeScaleRatio(value: number, start: number): number {
  if (!Number.isFinite(value) || !Number.isFinite(start) || Math.abs(start) < MIN_ABS_RESIZE_SCALE) return 1;
  return value / start;
}

export function scaleAroundWorldPoint(matrix: Matrix3, factorX: number, factorY: number, pivotX: number, pivotY: number): Matrix3 {
  const axisLength = Math.hypot(matrix[0], matrix[1]) || 1;
  const cos = matrix[0] / axisLength;
  const sin = matrix[1] / axisLength;
  const m0 = cos * cos * factorX + sin * sin * factorY;
  const m1 = cos * sin * (factorX - factorY);
  const m3 = m1;
  const m4 = sin * sin * factorX + cos * cos * factorY;
  const around = new Float32Array([
    m0, m1, 0,
    m3, m4, 0,
    pivotX - m0 * pivotX - m3 * pivotY,
    pivotY - m1 * pivotX - m4 * pivotY,
    1,
  ]);
  return mat3Mul(around, matrix);
}

export function resizeTransformPatch(input: ResizeTransformInput, scaleX: number, scaleY: number): { x: number; y: number; scaleX: number; scaleY: number } {
  const radians = (input.startRotation * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const localX = input.fixedLocalX - input.pivotX;
  const localY = input.fixedLocalY - input.pivotY;
  const deltaScaleX = input.startScaleX - scaleX;
  const deltaScaleY = input.startScaleY - scaleY;
  return {
    x: input.startX + cos * deltaScaleX * localX - sin * deltaScaleY * localY,
    y: input.startY + sin * deltaScaleX * localX + cos * deltaScaleY * localY,
    scaleX,
    scaleY,
  };
}

export function computeMoveDelta({ startClientX, startClientY, currentClientX, currentClientY, zoom }: MoveDeltaInput): { dx: number; dy: number } {
  const z = zoom || 1;
  return {
    dx: (currentClientX - startClientX) / z,
    dy: (currentClientY - startClientY) / z,
  };
}

/**
 * Compute rotation delta in degrees from two angles.
 *
 * @param {{ startAngle: number, currentPoint: { x: number, y: number }, pivotPoint: { x: number, y: number }, snap15?: boolean }} args
 * @returns {number} rotation delta in degrees
 */
export function computeRotationDelta({ startAngle, currentPoint, pivotPoint, snap15 = false }: RotationDeltaInput): number {
  const dx = currentPoint.x - pivotPoint.x;
  const dy = currentPoint.y - pivotPoint.y;
  const currentAngle = Math.atan2(dy, dx);
  let delta = (currentAngle - startAngle) * (180 / Math.PI);
  if (snap15) delta = Math.round(delta / 15) * 15;
  return delta;
}

/**
 * Compute the pivot transform patch when moving the pivot point.
 *
 * When the pivot moves by (localDeltaX, localDeltaY) in local space,
 * the node position must be compensated to keep the visual transform stable.
 *
 * @param {{ startPivotX: number, startPivotY: number, startX: number, startY: number, localDeltaX: number, localDeltaY: number, rotation: number, scaleX: number, scaleY: number }} args
 * @returns {{ pivotX: number, pivotY: number, x: number, y: number }}
 */
export function computePivotTransformPatch({
  startPivotX, startPivotY, startX, startY,
  localDeltaX, localDeltaY,
  rotation, scaleX, scaleY,
}: PivotTransformInput): { pivotX: number; pivotY: number; x: number; y: number } {
  const θ = (rotation || 0) * (Math.PI / 180);
  const c = Math.cos(θ), s = Math.sin(θ);
  const sX = scaleX ?? 1;
  const sY = scaleY ?? 1;

  const m0 = sX * c;
  const m1 = sX * s;
  const m3 = -sY * s;
  const m4 = sY * c;

  return {
    pivotX: startPivotX + localDeltaX,
    pivotY: startPivotY + localDeltaY,
    x: startX + localDeltaX * (m0 - 1) + localDeltaY * m3,
    y: startY + localDeltaX * m1 + localDeltaY * (m4 - 1),
  };
}
