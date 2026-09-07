import { handleMeshTask } from "./workerProtocol.js";
import { generateMesh } from "../../domain/mesh-generation/generate.js";

import type { MeshWorkerRequest } from "./workerProtocol.types.js";

declare const self: {
  onmessage: ((event: MessageEvent<MeshWorkerRequest>) => void) | null;
  postMessage(message: unknown, transfer: Transferable[]): void;
};
const workerScope = self;

workerScope.onmessage = function (e: MessageEvent<MeshWorkerRequest>) {
  const { response, transferables } = handleMeshTask(e.data, { generateMesh });
  workerScope.postMessage(response, transferables);
};
