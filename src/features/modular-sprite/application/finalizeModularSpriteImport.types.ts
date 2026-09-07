import type { ModularSpriteProcessingRecipe } from "@kukla2d/contracts";
import type {
  ModularSpriteSchema,
  SchemaAssetRef,
  PortableSchemaSnapshot,
} from "@kukla2d/modular-sprite-schema";

import type { ModularSpriteSchemaMetadata } from "./schemaBinding.types.js";
import type {
  ExtractedPart,
  ModularSpriteDraftPart,
  ProcessedModularSprite,
  RgbaImageData,
} from "../domain/contracts.types.js";

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

interface StoredSchemaAsset extends SchemaAssetRef {
  blob: Blob;
}

export interface ModularSpriteSchemaPort {
  createSchema(input: {
    metadata: ModularSpriteSchemaMetadata;
    parts: readonly ModularSpriteDraftPart[];
    observation: ProcessedModularSprite["observation"];
    referenceAsset: SchemaAssetRef;
    schemaId?: string;
    revision?: number;
  }): ModularSpriteSchema;
  saveAsset(asset: StoredSchemaAsset): Promise<void>;
  save(schema: ModularSpriteSchema): Promise<void>;
  portableSnapshot(schema: ModularSpriteSchema): PortableSchemaSnapshot;
}
