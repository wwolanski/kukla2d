import type { ModularSpriteProcessingPort } from "@/features/modular-sprite/application/finalizeModularSpriteImport.types.js";
import type { RgbaImageData } from "@/features/modular-sprite/domain/contracts.types.js";
import { createModularSpriteWorkerClient } from "@/features/modular-sprite/infrastructure/modularSpriteWorkerClient.js";
import type { ModularSpriteWorkerClient } from "@/features/modular-sprite/infrastructure/modularSpriteWorkerClient.types.js";

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
