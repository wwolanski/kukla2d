import type { ModularSpriteProcessingRecipe } from '@kukla2d/contracts';

import type { ExtractedPart, ModularSpriteDraftPart, ProcessedModularSprite, RgbaImageData } from '../domain/contracts.js';

export type ModularSpriteWorkerRequest =
  | { type: 'abort'; requestId: string }
  | { type: 'modular-sprite.warm'; requestId: string; image: RgbaImageData }
  | { type: 'modular-sprite.process'; requestId: string; recipe: ModularSpriteProcessingRecipe; image?: RgbaImageData }
  | { type: 'modular-sprite.extract'; requestId: string; image: RgbaImageData; recipe: ModularSpriteProcessingRecipe; parts: ModularSpriteDraftPart[] };

export type ModularSpriteWorkerResult = ProcessedModularSprite | ExtractedPart[] | { warmed: true };

export type ModularSpriteWorkerResponse =
  | { type: 'progress'; data: { requestId: string; progress: number; stage: string } }
  | { type: 'result'; data: { requestId: string; result: ModularSpriteWorkerResult } }
  | { type: 'error'; data: { requestId: string; code: 'MODULAR_SPRITE_PROCESSING_FAILED' | 'MODULAR_SPRITE_WARM_CACHE_MISSING'; message: string } };

