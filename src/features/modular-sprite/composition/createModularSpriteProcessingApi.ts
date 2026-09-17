import type { ModularSpriteProcessingRecipe } from "@kukla2d/contracts";

import type { RgbaImageData } from "@/features/modular-sprite/domain/contracts.types.js";
import {
  decodeModularSpriteFile,
  encodeRgbaPng,
} from "@/features/modular-sprite/infrastructure/imageCodec.js";
import { createModularSpriteGateway } from "@/features/modular-sprite/infrastructure/modularSpriteGateway.js";

interface ModularSpriteProcessingApi {
  decode(source: Blob | File): Promise<RgbaImageData>;
  encode(image: RgbaImageData): Promise<Blob>;
  process(input: {
    image: RgbaImageData;
    recipe: ModularSpriteProcessingRecipe;
  }): ReturnType<ReturnType<typeof createModularSpriteGateway>["process"]>;
  dispose(): void;
}

export function createModularSpriteProcessingApi(): ModularSpriteProcessingApi {
  const gateway = createModularSpriteGateway();
  return {
    decode: (source) =>
      decodeModularSpriteFile(
        source instanceof File
          ? source
          : new File([source], "modular-sprite.png", {
              type: source.type || "image/png",
            }),
      ),
    encode: encodeRgbaPng,
    process: (input) => gateway.process(input),
    dispose: () => gateway.dispose(),
  };
}
