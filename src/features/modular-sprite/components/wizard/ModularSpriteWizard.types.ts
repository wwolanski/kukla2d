import type {
  ModularSpriteDocument,
  ModularSpriteId,
} from "@kukla2d/contracts";
import type {
  MatchProgressEvent,
  ModularSpriteSchema,
  SemanticCatalog,
  SemanticDefinition,
  SchemaMatchRequest,
  SchemaMatchResponse,
} from "@kukla2d/modular-sprite-schema";

import type {
  ModularSpriteProcessingPort,
  ModularSpriteSchemaPort,
} from "../../application/finalizeModularSpriteImport.types.js";
import type { ModularSpriteCommitRequest } from "../../application/importContracts.types.js";
import type { RgbaImageData } from "../../domain/contracts.types.js";

interface ModularSpriteImageControllerPort {
  decode(file: File): Promise<RgbaImageData>;
  preview(image: RgbaImageData): RgbaImageData;
  encode(image: RgbaImageData): Promise<Blob>;
}

interface ModularSpriteProcessingControllerPort extends ModularSpriteProcessingPort {
  warm(image: RgbaImageData): Promise<void>;
  onProgress?(
    listener: (progress: { progress: number; stage: string }) => void,
  ): () => void;
  cancel(): void;
  dispose(): void;
}

interface ModularSpriteSchemaControllerPort extends ModularSpriteSchemaPort {
  initialize(): Promise<void>;
  list(): ModularSpriteSchema[];
  match(
    request: SchemaMatchRequest,
    options?: {
      signal?: AbortSignal;
      onProgress?: (event: MatchProgressEvent) => void;
    },
  ): Promise<SchemaMatchResponse>;
  semantics?: SemanticCatalog;
}

interface ModularSpriteExistingSource {
  file: File;
  document: ModularSpriteDocument;
}

interface ModularSpriteWizardControllerPorts {
  image: ModularSpriteImageControllerPort;
  processing: ModularSpriteProcessingControllerPort;
  schema: ModularSpriteSchemaControllerPort;
  resolveExisting?: (
    id: ModularSpriteId,
  ) => Promise<ModularSpriteExistingSource>;
}

export interface ModularSpriteWizardProps {
  open: boolean;
  existingId?: ModularSpriteId | null;
  onOpenChange: (open: boolean) => void;
  onCommit: (request: ModularSpriteCommitRequest) => Promise<unknown>;
  ports: ModularSpriteWizardControllerPorts;
  semanticCatalog: SemanticCatalog;
  onSaveSemantic: (definition: SemanticDefinition) => Promise<void>;
  confirmDiscard?: () => boolean;
}
