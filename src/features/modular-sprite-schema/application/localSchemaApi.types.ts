import type {
  ModularSpriteSchema,
  SchemaAssetRef,
  SchemaMatchGateway,
  SemanticCatalog,
  SemanticDefinition,
} from "@kukla2d/modular-sprite-schema";

export interface StoredSchemaAsset extends SchemaAssetRef {
  blob: Blob;
}

export interface LocalSchemaRepository {
  list(): Promise<ModularSpriteSchema[]>;
  put(schema: ModularSpriteSchema): Promise<void>;
  putSemantic(definition: SemanticDefinition): Promise<void>;
  listSemantics(): Promise<SemanticDefinition[]>;
  setSyncState(state: {
    sourceId: string;
    revision: string;
    updatedAt: string;
  }): Promise<void>;
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
