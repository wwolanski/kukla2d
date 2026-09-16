import type {
  ModularSpriteDocument,
  ModularSpriteId,
  ModularSpriteProcessingRecipe,
  NormalizedPoint,
} from "@kukla2d/contracts";

import type {
  ModularSpriteDraftPart,
  RgbaImageData,
} from "@/features/modular-sprite/domain/contracts.types.js";

export interface ModularSpriteCommitRequest {
  existingId?: ModularSpriteId;
  includeAssetId?: string;
  force?: boolean;
  removeFromLibrary?: boolean;
  name: string;
  sourceFileName: string;
  sourceImage: RgbaImageData;
  sourceBlob: Blob;
  recipe: ModularSpriteProcessingRecipe;
  parts: {
    draft: ModularSpriteDraftPart;
    image: RgbaImageData;
    blob: Blob;
    contentBounds: ModularSpriteDraftPart["contentBounds"];
    componentSeeds: NormalizedPoint[];
  }[];
  addToCanvas: boolean;
  schemaBinding?: NonNullable<ModularSpriteDocument["schemaBinding"]>;
}

export interface ModularSpriteCommitResult {
  modularSpriteId: ModularSpriteId;
  createdAssetIds: string[];
  createdNodeIds: string[];
}
