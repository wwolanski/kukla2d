import type { NormalizedPoint, NormalizedRect } from "./geometry.types.js";

export interface EncodedBinaryMask {
  width: number;
  height: number;
  data: Uint8Array;
}
export interface ObservedComponent {
  componentId: number;
  bounds: NormalizedRect;
  centroid: NormalizedPoint;
  foregroundAreaRatio: number;
  boundingBoxAreaRatio: number;
  aspectRatio: number;
  shapeMask: EncodedBinaryMask;
}
export interface SpriteObservation {
  observationVersion: 1;
  processorVersion: 1;
  canvas: { width: number; height: number; aspectRatio: number };
  foregroundBounds: NormalizedRect;
  components: ObservedComponent[];
  segmentationQualityBp: number;
}
export type SpriteObservationDto = SpriteObservation;
