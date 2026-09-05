import type { ModularSpriteProcessingRecipe } from '@kukla2d/contracts';

import { extractModularSpriteParts, precomputeOklabAsync, processModularSpriteAsync } from '../domain/processor.js';

import type { ModularSpriteWorkerRequest, ModularSpriteWorkerResponse } from './workerProtocol.js';
import type { RgbaImageData } from '../domain/contracts.js';

export interface ModularSpriteTaskResult {
  response: Exclude<ModularSpriteWorkerResponse, { type: 'progress' }>;
  transferables: Transferable[];
}

export interface ModularSpriteWarmCache {
  image: RgbaImageData;
  oklab: Float32Array | null;
}

export interface ModularSpriteTaskRuntime {
  warmCache: ModularSpriteWarmCache | null;
  isAborted(requestId: string): boolean;
  reportProgress(requestId: string, progress: number, stage: string): void;
  checkpoint(): Promise<void>;
}

const OKLAB_CACHE_MAX_PIXELS = 4_000_000;

function createHooks(runtime: ModularSpriteTaskRuntime, requestId: string) {
  return {
    throwIfAborted: () => {
      if (runtime.isAborted(requestId)) throw new DOMException('Modular sprite task cancelled', 'AbortError');
    },
    checkpoint: () => runtime.checkpoint(),
    report: (progress: number, stage: string) => runtime.reportProgress(requestId, progress, stage),
  };
}

async function ensureOklab(
  image: RgbaImageData,
  recipe: ModularSpriteProcessingRecipe,
  cache: ModularSpriteWarmCache | null,
  runtime: ModularSpriteTaskRuntime,
  requestId: string,
): Promise<Float32Array | null> {
  if (recipe.background.mode !== 'chroma') return null;
  if (image.width * image.height > OKLAB_CACHE_MAX_PIXELS) return null;
  if (!cache) return null;
  if (!cache.oklab) {
    runtime.reportProgress(requestId, 0.02, 'Precomputing color space');
    await runtime.checkpoint();
    cache.oklab = await precomputeOklabAsync(image, createHooks(runtime, requestId));
  }
  return cache.oklab;
}

export async function handleModularSpriteTask(
  request: ModularSpriteWorkerRequest,
  runtime: ModularSpriteTaskRuntime,
): Promise<ModularSpriteTaskResult> {
  if (request.type === 'abort') throw new Error('Abort messages must be handled by the worker shell');
  if (request.type === 'modular-sprite.warm') {
    runtime.warmCache = { image: request.image, oklab: null };
    return { response: { type: 'result', data: { requestId: request.requestId, result: { warmed: true } } }, transferables: [] };
  }
  try {
    if (request.type === 'modular-sprite.process') {
      const image = request.image ?? runtime.warmCache?.image;
      if (!image) {
        return {
          response: { type: 'error', data: { requestId: request.requestId, code: 'MODULAR_SPRITE_WARM_CACHE_MISSING', message: 'Modular sprite preview cache is not warmed up' } },
          transferables: [],
        };
      }
      const cache = request.image ? null : runtime.warmCache;
      const oklab = await ensureOklab(image, request.recipe, cache, runtime, request.requestId);
      const processed = await processModularSpriteAsync({ image, recipe: request.recipe }, createHooks(runtime, request.requestId), oklab);
      return { response: { type: 'result', data: { requestId: request.requestId, result: processed } }, transferables: [processed.rgba.buffer, processed.matte.buffer, processed.labels.buffer] };
    }
    const processed = await processModularSpriteAsync({ image: request.image, recipe: request.recipe }, createHooks(runtime, request.requestId), null);
    const parts = extractModularSpriteParts(processed, request.parts);
    return { response: { type: 'result', data: { requestId: request.requestId, result: parts } }, transferables: parts.map(part => part.image.data.buffer) };
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    return {
      response: { type: 'error', data: { requestId: request.requestId, code: 'MODULAR_SPRITE_PROCESSING_FAILED', message: error instanceof Error ? error.message : String(error) } },
      transferables: [],
    };
  }
}
