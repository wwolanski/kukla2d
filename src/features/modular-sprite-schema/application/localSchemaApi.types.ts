import type {
  MatchProgressEvent,
  ModularSpriteSchema,
  SchemaAssetRef,
  SchemaMatchGateway,
  SchemaMatchRequest,
  SchemaMatchResponse,
  SemanticCatalog,
  SemanticDefinition,
} from "@kukla2d/modular-sprite-schema";

export interface StoredSchemaAsset extends SchemaAssetRef {
  blob: Blob;
}

export interface SchemaCatalogSyncState {
  sourceId: string;
  revision: string;
  updatedAt: string;
}

export interface SchemaCatalogRepository {
  list(): Promise<ModularSpriteSchema[]>;
  put(schema: ModularSpriteSchema): Promise<void>;
  putSemantic(definition: SemanticDefinition): Promise<void>;
  listSemantics(): Promise<SemanticDefinition[]>;
  setSyncState(state: SchemaCatalogSyncState): Promise<void>;
}

export interface LocalSchemaRepository extends SchemaCatalogRepository {
  putAsset(asset: StoredSchemaAsset): Promise<void>;
}

export interface SchemaCatalogCapability {
  readonly semantics: SemanticCatalog;
  readonly revision: string;
  list(): ModularSpriteSchema[];
  initialize(): Promise<void>;
  save(schema: ModularSpriteSchema): Promise<void>;
}

export interface CatalogAwareSchemaMatchGateway extends SchemaMatchGateway {
  setCatalog(
    schemas: readonly ModularSpriteSchema[],
    catalogRevision: string,
  ): void;
}

export interface LocalSchemaApi {
  readonly semantics: SemanticCatalog;
  initialize(): Promise<void>;
  list(): ModularSpriteSchema[];
  match(
    request: SchemaMatchRequest,
    options?: {
      signal?: AbortSignal;
      onProgress?: (event: MatchProgressEvent) => void;
    },
  ): Promise<SchemaMatchResponse>;
  save(schema: ModularSpriteSchema): Promise<void>;
  saveAsset(asset: StoredSchemaAsset): Promise<void>;
  saveSemantic(definition: SemanticDefinition): Promise<void>;
}
