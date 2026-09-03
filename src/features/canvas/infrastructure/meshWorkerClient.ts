import meshWorkerUrl from './mesh-worker/worker.ts?worker&url';

import type { LegacyMeshRequest, LegacyMeshResponse, MeshData, MeshImageData } from './mesh-worker/workerProtocol.js';
import type { MeshGenerationOptions } from '../domain/mesh-generation/generate.js';

export interface MeshWorkerClientOptions {
  workerUrl?: string | URL;
  workerFactory?: (url: string | URL, options: WorkerOptions) => Worker;
}

export interface MeshWorkerClient {
  generate(partId: string, imageData: MeshImageData, opts?: MeshGenerationOptions): Promise<MeshData>;
  cancel(partId: string): void;
  dispose(): void;
  readonly _workers: ReadonlyMap<string, Worker>;
}

export function createMeshWorkerClient(options: MeshWorkerClientOptions = {}): MeshWorkerClient {
  const workers = new Map<string, Worker>();
  const url = options.workerUrl ?? meshWorkerUrl;
  const createWorker = options.workerFactory ?? ((workerUrl: string | URL, workerOptions: WorkerOptions) => new Worker(workerUrl, workerOptions));

  function terminateFor(partId: string): void {
    const worker = workers.get(partId);
    if (!worker) return;
    worker.terminate();
    workers.delete(partId);
  }

  function generate(partId: string, imageData: MeshImageData, opts?: MeshGenerationOptions): Promise<MeshData> {
    terminateFor(partId);
    const worker = createWorker(url, { type: 'module' });
    workers.set(partId, worker);
    return new Promise((resolve, reject) => {
      worker.onmessage = (event: MessageEvent<LegacyMeshResponse>) => {
        terminateFor(partId);
        if (!event.data.ok) {
          reject(new Error(event.data.error));
          return;
        }
        resolve(event.data);
      };
      worker.onerror = (event: ErrorEvent) => {
        terminateFor(partId);
        reject(event.error instanceof Error ? event.error : new Error(event.message || 'mesh worker error'));
      };
      const request: LegacyMeshRequest = { partId, imageData, ...(opts === undefined ? {} : { opts }) };
      worker.postMessage(request);
    });
  }

  function cancel(partId: string): void { terminateFor(partId); }
  function dispose(): void {
    for (const worker of workers.values()) worker.terminate();
    workers.clear();
  }

  return { generate, cancel, dispose, _workers: workers };
}
