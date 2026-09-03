/// <reference lib="webworker" />

import { handleModularSpriteTask } from './workerProtocol.js';

import type { ModularSpriteWorkerRequest, ModularSpriteWorkerResponse } from './workerProtocol.js';

const workerScope = globalThis as typeof globalThis & DedicatedWorkerGlobalScope;

workerScope.onmessage = (event: MessageEvent<ModularSpriteWorkerRequest>) => {
  const request = event.data;
  const progress: ModularSpriteWorkerResponse = {
    type: 'progress',
    data: { requestId: request.requestId, progress: 0.1, stage: 'Processing mask' },
  };
  workerScope.postMessage(progress);
  const result = handleModularSpriteTask(request);
  workerScope.postMessage(result.response, result.transferables);
};
