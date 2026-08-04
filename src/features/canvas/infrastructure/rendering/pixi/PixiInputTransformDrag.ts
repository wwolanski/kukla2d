import { makeLocalMatrix, mat3Inverse, mat3Mul } from '@/domain/transforms';
import type { Matrix3 } from '@/domain/transforms';

import {
  computeMoveDelta,
  computeRotationDelta,
  computePivotTransformPatch,
  resizeTransformPatch,
  safeResizeScale,
  safeScaleRatio,
  scaleAroundWorldPoint,
} from '@/features/canvas/domain/dragMath.js';
import { resolveLinkedNodeAuthoredTransform } from '@/features/canvas/domain/linkedNodeAuthoring.js';
import {
  rotateLinkedBoneSelection,
  rotateLinkedNodeGroup,
  scaleLinkedNodeGroup,
  scaleBoneSelectionLengths,
  translateLinkedBoneSelection,
  translateLinkedNodeGroup,
} from '@/features/rigging';

import { clearSetupPoseTargets, previewPosePartial } from './PixiPosePreview.js';

import type { DragState, PixiInteractionSystem, PointerInput } from './PixiInteractionSystem.js';

type MoveDrag = Extract<DragState, { type: 'move' }>;
type RotateDrag = Extract<DragState, { type: 'rotate' }>;
type PivotDrag = Extract<DragState, { type: 'pivot' }>;
type ResizeDrag = Extract<DragState, { type: 'resize' }>;
type BoneMoveDrag = Extract<DragState, { type: 'boneMove' }>;
type BoneRotateDrag = Extract<DragState, { type: 'boneRotate' }>;
type BoneLengthDrag = Extract<DragState, { type: 'boneLength' }>;

const DEFAULT_TRANSFORM = { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1, pivotX: 0, pivotY: 0 };

function resolveLinkedAnimPatch(adapter: PixiInteractionSystem, drag: MoveDrag | RotateDrag | ResizeDrag, desiredWorldMatrix: Matrix3) {
  const project = adapter.projectRef.current;
  const node = project.nodes.find(n => n.id === drag.nodeId);
  if (!node || !drag.linkedBone || !drag.linkedPreLinkedWorldMatrices) return null;
  return resolveLinkedNodeAuthoredTransform({
    node,
    bone: drag.linkedBone,
    boneOverrides: drag.linkedBone.setup,
    preLinkedWorldMatrices: drag.linkedPreLinkedWorldMatrices,
    desiredDisplayedWorld: desiredWorldMatrix,
  });
}

export function handleTransformDrag(adapter: PixiInteractionSystem, e: PointerInput, drag: DragState): boolean {
  if (drag.type === 'move') return handleMoveDrag(adapter, e, drag);
  if (drag.type === 'rotate') return handleRotateDrag(adapter, e, drag);
  if (drag.type === 'pivot') return handlePivotDrag(adapter, e, drag);
  if (drag.type === 'resize') return handleResizeDrag(adapter, e, drag);
  if (drag.type === 'boneMove') return handleBoneMoveDrag(adapter, e, drag);
  if (drag.type === 'boneRotate') return handleBoneRotateDrag(adapter, e, drag);
  if (drag.type === 'boneLength') return handleBoneLengthDrag(adapter, e, drag);
  return false;
}

function handleResizeDrag(adapter: PixiInteractionSystem, e: PointerInput, drag: ResizeDrag): true {
  const world = adapter._eventWorldPosition(e);
  if (!world) return true;
  const { iswm } = drag;
  const localX = iswm[0] * world.x + iswm[3] * world.y + iswm[6];
  const localY = iswm[1] * world.x + iswm[4] * world.y + iswm[7];
  const denomX = drag.cornerLocalX - drag.fixedLocalX;
  const denomY = drag.cornerLocalY - drag.fixedLocalY;
  let scaleX = Math.abs(denomX) > 1e-6
    ? drag.startScaleX * (localX - drag.fixedLocalX) / denomX
    : drag.startScaleX;
  let scaleY = Math.abs(denomY) > 1e-6
    ? drag.startScaleY * (localY - drag.fixedLocalY) / denomY
    : drag.startScaleY;
  if (e.shiftKey) {
    const ratioX = safeScaleRatio(scaleX, drag.startScaleX);
    const ratioY = safeScaleRatio(scaleY, drag.startScaleY);
    const factor = Math.abs(ratioX) > Math.abs(ratioY) ? ratioX : ratioY;
    scaleX = drag.startScaleX * factor;
    scaleY = drag.startScaleY * factor;
  }
  scaleX = safeResizeScale(scaleX, drag.startScaleX);
  scaleY = safeResizeScale(scaleY, drag.startScaleY);
  const factorX = safeScaleRatio(scaleX, drag.startScaleX);
  const factorY = safeScaleRatio(scaleY, drag.startScaleY);
  const patch = resizeTransformPatch(drag, scaleX, scaleY);
  drag.lastPatch = patch;
  if (drag.linkedAnim) {
    const resolved = resolveLinkedAnimPatch(adapter, drag, scaleAroundWorldPoint(
      drag.startWorldMatrix,
      factorX,
      factorY,
      drag.fixedWorldX,
      drag.fixedWorldY,
    ));
    if (!resolved?.valid) return true;
    previewPosePartial(adapter, drag.nodeId, resolved.transform);
  } else if (drag.isAnimMode) {
    previewPosePartial(adapter, drag.nodeId, patch);
  } else if (drag.isLinked) {
    const snapshot = drag.linkedScaleSnapshot;
    const factorX = snapshot
      ? safeScaleRatio(scaleX, drag.startScaleX)
      : safeScaleRatio(scaleX, drag.lastScaleX);
    const factorY = snapshot
      ? safeScaleRatio(scaleY, drag.startScaleY)
      : safeScaleRatio(scaleY, drag.lastScaleY);
    drag.lastScaleX = scaleX;
    drag.lastScaleY = scaleY;
    drag.lastPatch = null;
    adapter._executeCommand({
      type: 'updateProject',
      payload: { mutator: project => {
        if (snapshot) {
          const bone = project.bones.find(candidate => candidate.id === snapshot.boneId);
          if (bone) Object.assign(bone.setup, snapshot.boneSetup);
          for (const [nodeId, transform] of Object.entries(snapshot.nodeTransforms)) {
            const node = project.nodes.find(candidate => candidate.id === nodeId);
            if (node) Object.assign(node.transform, transform);
          }
        }
        scaleLinkedNodeGroup(project, drag.nodeId, factorX, factorY, {
          pivotWorld: { x: drag.fixedWorldX, y: drag.fixedWorldY },
        });
      } },
    });
  } else adapter._setPreviewPose(drag.nodeId, patch);
  adapter.markDirty();
  return true;
}

function handleMoveDrag(adapter: PixiInteractionSystem, e: PointerInput, drag: MoveDrag): true {
  const world = adapter._eventWorldPosition(e);
  if (!world) return true;
  const dx = world.x - drag.startWorldX;
  const dy = world.y - drag.startWorldY;

  if (drag.linkedAnim) {
    const project = adapter.projectRef.current;
    const node = project.nodes.find(n => n.id === drag.nodeId);
    if (!node) return true;
    const parentWorld = node.parent && drag.linkedPreLinkedWorldMatrices
      ? (drag.linkedPreLinkedWorldMatrices.get(node.parent) ?? null)
      : null;
    const parentInv = parentWorld ? mat3Inverse(parentWorld) : null;
    const srcLocal = makeLocalMatrix({ x: drag.startX, y: drag.startY, rotation: 0, scaleX: 1, scaleY: 1, pivotX: node.transform?.pivotX ?? 0, pivotY: node.transform?.pivotY ?? 0 });
    const srcWorld = parentInv ? mat3Mul(parentInv, srcLocal) : srcLocal;
    const boneSetup = drag.linkedBone?.setup ?? {};
    const boneOverrides = drag.linkedBone ?? {};
    const boneDelta = mat3Mul(makeLocalMatrix(boneOverrides), mat3Inverse(makeLocalMatrix(boneSetup)));
    const desiredWorld = mat3Mul(boneDelta, srcWorld);
    desiredWorld[6] += dx;
    desiredWorld[7] += dy;
    const resolved = resolveLinkedAnimPatch(adapter, drag, desiredWorld);
    if (!resolved?.valid) return true;
    previewPosePartial(adapter, drag.nodeId, resolved.transform);
  } else if (drag.isAnimMode) {
    const partial = { x: drag.startX + dx, y: drag.startY + dy };
    previewPosePartial(adapter, drag.nodeId, partial);
  } else if (drag.isLinked) {
    const stepDx = dx - (drag.lastDx ?? 0);
    const stepDy = dy - (drag.lastDy ?? 0);
    drag.lastDx = dx;
    drag.lastDy = dy;
    adapter._executeCommand({
      type: 'updateProject',
      payload: { mutator: project => translateLinkedNodeGroup(project, drag.nodeId, stepDx, stepDy) },
    });
  } else {
    drag.lastPatch = { x: drag.startX + dx, y: drag.startY + dy };
    adapter._setPreviewPose(drag.nodeId, drag.lastPatch);
  }
  adapter.markDirty();
  return true;
}

function handleRotateDrag(adapter: PixiInteractionSystem, e: PointerInput, drag: RotateDrag): true {
  const worldPos = adapter._eventWorldPosition(e);
  if (!worldPos) return true;

  if (drag.startAngle === null) {
    const dx = worldPos.x - drag.pivotWorldX;
    const dy = worldPos.y - drag.pivotWorldY;
    drag.startAngle = Math.atan2(dy, dx);
    return true;
  }

  const delta = computeRotationDelta({
    startAngle: drag.startAngle,
    currentPoint: { x: worldPos.x, y: worldPos.y },
    pivotPoint: { x: drag.pivotWorldX, y: drag.pivotWorldY },
    snap15: !!e.shiftKey,
  });

  if (drag.linkedAnim) {
    const project = adapter.projectRef.current;
    const node = project.nodes.find(n => n.id === drag.nodeId);
    if (!node) return true;
    const boneSetup = drag.linkedBone?.setup ?? {};
    const boneOverrides = drag.linkedBone ?? {};
    const boneDelta = mat3Mul(makeLocalMatrix(boneOverrides), mat3Inverse(makeLocalMatrix(boneSetup)));
    const boneDeltaRotation = Math.atan2(boneDelta[1], boneDelta[0]) * (180 / Math.PI);
    const srcRotation = drag.startRotation - boneDeltaRotation;
    const resolved = resolveLinkedAnimPatch(adapter, drag, (() => {
      const nodeLocal = makeLocalMatrix({ x: node.transform?.x ?? 0, y: node.transform?.y ?? 0, rotation: srcRotation, scaleX: 1, scaleY: 1, pivotX: node.transform?.pivotX ?? 0, pivotY: node.transform?.pivotY ?? 0 });
      const parentWorld = node.parent && drag.linkedPreLinkedWorldMatrices
        ? (drag.linkedPreLinkedWorldMatrices.get(node.parent) ?? null)
        : null;
      const parentInv = parentWorld ? mat3Inverse(parentWorld) : null;
      const srcWorld = parentInv ? mat3Mul(parentInv, nodeLocal) : nodeLocal;
      return mat3Mul(boneDelta, srcWorld);
    })());
    if (!resolved?.valid) return true;
    previewPosePartial(adapter, drag.nodeId, resolved.transform);
  } else if (drag.isAnimMode) {
    const partial = { rotation: drag.startRotation + delta };
    previewPosePartial(adapter, drag.nodeId, partial);
  } else if (drag.isLinked) {
    const stepDelta = delta - (drag.lastDelta ?? 0);
    drag.lastDelta = delta;
    adapter._executeCommand({
      type: 'updateProject',
      payload: { mutator: project => rotateLinkedNodeGroup(project, drag.nodeId, stepDelta) },
    });
  } else {
    drag.lastPatch = { rotation: drag.startRotation + delta };
    adapter._setPreviewPose(drag.nodeId, drag.lastPatch);
  }
  adapter.markDirty();
  return true;
}

function handlePivotDrag(adapter: PixiInteractionSystem, e: PointerInput, drag: PivotDrag): true {
  const { zoom } = adapter.editorRef.current.view;
  const { dx, dy } = computeMoveDelta({
    startClientX: drag.startClientX,
    startClientY: drag.startClientY,
    currentClientX: e.clientX,
    currentClientY: e.clientY,
    zoom,
  });

  const { iswm } = drag;
  const localDeltaX = iswm[0] * dx + iswm[3] * dy;
  const localDeltaY = iswm[1] * dx + iswm[4] * dy;

  const projectNode = adapter.projectRef.current.nodes.find(n => n.id === drag.nodeId);
  const transform = projectNode?.transform ?? DEFAULT_TRANSFORM;
  const { rotation = 0, scaleX: sX = 1, scaleY: sY = 1 } = transform;
  drag.lastPatch = computePivotTransformPatch({
    startPivotX: drag.startPivotX,
    startPivotY: drag.startPivotY,
    startX: drag.startX,
    startY: drag.startY,
    localDeltaX,
    localDeltaY,
    rotation,
    scaleX: sX,
    scaleY: sY,
  });
  adapter._executeCommand({
    type: 'updateProject',
    payload: { mutator: (project, versionControl) => {
      const node = project.nodes.find(n => n.id === drag.nodeId);
      if (!node) return;
      Object.assign(node.transform, drag.lastPatch);
      if (versionControl) versionControl.transformVersion++;
    } },
  });
  adapter.markDirty();
  return true;
}

function handleBoneMoveDrag(adapter: PixiInteractionSystem, e: PointerInput, drag: BoneMoveDrag): true {
  const world = adapter._eventWorldPosition(e);
  if (!world) return true;
  const dx = world.x - drag.startWorldX;
  const dy = world.y - drag.startWorldY;
  const minDrag = 3 / Math.max(adapter.editorRef.current?.view?.zoom ?? 1, 0.001);
  if (Math.hypot(dx, dy) < minDrag) return true;
  if (drag.useDraftPose) {
    for (const boneId of drag.boneIds ?? [drag.boneId]) {
      const start = drag.startBones?.[boneId] ?? {};
      previewPosePartial(adapter, boneId, {
        x: (start.x ?? 0) + dx,
        y: (start.y ?? 0) + dy,
      });
    }
    adapter.markDirty();
    return true;
  }
  ensureSetupPoseCleared(adapter, drag);
  const stepDx = dx - (drag.lastDx ?? 0);
  const stepDy = dy - (drag.lastDy ?? 0);
  drag.lastDx = dx;
  drag.lastDy = dy;
  adapter._executeCommand({
    type: 'updateProject',
    // Setup edit moves bind data only. Frame evaluation already applies the
    // bind→IK-pose delta to every linked node; applying resolved IK here too
    // would transform the image twice.
    payload: {
      mutator: project => translateLinkedBoneSelection(
        project,
        drag.boneIds ?? [drag.boneId],
        stepDx,
        stepDy,
      ),
    },
  });
  adapter.markDirty();
  return true;
}

function handleBoneRotateDrag(adapter: PixiInteractionSystem, e: PointerInput, drag: BoneRotateDrag): true {
  const worldPos = adapter._eventWorldPosition(e);
  if (!worldPos) return true;
  if (drag.startAngle === null) {
    drag.startAngle = Math.atan2(worldPos.y - drag.pivotY, worldPos.x - drag.pivotX);
    return true;
  }
  const currentAngle = Math.atan2(worldPos.y - drag.pivotY, worldPos.x - drag.pivotX);
  let delta = (currentAngle - drag.startAngle) * (180 / Math.PI);
  if (e.shiftKey) delta = Math.round(delta / 15) * 15;
  if (Math.abs(delta) < 0.5) return true;
  if (drag.useDraftPose) {
    const radians = delta * Math.PI / 180;
    const cos = Math.cos(radians);
    const sin = Math.sin(radians);
    const boneIds = drag.boneIds ?? [drag.boneId];
    for (const boneId of boneIds) {
      const start = drag.startBones?.[boneId] ?? {};
      const partial: { rotation: number; x?: number; y?: number } = { rotation: (start.rotation ?? 0) + delta };
      if (boneIds.length > 1) {
        const dx = (start.x ?? 0) - drag.pivotX;
        const dy = (start.y ?? 0) - drag.pivotY;
        partial.x = drag.pivotX + dx * cos - dy * sin;
        partial.y = drag.pivotY + dx * sin + dy * cos;
      }
      previewPosePartial(adapter, boneId, partial);
    }
    adapter.markDirty();
    return true;
  }
  ensureSetupPoseCleared(adapter, drag);
  const stepDelta = delta - (drag.lastDelta ?? 0);
  drag.lastDelta = delta;
  adapter._executeCommand({
    type: 'updateProject',
    payload: { mutator: project => rotateLinkedBoneSelection(project, drag.boneIds ?? [drag.boneId], stepDelta) },
  });
  adapter.markDirty();
  return true;
}

function handleBoneLengthDrag(adapter: PixiInteractionSystem, e: PointerInput, drag: BoneLengthDrag): true {
  const world = adapter._eventWorldPosition(e);
  if (!world) return true;
  const dx = world.x - drag.startWorldX;
  const dy = world.y - drag.startWorldY;
  const projection = dx * drag.axisX + dy * drag.axisY;
  const minDrag = 3 / Math.max(adapter.editorRef.current?.view?.zoom ?? 1, 0.001);
  if (Math.abs(projection) < minDrag) return true;
  const nextLength = Math.max(10, drag.startLength + projection);
  const factor = nextLength / Math.max(10, drag.startLength);
  drag.lastLength = nextLength;
  if (drag.useDraftPose) {
    for (const boneId of drag.boneIds ?? [drag.boneId]) {
      previewPosePartial(adapter, boneId, {
        length: Math.max(10, (drag.startLengths?.[boneId] ?? drag.startLength) * factor),
      });
    }
    adapter.markDirty();
    return true;
  }
  ensureSetupPoseCleared(adapter, drag);
  adapter._executeCommand({
    type: 'updateProject',
    payload: {
      mutator: project => scaleBoneSelectionLengths(
        project,
        drag.startLengths ?? { [drag.boneId]: drag.startLength },
        factor,
      ),
    },
  });
  adapter.markDirty();
  return true;
}

function ensureSetupPoseCleared(adapter: PixiInteractionSystem, drag: BoneMoveDrag | BoneRotateDrag | BoneLengthDrag): void {
  if (drag.useDraftPose || drag.setupPoseCleared) return;
  clearSetupPoseTargets(
    adapter,
    drag.boneIds ?? [drag.boneId],
    drag.setupEffectiveValues,
  );
  drag.setupPoseCleared = true;
}
