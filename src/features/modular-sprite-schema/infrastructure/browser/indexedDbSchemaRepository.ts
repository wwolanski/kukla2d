import type {
  ModularSpriteSchema,
  SemanticDefinition,
} from "@kukla2d/modular-sprite-schema";

import {
  openAppDb,
  requestResult,
  SCHEMA_ASSET_STORE,
  SCHEMA_STORE,
  SCHEMA_SYNC_STORE,
  SEMANTIC_STORE,
} from "@/io/appDb";

import type {
  LocalSchemaRepository,
  SchemaCatalogSyncState,
  StoredSchemaAsset,
} from "../../application/localSchemaApi.types.js";

export class IndexedDbSchemaRepository implements LocalSchemaRepository {
  async list(): Promise<ModularSpriteSchema[]> {
    const db = await openAppDb();
    const values = await requestResult(
      db.transaction(SCHEMA_STORE).objectStore(SCHEMA_STORE).getAll(),
      "Failed to list schemas",
    );
    return values as ModularSpriteSchema[];
  }
  async put(schema: ModularSpriteSchema): Promise<void> {
    const db = await openAppDb();
    await requestResult(
      db
        .transaction(SCHEMA_STORE, "readwrite")
        .objectStore(SCHEMA_STORE)
        .put(structuredClone(schema)),
      "Failed to save schema",
    );
  }
  async putAsset(asset: StoredSchemaAsset): Promise<void> {
    const db = await openAppDb();
    await requestResult(
      db
        .transaction(SCHEMA_ASSET_STORE, "readwrite")
        .objectStore(SCHEMA_ASSET_STORE)
        .put(asset),
      "Failed to save schema asset",
    );
  }
  async getAsset(assetId: string): Promise<StoredSchemaAsset | undefined> {
    const db = await openAppDb();
    return requestResult(
      db
        .transaction(SCHEMA_ASSET_STORE)
        .objectStore(SCHEMA_ASSET_STORE)
        .get(assetId),
      "Failed to read schema asset",
    ) as Promise<StoredSchemaAsset | undefined>;
  }
  async putSemantic(definition: SemanticDefinition): Promise<void> {
    const db = await openAppDb();
    await requestResult(
      db
        .transaction(SEMANTIC_STORE, "readwrite")
        .objectStore(SEMANTIC_STORE)
        .put(definition),
      "Failed to save semantic definition",
    );
  }
  async listSemantics(): Promise<SemanticDefinition[]> {
    const db = await openAppDb();
    return requestResult(
      db.transaction(SEMANTIC_STORE).objectStore(SEMANTIC_STORE).getAll(),
      "Failed to list semantics",
    ) as Promise<SemanticDefinition[]>;
  }
  async setSyncState(state: SchemaCatalogSyncState): Promise<void> {
    const db = await openAppDb();
    await requestResult(
      db
        .transaction(SCHEMA_SYNC_STORE, "readwrite")
        .objectStore(SCHEMA_SYNC_STORE)
        .put(state),
      "Failed to save sync state",
    );
  }
}
