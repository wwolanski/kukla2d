import { useMemo, useRef } from "react";

import type { ModularSpriteId, ProjectDocument } from "@kukla2d/contracts";

import { useProjectStore } from "@/store/projectStore";

import { localSchemaApi } from "@/features/modular-sprite-schema";

import {
  createModularSpriteSchema,
  portableModularSpriteSchema,
} from "../application/schemaBinding.js";
import { ModularSpriteWizard as WizardView } from "../components/wizard/ModularSpriteWizard.js";
import {
  createPreviewImage,
  decodeModularSpriteFile,
  encodeRgbaPng,
} from "../infrastructure/imageCodec.js";
import { createModularSpriteGateway } from "../infrastructure/modularSpriteGateway.js";

import type { ModularSpriteWizardCompositionProps } from "./ModularSpriteWizardComposition.types.js";

export function ModularSpriteWizardComposition({
  open,
  existingId,
  onOpenChange,
  onCommit,
  confirmDiscard,
}: ModularSpriteWizardCompositionProps): React.ReactElement {
  const project = useProjectStore((state) => state.project);
  const projectRef = useRef<ProjectDocument>(project);
  projectRef.current = project;
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
        createSchema: createModularSpriteSchema,
        saveAsset: (asset: Parameters<typeof localSchemaApi.saveAsset>[0]) =>
          localSchemaApi.saveAsset(asset),
        save: (schema: Parameters<typeof localSchemaApi.save>[0]) =>
          localSchemaApi.save(schema),
        portableSnapshot: portableModularSpriteSchema,
        semantics: localSchemaApi.semantics,
      },
      resolveExisting: async (id: ModularSpriteId) => {
        const currentProject = projectRef.current;
        const document = currentProject.modularSprites.find(
          (candidate) => candidate.id === id,
        );
        if (!document)
          throw new Error(
            "The modular sprite no longer exists in this project",
          );
        const texture = currentProject.textures.find(
          (candidate) => candidate.id === document.sourceAssetId,
        );
        if (!texture)
          throw new Error("The modular sprite source texture is missing");
        const response = await fetch(texture.source);
        if (!response.ok) throw new Error("Could not open the source image");
        const blob = await response.blob();
        return {
          document,
          file: new File([blob], texture.fileName || `${document.name}.png`, {
            type: blob.type || "image/png",
          }),
        };
      },
    }),
    [processingGateway],
  );

  return (
    <WizardView
      open={open}
      {...(existingId !== undefined ? { existingId } : {})}
      onOpenChange={onOpenChange}
      onCommit={onCommit}
      ports={ports}
      semanticCatalog={localSchemaApi.semantics}
      onSaveSemantic={(definition) => localSchemaApi.saveSemantic(definition)}
      {...(confirmDiscard ? { confirmDiscard } : {})}
    />
  );
}
