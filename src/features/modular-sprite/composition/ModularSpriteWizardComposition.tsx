import { useMemo } from "react";

import { portableModularSpriteSchema } from "@/features/modular-sprite/application/schemaBinding.js";
import { ModularSpriteWizard as WizardView } from "@/features/modular-sprite/components/wizard/ModularSpriteWizard.js";
import type { ModularSpriteWizardProps as WizardViewProps } from "@/features/modular-sprite/components/wizard/ModularSpriteWizard.types.js";
import {
  createPreviewImage,
  decodeModularSpriteFile,
  encodeRgbaPng,
} from "@/features/modular-sprite/infrastructure/imageCodec.js";
import { createModularSpriteGateway } from "@/features/modular-sprite/infrastructure/modularSpriteGateway.js";
import { localSchemaApi } from "@/features/modular-sprite-schema";

interface ModularSpriteWizardCompositionProps {
  open: boolean;
  highlightFirstExample?: boolean;
  onOpenChange: (open: boolean) => void;
  onCommit: WizardViewProps["onCommit"];
  confirmDiscard?: () => boolean;
}

export function ModularSpriteWizardComposition({
  open,
  highlightFirstExample = false,
  onOpenChange,
  onCommit,
  confirmDiscard,
}: ModularSpriteWizardCompositionProps): React.ReactElement {
  const processingGateway = useMemo(() => createModularSpriteGateway(), []);
  const ports = useMemo(
    () => ({
      image: {
        decode: decodeModularSpriteFile,
        preview: createPreviewImage,
        encode: encodeRgbaPng,
      },
      processing: processingGateway,
      schema: {
        initialize: () => localSchemaApi.initialize(),
        list: () => localSchemaApi.list(),
        match: (
          request: Parameters<typeof localSchemaApi.match>[0],
          options?: Parameters<typeof localSchemaApi.match>[1],
        ) => localSchemaApi.match(request, options),
        portableSnapshot: portableModularSpriteSchema,
        semantics: localSchemaApi.semantics,
      },
    }),
    [processingGateway],
  );

  return (
    <WizardView
      open={open}
      highlightFirstExample={highlightFirstExample}
      onOpenChange={onOpenChange}
      onCommit={onCommit}
      ports={ports}
      semanticCatalog={localSchemaApi.semantics}
      {...(confirmDiscard ? { confirmDiscard } : {})}
    />
  );
}
