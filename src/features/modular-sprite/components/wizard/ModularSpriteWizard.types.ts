import type { ModularSpriteId } from "@kukla2d/contracts";
import type {
  SemanticCatalog,
  SemanticDefinition,
} from "@kukla2d/modular-sprite-schema";

import type { ModularSpriteCommitRequest } from "../../application/importContracts.js";
import type { ModularSpriteWizardControllerPorts } from "../../application/useModularSpriteWizardController.js";

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
