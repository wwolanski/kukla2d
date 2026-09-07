import type { AssetId } from "./errors.types.js";

export interface AssetEntry {
  id: AssetId;
  type: "texture" | "audio" | "model";
  refCount: number;
  data: ImageBitmap | AudioBuffer | ArrayBuffer;
  dispose: () => void;
}

export interface AssetRegistry {
  registerTexture(id: AssetId, bitmap: ImageBitmap): AssetEntry;
  registerAudio(id: AssetId, buffer: AudioBuffer): AssetEntry;
  registerModel(id: AssetId, model: ArrayBuffer): AssetEntry;
  acquire(id: AssetId): AssetEntry | null;
  release(id: AssetId): void;
  disposeProject(): void;
  disposeAll(): void;
}
