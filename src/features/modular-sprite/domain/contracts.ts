import type { ModularSpriteProcessingRecipe } from "@kukla2d/contracts";

export const DEFAULT_MODULAR_SPRITE_RECIPE: ModularSpriteProcessingRecipe = {
  background: {
    mode: "chroma",
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
