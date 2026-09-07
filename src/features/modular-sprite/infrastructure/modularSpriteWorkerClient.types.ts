import type { ModularSpriteProcessingRecipe } from "@kukla2d/contracts";

import type {
  ExtractedPart,
  ModularSpriteDraftPart,
  ProcessedModularSprite,
  ProcessModularSpriteRequest,
  RgbaImageData,
} from "../domain/contracts.types.js";

export interface ModularSpriteWorkerClient {
  warm(image: RgbaImageData): Promise<void>;
  process(request: {
    recipe: ModularSpriteProcessingRecipe;
    image?: RgbaImageData;
  }): Promise<ProcessedModularSprite>;
  extract(
    request: ProcessModularSpriteRequest,
    parts: ModularSpriteDraftPart[],
  ): Promise<ExtractedPart[]>;
  onProgress: (
    listener: (progress: { progress: number; stage: string }) => void,
  ) => () => void;
  cancel(): void;
  dispose(): void;
}
