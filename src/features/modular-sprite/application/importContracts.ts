import type {
  ModularSpriteId,
  ModularSpriteProcessingRecipe,
  NormalizedPoint,
} from '@kukla2d/contracts';
import type { PortableSchemaSnapshot } from '@kukla2d/modular-sprite-schema';

import type { ModularSpriteDraftPart, RgbaImageData } from '../domain/contracts.js';

export interface ModularSpriteCommitPart {
  draft: ModularSpriteDraftPart;
  image: RgbaImageData;
  blob: Blob;
  contentBounds: ModularSpriteDraftPart['contentBounds'];
  componentSeeds: NormalizedPoint[];
}

export interface ModularSpriteCommitRequest {
  existingId?: ModularSpriteId;
  name: string;
  sourceFileName: string;
  sourceImage: RgbaImageData;
  sourceBlob: Blob;
  recipe: ModularSpriteProcessingRecipe;
  parts: ModularSpriteCommitPart[];
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
