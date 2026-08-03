import type { Node } from '@kukla2d/contracts';

import { editorModePolicy, ACTION_IDS } from '@/domain/editorModePolicy.js';
import { computeWorldMatrices, mat3Inverse } from '@/domain/transforms';
import type { Matrix3 } from '@/domain/transforms';

import { getAssignedBoneForNode, getLinkedNodesForBone, isBoneLinkLocked } from '@/features/rigging';

import { getEventClientPosition, getEventWorldPosition } from './PixiInputDrag.js';
import { getAdapterEffectiveRigState, getEffectiveBones, getEffectiveNodes } from './PixiInputState.js';
import { canStartAnimationGesture, usesPoseDraft } from './PixiPosePreview.js';

import type { DragState, PixiInteractionSystem, PointerInput } from './PixiInteractionSystem.js';

interface ResizeFrame { bboxPoints: Array<{ x: number; y: number }> }

function captureLinkedAnimState(adapter: PixiInteractionSystem, projectNode: Node): Pick<Extract<DragState, { type: 'move' }>, 'linkedPreLinkedWorldMatrices' | 'linkedBone'> {
  const framePose = adapter.readFramePose?.();
  const preLinkedNodes = framePose?.preLinkedNodes ?? null;
  const part = projectNode.type === 'part' ? projectNode : null;
  const boneId = part?.boneId ?? part?.mesh?.jointBoneId
    ?? (part?.mesh?.influences ?? []).flatMap(vertex => vertex.map(influence => influence?.boneId)).find(Boolean);
  return {
    linkedPreLinkedWorldMatrices: preLinkedNodes ? computeWorldMatrices(preLinkedNodes) : null,
    linkedBone: (framePose?.effectiveBones ?? []).find(bone => bone.id === boneId) ?? null,
  };
}

export function startMoveDrag(adapter: PixiInteractionSystem, event: PointerInput): void {
  const editorState = adapter.editorRef.current;
  const project = adapter.projectRef.current;
  if (!canStartAnimationGesture(adapter)) return;
  const selection = editorState.selection;
  if (!selection?.length) return;
  const projectNode = project.nodes.find(node => node.id === selection[0]);
  const node = getAdapterEffectiveRigState(adapter).nodes.find(candidate => candidate.id === selection[0]);
  if (!projectNode || !node) return;
  const transform = node.transform ?? {};
  const start = getEventClientPosition(adapter, event);
  const startWorld = getEventWorldPosition(adapter, event);
  if (!startWorld) return;
  const isLinked = isBoneLinkLocked(projectNode) && !!getAssignedBoneForNode(project, projectNode.id);
  const isAnimMode = editorState.editorMode === 'animation';
  const linkedAnim = isAnimMode && isLinked;
  if (!isAnimMode) adapter._beginCommandBatch({ name: 'Transform drag', type: 'transform' });
  const gestureId = isAnimMode ? adapter.animationAuthoringAdapter?.beginGesture() : null;
  adapter._setDragState({
    type: 'move', nodeId: node.id, startClientX: start.x, startClientY: start.y,
    startWorldX: startWorld.x, startWorldY: startWorld.y,
    startX: transform.x ?? 0, startY: transform.y ?? 0,
    isAnimMode, isLinked: isAnimMode ? false : isLinked, linkedAnim,
    ...(linkedAnim ? captureLinkedAnimState(adapter, projectNode) : {}),
    lastDx: 0, lastDy: 0, lastPatch: null, gestureId,
  });
  adapter._sendWorkflow({ type: 'START_TRANSFORM_DRAG', payload: { mode: 'move', nodeId: node.id } });
}

export function startRotateDrag(adapter: PixiInteractionSystem, event: PointerInput): void {
  const editorState = adapter.editorRef.current;
  const project = adapter.projectRef.current;
  if (!canStartAnimationGesture(adapter)) return;
  const selection = editorState.selection;
  if (!selection?.length) return;
  const projectNode = project.nodes.find(node => node.id === selection[0]);
  const effectiveState = getAdapterEffectiveRigState(adapter);
  const node = effectiveState.nodes.find(candidate => candidate.id === selection[0]);
  if (!projectNode || !node) return;
  const transform = node.transform ?? {};
  const matrix = computeWorldMatrices(effectiveState.nodes).get(node.id);
  if (!matrix) return;
  const pivotX = transform.pivotX ?? 0;
  const pivotY = transform.pivotY ?? 0;
  const pivotWorldX = matrix[0] * pivotX + matrix[3] * pivotY + matrix[6];
  const pivotWorldY = matrix[1] * pivotX + matrix[4] * pivotY + matrix[7];
  const world = getEventWorldPosition(adapter, event);
  if (!world) return;
  const isAnimMode = editorState.editorMode === 'animation';
  const isLinked = isBoneLinkLocked(projectNode) && !!getAssignedBoneForNode(project, projectNode.id);
  if (!isAnimMode) adapter._beginCommandBatch({ name: 'Transform drag', type: 'transform' });
  const gestureId = isAnimMode ? adapter.animationAuthoringAdapter?.beginGesture() : null;
  adapter._setDragState({
    type: 'rotate', nodeId: node.id, startRotation: transform.rotation ?? 0, pivotWorldX, pivotWorldY,
    isAnimMode, isLinked: !isAnimMode && isLinked, linkedAnim: isAnimMode && isLinked,
    ...(isAnimMode && isLinked ? captureLinkedAnimState(adapter, projectNode) : {}),
    lastDelta: 0, startAngle: Math.atan2(world.y - pivotWorldY, world.x - pivotWorldX), lastPatch: null, gestureId,
  });
  adapter._sendWorkflow({ type: 'START_TRANSFORM_DRAG', payload: { mode: 'rotate', nodeId: node.id } });
}

export function startPivotDrag(adapter: PixiInteractionSystem, event: PointerInput): void {
  const editorState = adapter.editorRef.current;
  const project = adapter.projectRef.current;
  const selection = editorState.selection;
  if (!selection?.length) return;
  const node = project.nodes.find(candidate => candidate.id === selection[0]);
  if (!node || node.pivotLocked !== false) return;
  if (!editorModePolicy({ mode: editorState.editorMode, actionId: ACTION_IDS.BONE_PIVOT, targetKind: 'node' }).allowed) return;
  const transform = node.transform ?? {};
  const start = getEventClientPosition(adapter, event);
  const effectiveNodes = getAdapterEffectiveRigState(adapter).nodes;
  const matrix: Matrix3 = computeWorldMatrices(effectiveNodes).get(node.id) ?? [1, 0, 0, 0, 1, 0, 0, 0, 1];
  adapter._beginCommandBatch({ name: 'Pivot drag', type: 'transform' });
  adapter._setDragState({
    type: 'pivot', nodeId: node.id, startClientX: start.x, startClientY: start.y,
    startPivotX: transform.pivotX ?? 0, startPivotY: transform.pivotY ?? 0,
    startX: transform.x ?? 0, startY: transform.y ?? 0, iswm: mat3Inverse(matrix), lastPatch: null,
  });
  adapter._sendWorkflow({ type: 'START_TRANSFORM_DRAG', payload: { mode: 'pivot', nodeId: node.id } });
}

export function startResizeDrag(adapter: PixiInteractionSystem, _event: PointerInput, cornerIndex: number, frame: ResizeFrame): void {
  const editorState = adapter.editorRef.current;
  const project = adapter.projectRef.current;
  if (!canStartAnimationGesture(adapter)) return;
  const projectNode = project.nodes.find(node => node.id === editorState.selection?.[0]);
  const effectiveState = getAdapterEffectiveRigState(adapter);
  const node = effectiveState.nodes.find(candidate => candidate.id === editorState.selection?.[0]);
  if (!projectNode || !node) return;
  const matrix = computeWorldMatrices(effectiveState.nodes).get(node.id);
  if (!matrix) return;
  const determinant = matrix[0] * matrix[4] - matrix[1] * matrix[3];
  if (!Number.isFinite(determinant) || Math.abs(determinant) < 1e-10) return;
  const inverseMatrix = mat3Inverse(matrix);
  const corner = frame.bboxPoints[cornerIndex];
  const fixedCorner = frame.bboxPoints[(cornerIndex + 2) % frame.bboxPoints.length];
  if (!corner || !fixedCorner || frame.bboxPoints.length < 4) return;
  const cornerLocalX = inverseMatrix[0] * corner.x + inverseMatrix[3] * corner.y + inverseMatrix[6];
  const cornerLocalY = inverseMatrix[1] * corner.x + inverseMatrix[4] * corner.y + inverseMatrix[7];
  const fixedLocalX = inverseMatrix[0] * fixedCorner.x + inverseMatrix[3] * fixedCorner.y + inverseMatrix[6];
  const fixedLocalY = inverseMatrix[1] * fixedCorner.x + inverseMatrix[4] * fixedCorner.y + inverseMatrix[7];
  const transform = node.transform ?? {};
  const isAnimMode = editorState.editorMode === 'animation';
  const assignedBone = getAssignedBoneForNode(project, projectNode.id);
  const isLinked = isBoneLinkLocked(projectNode) && !!assignedBone;
  if (!isAnimMode) adapter._beginCommandBatch({ name: 'Resize drag', type: 'transform' });
  const gestureId = isAnimMode ? adapter.animationAuthoringAdapter?.beginGesture() : null;
  adapter._setDragState({
    type: 'resize', nodeId: node.id, iswm: inverseMatrix, startWorldMatrix: new Float32Array(matrix),
    fixedWorldX: fixedCorner.x, fixedWorldY: fixedCorner.y,
    pivotX: transform.pivotX ?? 0, pivotY: transform.pivotY ?? 0, cornerLocalX, cornerLocalY, fixedLocalX, fixedLocalY,
    startX: transform.x ?? 0, startY: transform.y ?? 0, startRotation: transform.rotation ?? 0,
    startScaleX: transform.scaleX ?? 1, startScaleY: transform.scaleY ?? 1,
    isAnimMode, isLinked: !isAnimMode && isLinked, linkedAnim: isAnimMode && isLinked,
    ...(isAnimMode && isLinked ? captureLinkedAnimState(adapter, projectNode) : {}),
    ...(!isAnimMode && isLinked && assignedBone ? {
      linkedScaleSnapshot: {
        boneId: assignedBone.id,
        boneSetup: { ...assignedBone.setup },
        nodeTransforms: Object.fromEntries(
          getLinkedNodesForBone(project, assignedBone.id).map(linkedNode => [
            linkedNode.id,
            { ...linkedNode.transform },
          ]),
        ),
      },
    } : {}),
    lastScaleX: transform.scaleX ?? 1, lastScaleY: transform.scaleY ?? 1, lastPatch: null, gestureId,
  });
}

export function startSkeletonDrag(adapter: PixiInteractionSystem, jointIndex: number): void {
  const editorState = adapter.editorRef.current;
  const project = adapter.projectRef.current;
  if (!canStartAnimationGesture(adapter)) return;
  const effectiveBones = getEffectiveBones({
    project, effectiveNodes: getEffectiveNodesFromAdapter(adapter), editor: editorState, animation: adapter.animationRef.current,
  });
  if (!effectiveBones?.length || !editorState.skeletonEditMode || jointIndex >= effectiveBones.length) return;
  const bone = effectiveBones[jointIndex];
  if (!bone) return;
  const isAnimMode = editorState.editorMode === 'animation';
  const useDraftPose = usesPoseDraft(editorState);
  if (!useDraftPose) adapter._beginCommandBatch({ name: 'Skeleton drag', type: 'skeleton' });
  const gestureId = isAnimMode && useDraftPose ? adapter.animationAuthoringAdapter?.beginGesture() : null;
  adapter._setDragState({
    type: 'skeletonJoint', boneId: bone.id, startPivotX: bone.setup?.x ?? 0, startPivotY: bone.setup?.y ?? 0,
    isAnimMode, useDraftPose, gestureId,
    setupEffectiveValues: { [bone.id]: { ...(project.bones.find(candidate => candidate.id === bone.id)?.setup ?? {}) } },
  });
  adapter._sendWorkflow({ type: 'START_TRANSFORM_DRAG', payload: { mode: 'skeletonJoint', boneId: bone.id } });
}

function getEffectiveNodesFromAdapter(adapter: PixiInteractionSystem) {
  return getEffectiveNodes({
    project: adapter.projectRef.current,
    editor: adapter.editorRef.current,
    animation: adapter.animationRef.current,
  });
}
