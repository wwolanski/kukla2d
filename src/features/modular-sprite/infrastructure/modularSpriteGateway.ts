import { createModularSpriteWorkerClient, type ModularSpriteWorkerClient } from './modularSpriteWorkerClient.js';

import type { ModularSpriteProcessingPort } from '../application/finalizeModularSpriteImport.js';
import type { ModularSpriteProcessingControllerPort } from '../application/useModularSpriteWizardController.js';

/** Adapter from the browser Worker client to the application processing port. */
export function createModularSpriteGateway(client: ModularSpriteWorkerClient = createModularSpriteWorkerClient()): ModularSpriteProcessingControllerPort {
  const processing: ModularSpriteProcessingPort = {
    process: request => client.process(request),
    extract: (request, parts) => client.extract(request, [...parts]),
  };
  return {
    ...processing,
    warm: image => client.warm(image),
    onProgress: client.onProgress,
    cancel: () => client.cancel(),
    dispose: () => client.dispose(),
  };
}

