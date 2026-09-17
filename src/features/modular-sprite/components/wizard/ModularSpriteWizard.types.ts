import type {
  MatchProgressEvent,
  ModularSpriteSchema,
  SemanticCatalog,
  SchemaMatchRequest,
  SchemaMatchResponse,
} from "@kukla2d/modular-sprite-schema";

import type {
  ModularSpriteProcessingPort,
  ModularSpriteSchemaPort,
} from "@/features/modular-sprite/application/finalizeModularSpriteImport.types.js";
import type { ModularSpriteCommitRequest } from "@/features/modular-sprite/application/importContracts.types.js";
import type { RgbaImageData } from "@/features/modular-sprite/domain/contracts.types.js";

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

interface ModularSpriteWizardControllerPorts {
  image: ModularSpriteImageControllerPort;
  processing: ModularSpriteProcessingControllerPort;
  schema: ModularSpriteSchemaControllerPort;
}

export interface ModularSpriteWizardProps {
  open: boolean;
  highlightFirstExample?: boolean;
  onOpenChange: (open: boolean) => void;
  onCommit: (request: ModularSpriteCommitRequest) => Promise<unknown>;
  ports: ModularSpriteWizardControllerPorts;
  semanticCatalog: SemanticCatalog;
  confirmDiscard?: () => boolean;
}
