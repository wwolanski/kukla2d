import modularSpriteWorkerUrl from './worker.ts?worker&url';

import type { ModularSpriteWorkerRequest, ModularSpriteWorkerResponse } from './workerProtocol.js';
import type {
  ExtractedPart,
  ModularSpriteDraftPart,
  ProcessedModularSprite,
  ProcessModularSpriteRequest,
} from '../domain/contracts.js';

export interface ModularSpriteWorkerClientOptions {
  workerUrl?: string | URL;
  workerFactory?: (url: string | URL, options: WorkerOptions) => Worker;
  onProgress?: (progress: { progress: number; stage: string }) => void;
}

export interface ModularSpriteWorkerClient {
  process(request: ProcessModularSpriteRequest): Promise<ProcessedModularSprite>;
  extract(request: ProcessModularSpriteRequest, parts: ModularSpriteDraftPart[]): Promise<ExtractedPart[]>;
  cancel(): void;
  dispose(): void;
}

export function createModularSpriteWorkerClient(options: ModularSpriteWorkerClientOptions = {}): ModularSpriteWorkerClient {
  const workerUrl = options.workerUrl ?? modularSpriteWorkerUrl;
  const workerFactory = options.workerFactory ?? ((url: string | URL, workerOptions: WorkerOptions) => new Worker(url, workerOptions));
  let active: { worker: Worker; reject: (error: Error) => void } | null = null;
  let disposed = false;

  function cancel(): void {
    if (!active) return;
    const current = active;
    active = null;
    current.worker.terminate();
    current.reject(new DOMException('Modular sprite task cancelled', 'AbortError'));
  }

  function dispatch<T>(request: ModularSpriteWorkerRequest): Promise<T> {
    if (disposed) return Promise.reject(new Error('Modular sprite worker client is disposed'));
    cancel();
    const worker = workerFactory(workerUrl, { type: 'module' });
    return new Promise<T>((resolve, reject) => {
      active = { worker, reject };
      const finish = (): void => {
        if (active?.worker === worker) active = null;
        worker.terminate();
      };
      worker.onmessage = (event: MessageEvent<ModularSpriteWorkerResponse>) => {
        const message = event.data;
        if (message.data.requestId !== request.requestId) return;
        if (message.type === 'progress') {
          options.onProgress?.({ progress: message.data.progress, stage: message.data.stage });
          return;
        }
        finish();
        if (message.type === 'error') {
          reject(new Error(message.data.message));
          return;
        }
        resolve(message.data.result as T);
      };
      worker.onerror = event => {
        finish();
        reject(event.error instanceof Error ? event.error : new Error(event.message || 'Modular sprite worker failed'));
      };
      worker.postMessage(request, [request.payload.image.data.buffer]);
    });
  }

  function process(request: ProcessModularSpriteRequest): Promise<ProcessedModularSprite> {
    const payload = cloneRequest(request);
    return dispatch<ProcessedModularSprite>({
      requestId: crypto.randomUUID(),
      kind: 'modular-sprite.process',
      payload,
    });
  }

  function extract(request: ProcessModularSpriteRequest, parts: ModularSpriteDraftPart[]): Promise<ExtractedPart[]> {
    const payload = cloneRequest(request);
    return dispatch<ExtractedPart[]>({
      requestId: crypto.randomUUID(),
      kind: 'modular-sprite.extract',
      payload: { ...payload, parts: structuredClone(parts) },
    });
  }

  function dispose(): void {
    cancel();
    disposed = true;
  }

  return { process, extract, cancel, dispose };
}

function cloneRequest(request: ProcessModularSpriteRequest): ProcessModularSpriteRequest {
  return {
    image: {
      width: request.image.width,
      height: request.image.height,
      data: new Uint8ClampedArray(request.image.data),
    },
    recipe: structuredClone(request.recipe),
  };
}
