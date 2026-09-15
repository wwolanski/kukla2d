import type {
  AssetId,
  ModularSpriteId,
  ProjectDocument,
} from "@kukla2d/contracts";

import type { RgbaImageData } from "@/features/modular-sprite/index.js";

export interface GeneratorAsset {
  assetId: AssetId;
  image: RgbaImageData;
  blob: Blob;
}

export interface GenerateModularSpriteInput {
  project: ProjectDocument;
  name: string;
  assets: readonly GeneratorAsset[];
  existingId?: ModularSpriteId;
  padding?: number;
}
