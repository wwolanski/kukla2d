interface Point {
  x: number;
  y: number;
}

export interface GizmoFrame {
  bboxPoints: Point[];
  outlineContours?: Point[][] | null;
  pivot: Point;
  center: Point;
  topCenter: Point;
  rotationHandle: Point;
  visible: boolean;
}
