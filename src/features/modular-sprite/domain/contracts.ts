import type {
  ModularSpritePart,
  ModularSpriteProcessingRecipe,
  NormalizedPoint,
  NormalizedRect,
} from '@kukla2d/contracts';
import type { SpriteObservation } from '@kukla2d/modular-sprite-schema';

export interface RgbaImageData {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

export interface PixelRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface BackgroundAnalysis {
  mode: 'alpha' | 'chroma';
  color: { r: number; g: number; b: number };
  confidence: number;
}

export interface DetectedRegion {
  id: number;
  area: number;
  bounds: PixelRect;
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
  labels: Int32Array;
  regions: DetectedRegion[];
  background: BackgroundAnalysis;
  warnings: string[];
  observation: SpriteObservation;
}

export interface ModularSpriteDraftPart extends Omit<ModularSpritePart, 'assetId' | 'componentSeeds'> {
  assetId?: ModularSpritePart['assetId'];
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

export interface ModularSpriteTemplatePart {
  partKey: string;
  required: boolean;
  contentBounds: NormalizedRect;
}

export interface RegionMatch {
  partKey: string;
  regionId: number | null;
  confidence: number;
}

export const DEFAULT_MODULAR_SPRITE_RECIPE: ModularSpriteProcessingRecipe = {
  background: {
    mode: 'chroma',
    color: { r: 0, g: 255, b: 0 },
    tolerance: 0.035,
    softness: 0.08,
    despill: 0.8,
  },
  detection: {
    alphaThreshold: 32,
    minimumRegionAreaRatio: 0.00005,
    openingRadius: 0,
    closingRadius: 1,
    connectivity: 8,
  },
  strokes: [],
};
