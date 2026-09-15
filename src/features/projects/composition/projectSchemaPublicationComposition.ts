import type { ProjectDocument } from "@kukla2d/contracts";

import {
  createModularSpriteProcessingApi,
  createModularSpriteSchema,
  portableModularSpriteSchema,
} from "@/features/modular-sprite";
import { localSchemaApi } from "@/features/modular-sprite-schema";
import { publishProjectSchemas } from "@/features/projects/application/projectSchemaPublication.js";

export async function publishProjectSchemasToLocalDatabase(
  project: ProjectDocument,
): ReturnType<typeof publishProjectSchemas> {
  const processing = createModularSpriteProcessingApi();
  try {
    return await publishProjectSchemas(project, {
      decode: (source) => processing.decode(source),
      process: ({ image, recipe }) => processing.process({ image, recipe }),
      async resolveSourceBlob(texture) {
        const response = await fetch(texture.source);
        if (!response.ok)
          throw new Error(`Could not read modular source "${texture.name}"`);
        return response.blob();
      },
      schema: {
        initialize: () => localSchemaApi.initialize(),
        list: () => localSchemaApi.list(),
        create: createModularSpriteSchema,
        save: (schema) => localSchemaApi.save(schema),
        saveAsset: (asset) => localSchemaApi.saveAsset(asset),
        portableSnapshot: portableModularSpriteSchema,
      },
    });
  } finally {
    processing.dispose();
  }
}
