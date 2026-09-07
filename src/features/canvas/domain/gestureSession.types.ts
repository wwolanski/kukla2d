type GestureStatus = "idle" | "active" | "committed" | "cancelled";

export type GestureKind =
  | "pan"
  | "transform"
  | "dragZoom"
  | "meshBrush"
  | "weightPaint"
  | "drawBone"
  | "marquee"
  | "gizmoMove"
  | "gizmoRotate"
  | "gizmoPivot"
  | "skeletonJoint"
  | "skeletonBone"
  | "skeletonTrackpad"
  | "skeletonRotate"
  | "skeletonPose"
  | "skeletonEdit"
  | "vertexDrag";

export interface GestureSession {
  id: number;
  kind: GestureKind;
  payload: Record<string, unknown>;
  historyTransactionId: string | null;
  status: GestureStatus;
}
