import type {
  ModularSpriteId,
  ModularSpriteProcessingRecipe,
  NormalizedPoint,
} from "@kukla2d/contracts";
import type { PortableSchemaSnapshot } from "@kukla2d/modular-sprite-schema";

import type {
  ModularSpriteDraftPart,
  RgbaImageData,
} from "../domain/contracts.types.js";

export interface ModularSpriteCommitRequest {
  existingId?: ModularSpriteId;
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
  schemaBinding?: {
    schemaId: string;
    schemaRevision: number;
    compositionId: string;
    slotToPartKey: Record<string, string>;
    snapshot: PortableSchemaSnapshot;
  };
}

export interface ModularSpriteCommitResult {
  modularSpriteId: ModularSpriteId;
  createdAssetIds: string[];
  createdNodeIds: string[];
}
