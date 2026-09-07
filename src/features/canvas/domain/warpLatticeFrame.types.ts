interface Point {
  x: number;
  y: number;
}

export interface WarpLatticeFrame {
  gridPoints: Point[];
  col: number;
  row: number;
  stride: number;
  visible: boolean;
}
