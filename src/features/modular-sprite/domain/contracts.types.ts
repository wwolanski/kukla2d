import type {
  ModularSpritePart,
  ModularSpriteProcessingRecipe,
  NormalizedPoint,
  NormalizedRect,
} from "@kukla2d/contracts";
import type { SpriteObservation } from "@kukla2d/modular-sprite-schema";

export interface RgbaImageData {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

export interface DetectedRegion {
  id: number;
  area: number;
  bounds: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  normalizedBounds: NormalizedRect;
  centroid: NormalizedPoint;
  suggestedRole: string;
  contour: NormalizedPoint[];
}

export interface ProcessedModularSprite {
  width: number;
  height: number;
  rgba: Uint8ClampedArray;
  matte: Uint8ClampedArray;
  protectedInteriorMask: Uint8Array;
  labels: Int32Array;
  regions: DetectedRegion[];
  background: {
    mode: "alpha" | "chroma";
    color: { r: number; g: number; b: number };
    confidence: number;
  };
  warnings: string[];
  observation: SpriteObservation;
}

export interface ModularSpriteDraftPart extends Omit<
  ModularSpritePart,
  "assetId" | "componentSeeds"
> {
  assetId?: ModularSpritePart["assetId"];
  regionIds: number[];
}

export interface ExtractedPart {
  partKey: string;
  image: RgbaImageData;
  contentBounds: NormalizedRect;
  componentSeeds: NormalizedPoint[];
  overflow: boolean;
}

export interface ProcessModularSpriteRequest {
  image: RgbaImageData;
  recipe: ModularSpriteProcessingRecipe;
}
