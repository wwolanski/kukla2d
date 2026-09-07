import type { RgbaImageData } from "../domain/contracts.types.js";

export interface ModularSpriteTaskRuntime {
  warmCache: {
    image: RgbaImageData;
    oklab: Float32Array | null;
  } | null;
  isAborted(requestId: string): boolean;
  reportProgress(requestId: string, progress: number, stage: string): void;
  checkpoint(): Promise<void>;
}
