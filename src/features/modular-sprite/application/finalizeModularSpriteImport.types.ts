import type { ModularSpriteProcessingRecipe } from "@kukla2d/contracts";
import type {
  ModularSpriteSchema,
  PortableSchemaSnapshot,
} from "@kukla2d/modular-sprite-schema";

import type {
  ExtractedPart,
  ModularSpriteDraftPart,
  ProcessedModularSprite,
  RgbaImageData,
} from "@/features/modular-sprite/domain/contracts.types.js";

export interface ModularSpriteProcessingPort {
  process(input: {
    image?: RgbaImageData;
    recipe: ModularSpriteProcessingRecipe;
  }): Promise<ProcessedModularSprite>;
  extract(
    input: { image: RgbaImageData; recipe: ModularSpriteProcessingRecipe },
    parts: readonly ModularSpriteDraftPart[],
  ): Promise<ExtractedPart[]>;
}

export interface ModularSpriteSchemaPort {
  portableSnapshot(schema: ModularSpriteSchema): PortableSchemaSnapshot;
}
