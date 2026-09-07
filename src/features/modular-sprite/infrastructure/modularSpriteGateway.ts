import { createModularSpriteWorkerClient } from "./modularSpriteWorkerClient.js";

import type { ModularSpriteWorkerClient } from "./modularSpriteWorkerClient.types.js";
import type { ModularSpriteProcessingPort } from "../application/finalizeModularSpriteImport.types.js";
import type { RgbaImageData } from "../domain/contracts.types.js";

interface ModularSpriteProcessingControllerPort extends ModularSpriteProcessingPort {
  warm(image: RgbaImageData): Promise<void>;
  onProgress?(
    listener: (progress: { progress: number; stage: string }) => void,
  ): () => void;
  cancel(): void;
  dispose(): void;
}

/** Adapter from the browser Worker client to the application processing port. */
export function createModularSpriteGateway(
  client: ModularSpriteWorkerClient = createModularSpriteWorkerClient(),
): ModularSpriteProcessingControllerPort {
  const processing: ModularSpriteProcessingPort = {
    process: (request) => client.process(request),
    extract: (request, parts) => client.extract(request, [...parts]),
  };
  return {
    ...processing,
    warm: (image) => client.warm(image),
    onProgress: client.onProgress,
    cancel: () => client.cancel(),
    dispose: () => client.dispose(),
  };
}
