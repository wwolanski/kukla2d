import type { Transform } from "@kukla2d/contracts";

/**
 * Pure helper: apply a node transform to a Pixi display object.
 *
 * Maps project transform fields to Pixi position/rotation/scale/pivot.
 * Project matrices translate to x+pivot before rotating/scaling around pivot;
 * Pixi's position is the world position of the pivot, so it must receive x+pivot.
 * Does NOT import React, Zustand, DOM, or WebGL.
 */

/**
 * @param {{ position: {x:number,y:number}, rotation: number, scale: {x:number,y:number}, pivot: {x:number,y:number} }} displayObject
 * @param {{ x?: number, y?: number, rotation?: number, scaleX?: number, scaleY?: number, pivotX?: number, pivotY?: number }} t
 */
import type { Container } from "pixi.js";

type PixiTransformInput = Partial<Transform>;

type TransformableDisplayObject = Pick<
  Container,
  "position" | "rotation" | "scale" | "pivot"
>;

export function applyNodeTransformToPixiDisplayObject(
  displayObject: TransformableDisplayObject,
  t: PixiTransformInput | null | undefined,
): void {
  const {
    x = 0,
    y = 0,
    rotation = 0,
    scaleX = 1,
    scaleY = 1,
    pivotX = 0,
    pivotY = 0,
  } = t ?? {};

  displayObject.position.x = x + pivotX;
  displayObject.position.y = y + pivotY;
  displayObject.rotation = rotation * (Math.PI / 180);
  displayObject.scale.x = scaleX;
  displayObject.scale.y = scaleY;
  displayObject.pivot.x = pivotX;
  displayObject.pivot.y = pivotY;
}
