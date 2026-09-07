import type {
  MatchProgressEvent,
  ModularSpriteSchema,
  SchemaMatchRequest,
  SchemaMatchResponse,
  SemanticCatalog,
  SemanticDefinition,
} from "@kukla2d/modular-sprite-schema";

import type {
  CatalogAwareSchemaMatchGateway,
  LocalSchemaRepository,
  SchemaCatalogCapability,
  StoredSchemaAsset,
} from "./localSchemaApi.types.js";

interface LocalSchemaApi {
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

export function createLocalSchemaApi(dependencies: {
  catalog: SchemaCatalogCapability;
  repository: LocalSchemaRepository;
  matchGateway: CatalogAwareSchemaMatchGateway;
}): LocalSchemaApi {
  const { catalog, repository, matchGateway } = dependencies;
  let ready: Promise<void> | null = null;

  const synchronizeGateway = (): void => {
    matchGateway.setCatalog(catalog.list(), catalog.revision);
  };

  const initialize = (): Promise<void> => {
    ready ??= catalog.initialize().then(synchronizeGateway);
    return ready;
  };

  return {
    semantics: catalog.semantics,
    initialize,
    list: () => catalog.list(),
    async match(request, options) {
      await initialize();
      return matchGateway.match(request, options);
    },
    async save(schema: ModularSpriteSchema) {
      await initialize();
      await catalog.save(schema);
      synchronizeGateway();
    },
    saveAsset(asset: StoredSchemaAsset) {
      return repository.putAsset(asset);
    },
    saveSemantic(definition: SemanticDefinition) {
      catalog.semantics.upsert(definition);
      return repository.putSemantic(definition);
    },
  };
}
