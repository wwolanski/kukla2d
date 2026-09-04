/// <reference lib="webworker" />

import { handleModularSpriteTask } from './workerProtocol.js';

import type { ModularSpriteTaskRuntime, ModularSpriteWorkerRequest, ModularSpriteWorkerResponse } from './workerProtocol.js';

const workerScope = globalThis as typeof globalThis & DedicatedWorkerGlobalScope;

const abortedRequests = new Set<string>();
let warmCache: ModularSpriteTaskRuntime['warmCache'] = null;
let activeRequestId: string | null = null;
let queuedRequest: Exclude<ModularSpriteWorkerRequest, { type: 'abort' }> | null = null;

const runtime: ModularSpriteTaskRuntime = {
  get warmCache() {
    return warmCache;
  },
  set warmCache(value) {
    warmCache = value;
  },
  isAborted: requestId => abortedRequests.has(requestId),
  reportProgress: (requestId, progress, stage) => {
    const response: ModularSpriteWorkerResponse = { type: 'progress', data: { requestId, progress, stage } };
    workerScope.postMessage(response);
  },
  checkpoint: () => new Promise<void>(resolve => { setTimeout(resolve, 0); }),
};

async function runTask(request: ModularSpriteWorkerRequest): Promise<void> {
  if (request.type === 'abort') return;
  if (abortedRequests.delete(request.requestId)) return;
  activeRequestId = request.requestId;
  try {
    const result = await handleModularSpriteTask(request, runtime);
    abortedRequests.delete(request.requestId);
    workerScope.postMessage(result.response, result.transferables);
  } catch (error) {
    abortedRequests.delete(request.requestId);
    if (error instanceof DOMException && error.name === 'AbortError') return;
    const response: ModularSpriteWorkerResponse = {
      type: 'error',
      data: {
        requestId: request.requestId,
        code: 'MODULAR_SPRITE_PROCESSING_FAILED',
        message: error instanceof Error ? error.message : String(error),
      },
    };
    workerScope.postMessage(response);
  } finally {
    activeRequestId = null;
    const next = queuedRequest;
    queuedRequest = null;
    if (next) void runTask(next);
  }
}

workerScope.onmessage = (event: MessageEvent<ModularSpriteWorkerRequest>) => {
  const request = event.data;
  if (request.type === 'abort') {
    abortedRequests.add(request.requestId);
    if (queuedRequest?.requestId === request.requestId) {
      queuedRequest = null;
      abortedRequests.delete(request.requestId);
    }
    return;
  }
  if (activeRequestId) {
    queuedRequest = request;
    return;
  }
  void runTask(request);
};
