import { extractModularSpriteParts, processModularSprite } from '../domain/processor.js';

import type {
  ExtractedPart,
  ModularSpriteDraftPart,
  ProcessedModularSprite,
  ProcessModularSpriteRequest,
} from '../domain/contracts.js';

export type ModularSpriteWorkerRequest =
  | { requestId: string; kind: 'modular-sprite.process'; payload: ProcessModularSpriteRequest }
  | { requestId: string; kind: 'modular-sprite.extract'; payload: ProcessModularSpriteRequest & { parts: ModularSpriteDraftPart[] } };

export type ModularSpriteWorkerResponse =
  | { type: 'progress'; data: { requestId: string; progress: number; stage: string } }
  | { type: 'result'; data: { requestId: string; result: ProcessedModularSprite | ExtractedPart[] } }
  | { type: 'error'; data: { requestId: string; code: 'MODULAR_SPRITE_PROCESSING_FAILED'; message: string } };

export interface ModularSpriteTaskResult {
  response: Exclude<ModularSpriteWorkerResponse, { type: 'progress' }>;
  transferables: Transferable[];
}

export function handleModularSpriteTask(request: ModularSpriteWorkerRequest): ModularSpriteTaskResult {
  try {
    const processed = processModularSprite(request.payload);
    if (request.kind === 'modular-sprite.process') {
      return {
        response: { type: 'result', data: { requestId: request.requestId, result: processed } },
        transferables: [processed.rgba.buffer, processed.matte.buffer, processed.labels.buffer],
      };
    }
    const parts = extractModularSpriteParts(processed, request.payload.parts);
    return {
      response: { type: 'result', data: { requestId: request.requestId, result: parts } },
      transferables: parts.map(part => part.image.data.buffer),
    };
  } catch (error) {
    return {
      response: {
        type: 'error',
        data: {
          requestId: request.requestId,
          code: 'MODULAR_SPRITE_PROCESSING_FAILED',
          message: error instanceof Error ? error.message : String(error),
        },
      },
      transferables: [],
    };
  }
}
