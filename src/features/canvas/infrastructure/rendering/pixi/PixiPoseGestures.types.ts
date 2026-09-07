export interface PoseHandleFrame {
  boneId: string;
  pivot: { x: number; y: number };
  rotation?: number;
  minRadius: number;
  maxRadius: number;
}
