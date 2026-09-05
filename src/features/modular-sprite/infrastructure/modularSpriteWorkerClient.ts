import type { ModularSpriteProcessingRecipe } from '@kukla2d/contracts';

import modularSpriteWorkerUrl from './worker.ts?worker&url';

import type { ModularSpriteWorkerRequest, ModularSpriteWorkerResponse } from './workerProtocol.js';
import type {
  ExtractedPart,
  ModularSpriteDraftPart,
  ProcessedModularSprite,
  ProcessModularSpriteRequest,
  RgbaImageData,
} from '../domain/contracts.js';

export interface ModularSpriteWorkerClientOptions {
  workerUrl?: string | URL;
  workerFactory?: (url: string | URL, options: WorkerOptions) => Worker;
  onProgress?: (progress: { progress: number; stage: string }) => void;
}

interface ModularSpriteProcessRequest {
  recipe: ModularSpriteProcessingRecipe;
  image?: RgbaImageData;
}

export interface ModularSpriteWorkerClient {
  warm(image: RgbaImageData): Promise<void>;
  process(request: ModularSpriteProcessRequest): Promise<ProcessedModularSprite>;
  extract(request: ProcessModularSpriteRequest, parts: ModularSpriteDraftPart[]): Promise<ExtractedPart[]>;
  onProgress: (listener: (progress: { progress: number; stage: string }) => void) => () => void;
  cancel(): void;
  dispose(): void;
}

interface PendingTask {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
}

export function createModularSpriteWorkerClient(options: ModularSpriteWorkerClientOptions = {}): ModularSpriteWorkerClient {
  const workerUrl = options.workerUrl ?? modularSpriteWorkerUrl;
  const workerFactory = options.workerFactory ?? ((url: string | URL, workerOptions: WorkerOptions) => new Worker(url, workerOptions));
  let worker: Worker | null = null;
  let disposed = false;
  const progressListeners = new Set<(progress: { progress: number; stage: string }) => void>();
  if (options.onProgress) progressListeners.add(options.onProgress);
  const pending = new Map<string, PendingTask>();

  function ensureWorker(): Worker {
    if (!worker) {
      const next = workerFactory(workerUrl, { type: 'module' });
      next.onmessage = (event: MessageEvent<ModularSpriteWorkerResponse>) => {
        const message = event.data;
        const entry = pending.get(message.data.requestId);
        if (message.type === 'progress') {
          if (entry) for (const listener of progressListeners) listener({ progress: message.data.progress, stage: message.data.stage });
          return;
        }
        if (!entry) return;
        pending.delete(message.data.requestId);
        if (message.type === 'error') entry.reject(new Error(message.data.message));
        else entry.resolve(message.data.result);
      };
      next.onerror = event => {
        worker = null;
        const error = event.error instanceof Error ? event.error : new Error(event.message || 'Modular sprite worker failed');
        for (const entry of pending.values()) entry.reject(error);
        pending.clear();
      };
      worker = next;
    }
    return worker;
  }

  function cancelPending(): void {
    if (pending.size === 0) return;
    const current = worker;
    for (const [requestId, entry] of pending) {
      current?.postMessage({ type: 'abort', requestId } satisfies ModularSpriteWorkerRequest);
      entry.reject(new DOMException('Modular sprite task cancelled', 'AbortError'));
    }
    pending.clear();
  }

  function dispatch<T>(request: ModularSpriteWorkerRequest, transferables: Transferable[]): Promise<T> {
    if (disposed) return Promise.reject(new Error('Modular sprite worker client is disposed'));
    cancelPending();
    const current = ensureWorker();
    return new Promise<T>((resolve, reject) => {
      pending.set(request.requestId, { resolve: resolve as (value: unknown) => void, reject });
      try {
        current.postMessage(request, transferables);
      } catch (postError) {
        pending.delete(request.requestId);
        reject(postError instanceof Error ? postError : new Error(String(postError)));
      }
    });
  }

  function warm(image: RgbaImageData): Promise<void> {
    const data = new Uint8ClampedArray(image.data);
    return dispatch<{ warmed: true }>({
      type: 'modular-sprite.warm',
      requestId: crypto.randomUUID(),
      image: { width: image.width, height: image.height, data },
    }, [data.buffer]).then(() => undefined);
  }

  function process(request: ModularSpriteProcessRequest): Promise<ProcessedModularSprite> {
    const recipe = structuredClone(request.recipe);
    if (request.image) {
      const data = new Uint8ClampedArray(request.image.data);
      return dispatch<ProcessedModularSprite>({
        type: 'modular-sprite.process',
        requestId: crypto.randomUUID(),
        recipe,
        image: { width: request.image.width, height: request.image.height, data },
      }, [data.buffer]);
    }
    return dispatch<ProcessedModularSprite>({
      type: 'modular-sprite.process',
      requestId: crypto.randomUUID(),
      recipe,
    }, []);
  }

  function extract(request: ProcessModularSpriteRequest, parts: ModularSpriteDraftPart[]): Promise<ExtractedPart[]> {
    const data = new Uint8ClampedArray(request.image.data);
    return dispatch<ExtractedPart[]>({
      type: 'modular-sprite.extract',
      requestId: crypto.randomUUID(),
      recipe: structuredClone(request.recipe),
      image: { width: request.image.width, height: request.image.height, data },
      parts: structuredClone(parts),
    }, [data.buffer]);
  }

  function dispose(): void {
    cancelPending();
    disposed = true;
    worker?.terminate();
    worker = null;
  }

  function onProgress(listener: (progress: { progress: number; stage: string }) => void): () => void {
    progressListeners.add(listener);
    return () => progressListeners.delete(listener);
  }

  return { warm, process, extract, onProgress, cancel: cancelPending, dispose };
}
