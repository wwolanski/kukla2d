import { localSchemaApi } from "@/features/modular-sprite-schema";
import type { SchemaLibrarySource } from "@/features/schema-library";

export const localSchemaLibrarySource: SchemaLibrarySource = {
  descriptor: {
    id: "local",
    label: "local (indexedDB)",
    detail: "Stored in this browser",
    kind: "local",
  },
  initialize: () => localSchemaApi.initialize(),
  async list() {
    await localSchemaApi.initialize();
    return localSchemaApi.list();
  },
  async getAsset(assetId) {
    const asset = await localSchemaApi.getAsset(assetId);
    return asset?.blob;
  },
};
