import { createLocalSchemaApi } from "@/features/modular-sprite-schema/application/createLocalSchemaApi.js";
import { SchemaCatalog } from "@/features/modular-sprite-schema/application/schemaCatalog.js";
import { IndexedDbSchemaRepository } from "@/features/modular-sprite-schema/infrastructure/browser/indexedDbSchemaRepository.js";
import { WorkerSchemaMatchGateway } from "@/features/modular-sprite-schema/infrastructure/browser/workerSchemaMatchGateway.js";
import {
  BUNDLED_SCHEMA_ASSET_URLS,
  BUNDLED_SCHEMAS,
} from "@/features/modular-sprite-schema/infrastructure/bundled/bundledSchemaSource.js";

const repository = new IndexedDbSchemaRepository();
const catalog = new SchemaCatalog(repository, BUNDLED_SCHEMAS);
const matchGateway = new WorkerSchemaMatchGateway();

export const localSchemaApi = createLocalSchemaApi({
  catalog,
  repository,
  matchGateway,
  async getFallbackAsset(assetId) {
    const url = BUNDLED_SCHEMA_ASSET_URLS[assetId];
    if (!url) return undefined;
    const reference = BUNDLED_SCHEMAS
      .flatMap((schema) => [schema.referenceAsset, schema.thumbnailAsset])
      .find((asset) => asset?.assetId === assetId);
    if (!reference) return undefined;
    const response = await fetch(url);
    if (!response.ok)
      throw new Error(`Could not load built-in schema asset ${assetId}`);
    return { ...reference, blob: await response.blob() };
  },
});
