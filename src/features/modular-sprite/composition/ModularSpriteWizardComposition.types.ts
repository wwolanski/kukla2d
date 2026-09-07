import type { ModularSpriteId } from "@kukla2d/contracts";

import type { ModularSpriteWizardProps as WizardViewProps } from "../components/wizard/ModularSpriteWizard.types.js";

export interface ModularSpriteWizardCompositionProps {
  open: boolean;
  existingId?: ModularSpriteId | null;
  onOpenChange: (open: boolean) => void;
  onCommit: WizardViewProps["onCommit"];
  confirmDiscard?: () => boolean;
}
