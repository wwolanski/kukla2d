import type {
  Bone,
  BoneId,
  BoneSetup,
  ConstraintId,
  NodeId,
  Vertex,
  VertexInfluence,
  Transform,
} from '@kukla2d/contracts';

import type { Matrix3 } from '@/domain/transforms';

import type { buildSkeletonFrame } from '@/features/canvas/domain/skeletonFrame.js';

import type { CanvasDraftPoseValue } from '../rendererTypes.js';
import type { Container, FederatedPointerEvent } from 'pixi.js';

type TransformPatch = Partial<Pick<CanvasDraftPoseValue, 'x' | 'y' | 'rotation' | 'scaleX' | 'scaleY' | 'pivotX' | 'pivotY'>>;
type EffectiveValues = Record<string, object>;
type BoneSnapshot = Record<string, Partial<BoneSetup>>;
interface LinkedScaleSnapshot {
  boneId: BoneId;
  boneSetup: BoneSetup;
  nodeTransforms: Record<string, Transform>;
}
interface AnimationGestureState { isAnimMode: boolean; gestureId: string | null | undefined; }
interface LinkedTransformState extends AnimationGestureState {
  nodeId: NodeId;
  isLinked: boolean;
  linkedAnim: boolean;
  linkedBone?: Bone | null;
  linkedPreLinkedWorldMatrices?: Map<string, Matrix3> | null;
  lastPatch: TransformPatch | null;
}

export type DragState =
  | (LinkedTransformState & { type: 'move'; startClientX: number; startClientY: number; startWorldX: number; startWorldY: number; startX: number; startY: number; lastDx: number; lastDy: number })
  | (LinkedTransformState & { type: 'rotate'; startRotation: number; pivotWorldX: number; pivotWorldY: number; startAngle: number | null; lastDelta: number })
  | { type: 'pivot'; nodeId: NodeId; startClientX: number; startClientY: number; startPivotX: number; startPivotY: number; startX: number; startY: number; iswm: Matrix3; lastPatch: TransformPatch | null }
  | (LinkedTransformState & { type: 'resize'; iswm: Matrix3; startWorldMatrix: Matrix3; fixedWorldX: number; fixedWorldY: number; pivotX: number; pivotY: number; cornerLocalX: number; cornerLocalY: number; fixedLocalX: number; fixedLocalY: number; startX: number; startY: number; startRotation: number; startScaleX: number; startScaleY: number; lastScaleX: number; lastScaleY: number; linkedScaleSnapshot?: LinkedScaleSnapshot })
  | (AnimationGestureState & { type: 'boneMove'; boneId: BoneId; boneIds: BoneId[]; startBones: BoneSnapshot; setupEffectiveValues: EffectiveValues; startClientX: number; startClientY: number; startWorldX: number; startWorldY: number; useDraftPose: boolean; lastDx: number; lastDy: number; setupPoseCleared?: boolean })
  | (AnimationGestureState & { type: 'boneRotate'; boneId: BoneId; boneIds: BoneId[]; startBones: BoneSnapshot; setupEffectiveValues: EffectiveValues; pivotX: number; pivotY: number; startAngle: number | null; useDraftPose: boolean; lastDelta: number; setupPoseCleared?: boolean })
  | (AnimationGestureState & { type: 'boneLength'; boneId: BoneId; boneIds: BoneId[]; startLengths: Record<string, number>; setupEffectiveValues: EffectiveValues; pivotX: number; pivotY: number; startLength: number; axisX: number; axisY: number; startClientX: number; startClientY: number; startWorldX: number; startWorldY: number; useDraftPose: boolean; lastLength?: number; setupPoseCleared?: boolean })
  | (AnimationGestureState & { type: 'skeletonJoint'; boneId: BoneId; startPivotX: number; startPivotY: number; useDraftPose: boolean; setupEffectiveValues: EffectiveValues; setupPoseCleared?: boolean })
  | (AnimationGestureState & { type: 'ikMove'; constraintId: ConstraintId; startWorldX: number; startWorldY: number; startX: number; startY: number; useDraftPose: boolean; setupEffectiveValues: EffectiveValues; setupPoseCleared?: boolean })
  | (AnimationGestureState & { type: 'warp'; ptIndex: number; wdNodeId: NodeId; startPts: Array<{ x: number; y: number }> })
  | (AnimationGestureState & { type: 'poseHandle'; boneId: BoneId; pivot: { x: number; y: number }; startRotation: number; startPointerAngle: number; minRadius: number; maxRadius: number; startBones: Bone[]; useDraftPose: boolean })
  | { type: 'marquee'; target: 'all' | 'element' | 'rig'; startWorldX: number; startWorldY: number; curWorldX: number; curWorldY: number; startScreenX: number; startScreenY: number }
  | { type: 'drawBone'; startWorldX: number; startWorldY: number; endWorldX: number; endWorldY: number; parentId: BoneId | null }
  | { type: 'meshBrush'; partId: NodeId; startWorldX: number; startWorldY: number; verticesSnap: Vertex[]; allUvs: Float32Array; imageWidth: number | undefined; imageHeight: number | undefined; affected: Array<{ index: number; startX: number; startY: number; weight: number }>; inverse: Matrix3; initialVertices: Vertex[]; initialUvs: number[]; initialShapeDeltas: unknown }
  | { type: 'weightPaint'; partId: NodeId; boneId: BoneId; inverse: Matrix3; initialInfluences: VertexInfluence[][] | undefined }
  | { type: 'exportAreaMove'; startWorldX: number; startWorldY: number; startX: number; startY: number };

export type SkeletonFrame = NonNullable<ReturnType<typeof buildSkeletonFrame>>;
export type BoundListener =
  | { target: Container; event: string; fn: (event: FederatedPointerEvent) => void; kind: 'pixi' }
  | { target: Window; event: 'blur'; fn: () => void; kind: 'dom' };
