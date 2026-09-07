import { Graphics, type Container, type FederatedPointerEvent } from "pixi.js";

import type { BoneId } from "@kukla2d/contracts";

import { computeWorldMatrices } from "@/domain/transforms";

import type { GizmoFrame } from "@/features/canvas/domain/gizmoFrame.types.js";
import {
  findAlphaHit,
  findBoneHit,
  findConstraintTargetHit,
} from "@/features/canvas/domain/picking.js";
import type { buildSkeletonFrame } from "@/features/canvas/domain/skeletonFrame.js";
import type { WarpLatticeFrame } from "@/features/canvas/domain/warpLatticeFrame.types.js";

import { getAdapterEffectiveRigState } from "./PixiInputState.js";

import type { PointerInput } from "./pixiInteractionContracts.types.js";
import type { BoundListener } from "./pixiInteractionDragContracts.types.js";
import type { PixiInteractionSystem } from "./PixiInteractionSystem.js";

type SkeletonFrame = NonNullable<ReturnType<typeof buildSkeletonFrame>>;
type PointerHandler = (event: FederatedPointerEvent) => void;
type CapturePolicy = (event: FederatedPointerEvent) => boolean;
type HandleName =
  | "_moveArea"
  | "_moveHandle"
  | "_rotateHandle"
  | "_pivotHandle"
  | "_boneBodyHandle"
  | "_boneRotateHandle"
  | "_boneLengthHandle"
  | "_poseHandle";
interface Point {
  x: number;
  y: number;
}

const HANDLE_HIT_RADIUS = 12;

export function createGizmoHandles(
  adapter: PixiInteractionSystem,
  frame: GizmoFrame,
  zoom: number,
): void {
  const invZoom = zoom > 0 ? 1 / zoom : 1;
  const hitR = HANDLE_HIT_RADIUS * invZoom;
  const selectedId = adapter.editorRef.current?.selection?.[0];
  const selectedNode = adapter.projectRef.current?.nodes?.find(
    (n) => n.id === selectedId,
  );
  const pivotLocked = selectedNode?.pivotLocked !== false;

  adapter._moveArea =
    frame.bboxPoints?.length >= 3
      ? makeHitPolygon(
          adapter,
          frame.bboxPoints,
          (e) => adapter._startMoveDrag(e),
          (e) => shouldCaptureSelectedPart(adapter, e, selectedId),
        )
      : makeHitCircle(
          adapter,
          frame.center.x,
          frame.center.y,
          hitR,
          0x38bdf8,
          (e) => adapter._startMoveDrag(e),
          "move",
          (e) => shouldCaptureSelectedPart(adapter, e, selectedId),
        );
  adapter._pivotHandle = makeHitCircle(
    adapter,
    frame.pivot.x,
    frame.pivot.y,
    hitR,
    0x22d3ee,
    pivotLocked ? null : (e) => adapter._startPivotDrag(e),
    pivotLocked ? "default" : "pointer",
  );
  adapter._rotateHandle = makeHitCircle(
    adapter,
    frame.rotationHandle.x,
    frame.rotationHandle.y,
    hitR,
    0xfacc15,
    (event) => adapter._startRotateDrag(event),
  );
  (frame.bboxPoints ?? []).forEach((point, index) => {
    adapter._resizeHandles.push(
      makeHitCircle(adapter, point.x, point.y, hitR, 0x0891b2, (e) =>
        adapter._startResizeDrag(e, index, frame),
      ),
    );
  });
}

export function shouldCaptureSelectedPart(
  adapter: PixiInteractionSystem,
  event: PointerInput,
  selectedId: string | undefined,
): boolean {
  if (!selectedId) return true;
  const world = adapter._eventWorldPosition(event);
  if (!world) return true;
  const { nodes } = getAdapterEffectiveRigState(adapter);
  if (findTopRigHit(adapter, world)) return false;
  const alphaHit = findAlphaHit({
    parts: nodes.filter((node) => node.type === "part"),
    imageDataByPartId: adapter.imageDataByPartId,
    worldMatrices: computeWorldMatrices(nodes),
    worldX: world.x,
    worldY: world.y,
  });
  return alphaHit == null || alphaHit === selectedId;
}

export function shouldCaptureSelectedBone(
  adapter: PixiInteractionSystem,
  event: PointerInput,
  boneId: BoneId,
): boolean {
  if (!boneId) return true;
  const world = adapter._eventWorldPosition(event);
  if (!world) return true;
  const hit = findTopRigHit(adapter, world);
  const editor = adapter.editorRef.current;
  const isSelected =
    editor.activeBoneId === boneId || editor.selection?.includes(boneId);
  if (hit == null) return isSelected;
  return hit === `bone:${boneId}` && isSelected;
}

function findTopRigHit(
  adapter: PixiInteractionSystem,
  world: Point,
): string | null {
  const editor = adapter.editorRef.current;
  if (!["all", "rig"].includes(editor.selectionTarget ?? "element"))
    return null;
  const project = adapter.projectRef.current;
  const { bones, poseOverrides } = getAdapterEffectiveRigState(adapter);
  const constraints = (project.constraints ?? []).map((constraint) => ({
    ...constraint,
    ...(poseOverrides?.get?.(constraint.id) ?? {}),
  }));
  const constraintId = findConstraintTargetHit({
    constraints,
    worldX: world.x,
    worldY: world.y,
    zoom: editor.view.zoom,
  });
  if (constraintId) return `constraint:${constraintId}`;
  const boneId = findBoneHit({
    bones,
    worldX: world.x,
    worldY: world.y,
    zoom: editor.view.zoom,
  });
  return boneId ? `bone:${boneId}` : null;
}

function makeHitPolygon(
  adapter: PixiInteractionSystem,
  points: readonly Point[],
  onDown: PointerHandler,
  shouldCapture: CapturePolicy | null = null,
): Graphics {
  const g = new Graphics();
  g.poly(points.flatMap((point) => [point.x, point.y])).fill({
    color: 0xffffff,
    alpha: 0.001,
  });
  g.eventMode = "static";
  g.cursor = "move";
  const onPointerDown = (e: FederatedPointerEvent) => {
    if ((e.button ?? 0) !== 0) return;
    if (shouldCapture && !shouldCapture(e)) return;
    e.stopPropagation();
    onDown(e);
  };
  g.on("pointerdown", onPointerDown);
  adapter._boundListeners.push({
    target: g,
    event: "pointerdown",
    fn: onPointerDown,
    kind: "pixi",
  });
  adapter.overlayLayer.addChild(g);
  return g;
}

export function createWarpHandles(
  adapter: PixiInteractionSystem,
  frame: WarpLatticeFrame,
  zoom: number,
): void {
  const invZoom = zoom > 0 ? 1 / zoom : 1;
  const hitR = HANDLE_HIT_RADIUS * invZoom;

  for (let i = 0; i < frame.gridPoints.length; i++) {
    const pt = frame.gridPoints[i];
    if (!pt) continue;
    const handle = makeHitCircle(adapter, pt.x, pt.y, hitR, 0x50c8ff, () =>
      adapter._startWarpDrag(i),
    );
    adapter._warpHandles.push(handle);
  }
}

export function createSkeletonHandles(
  adapter: PixiInteractionSystem,
  frame: SkeletonFrame,
  zoom: number,
): void {
  const invZoom = zoom > 0 ? 1 / zoom : 1;
  const hitR = HANDLE_HIT_RADIUS * invZoom;
  const isPoseTool = adapter.editorRef.current?.activeTool === "pose";

  if (!isPoseTool) {
    for (let i = 0; i < frame.joints.length; i++) {
      const joint = frame.joints[i];
      if (!joint) continue;
      const jointBone = adapter.projectRef.current.bones.find(
        (bone) => bone.id === joint.boneId,
      );
      if (!jointBone) continue;
      const handle = makeHitCircle(
        adapter,
        joint.x,
        joint.y,
        hitR,
        0x38bdf8,
        (e) => adapter._startBoneDrag(e, jointBone.id),
        "pointer",
        (e) => shouldCaptureSelectedBone(adapter, e, jointBone.id),
      );
      adapter._skeletonHandles.push(handle);
    }
  }

  const tf = frame.boneTransformFrame;
  if (tf && !isPoseTool) {
    const polyPoints = thickSegmentPolygon(tf.start, tf.end, 14 * invZoom);
    adapter._boneBodyHandle = makeHitPolygon(
      adapter,
      polyPoints,
      (e) => adapter._startBoneDrag(e, tf.boneId),
      (e) => shouldCaptureSelectedBone(adapter, e, tf.boneId),
    );
    adapter._boneRotateHandle = makeHitCircle(
      adapter,
      tf.rotateHandle.x,
      tf.rotateHandle.y,
      Math.max(
        hitR,
        (tf.rotateHitRadius ?? tf.rotateRingRadius ?? 24) * invZoom,
      ),
      0x22d3ee,
      (event) => adapter._startBoneRotate(event),
    );
    if (tf.lengthAllowed !== false) {
      adapter._boneLengthHandle = makeHitCircle(
        adapter,
        tf.lengthHandle.x,
        tf.lengthHandle.y,
        Math.max(hitR, (tf.lengthHandleRadius ?? 7) * invZoom),
        0xec4899,
        (e) => adapter._startBoneLength(e),
      );
    }
  }

  const pose = frame.poseHandleFrame;
  if (pose) {
    adapter._poseHandle = makeHitCircle(
      adapter,
      pose.handle.x,
      pose.handle.y,
      Math.max(hitR, 10 * invZoom),
      0xef4444,
      (event) => adapter._startPoseHandleDrag(event, pose),
      "grab",
    );
  }
}

function thickSegmentPolygon(a: Point, b: Point, width: number): Point[] {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  const px = -uy;
  const py = ux;
  const half = width / 2;
  return [
    { x: a.x + px * half, y: a.y + py * half },
    { x: b.x + px * half, y: b.y + py * half },
    { x: b.x - px * half, y: b.y - py * half },
    { x: a.x - px * half, y: a.y - py * half },
  ];
}

export function makeHitCircle(
  adapter: PixiInteractionSystem,
  x: number,
  y: number,
  radius: number,
  color: number,
  onDown: PointerHandler | null,
  cursor = "pointer",
  shouldCapture: CapturePolicy | null = null,
): Graphics {
  const g = new Graphics();
  g.circle(0, 0, radius).fill({ color, alpha: 0.001 });
  g.position.set(x, y);
  g.eventMode = onDown ? "static" : "none";
  g.cursor = cursor;
  if (!onDown) {
    adapter.overlayLayer.addChild(g);
    return g;
  }

  const onPointerDown = (e: FederatedPointerEvent) => {
    if ((e.button ?? 0) !== 0) return;
    if (shouldCapture && !shouldCapture(e)) return;
    e.stopPropagation();
    onDown?.(e);
  };
  g.on("pointerdown", onPointerDown);
  adapter._boundListeners.push({
    target: g,
    event: "pointerdown",
    fn: onPointerDown,
    kind: "pixi",
  });

  adapter.overlayLayer.addChild(g);
  return g;
}

export function clearHandles(adapter: PixiInteractionSystem): void {
  for (const h of adapter._warpHandles) {
    removeBoundListenersFor(adapter, h);
    if (h.parent) h.parent.removeChild(h);
    h.destroy();
  }
  adapter._warpHandles = [];
  for (const h of adapter._skeletonHandles) {
    removeBoundListenersFor(adapter, h);
    if (h.parent) h.parent.removeChild(h);
    h.destroy();
  }
  adapter._skeletonHandles = [];
  for (const h of adapter._resizeHandles) {
    removeBoundListenersFor(adapter, h);
    if (h.parent) h.parent.removeChild(h);
    h.destroy();
  }
  adapter._resizeHandles = [];
  removeHandle(adapter, "_moveArea");
  removeHandle(adapter, "_moveHandle");
  removeHandle(adapter, "_rotateHandle");
  removeHandle(adapter, "_pivotHandle");
  removeHandle(adapter, "_boneBodyHandle");
  removeHandle(adapter, "_boneRotateHandle");
  removeHandle(adapter, "_boneLengthHandle");
  removeHandle(adapter, "_poseHandle");
}

export function removeHandle(
  adapter: PixiInteractionSystem,
  name: HandleName,
): void {
  const h = adapter[name];
  if (h) {
    removeBoundListenersFor(adapter, h);
    if (h.parent) h.parent.removeChild(h);
    h.destroy();
    adapter[name] = null;
  }
}

export function removeBoundListenersFor(
  adapter: PixiInteractionSystem,
  target: Container,
): void {
  adapter._boundListeners = adapter._boundListeners.filter((entry) => {
    if (entry.target !== target) return true;
    removeListener(entry);
    return false;
  });
}

export function removeListener(listener: BoundListener): void {
  if (listener.kind === "dom") {
    listener.target.removeEventListener(listener.event, listener.fn);
    return;
  }
  if (typeof listener.target.off === "function") {
    listener.target.off(listener.event, listener.fn);
    return;
  }
  if (hasDomRemoveListener(listener.target)) {
    const fallbackTarget: {
      removeEventListener(event: string, callback: unknown): void;
    } = listener.target;
    fallbackTarget.removeEventListener(listener.event, listener.fn);
  }
}

function hasDomRemoveListener(
  value: unknown,
): value is { removeEventListener(event: string, listener: unknown): void } {
  return (
    typeof value === "object" &&
    value !== null &&
    "removeEventListener" in value &&
    typeof value.removeEventListener === "function"
  );
}
