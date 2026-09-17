import { generateMesh } from "@/features/canvas/domain/mesh-generation/generate.js";
import { handleMeshTask } from "@/features/canvas/infrastructure/mesh-worker/workerProtocol.js";
import type { MeshWorkerRequest } from "@/features/canvas/infrastructure/mesh-worker/workerProtocol.types.js";

declare const self: {
  onmessage: ((event: MessageEvent<MeshWorkerRequest>) => void) | null;
  postMessage(message: unknown, transfer: Transferable[]): void;
};
const workerScope = self;

workerScope.onmessage = function (e: MessageEvent<MeshWorkerRequest>) {
  const { response, transferables } = handleMeshTask(e.data, { generateMesh });
  workerScope.postMessage(response, transferables);
};
