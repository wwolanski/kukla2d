export interface ObservationRegion {
  id: number;
  area: number;
  bounds: { x: number; y: number; width: number; height: number };
  centroid: { x: number; y: number };
}
export interface ObservationInput {
  width: number;
  height: number;
  matte: Uint8Array | Uint8ClampedArray;
  labels: Int32Array;
  regions: readonly ObservationRegion[];
  maskSize?: number;
}
