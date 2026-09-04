import type { MatchProgressEvent, ModularSpriteSchema, SchemaMatchRequest, SchemaMatchResponse, SemanticDefinition } from '@kukla2d/modular-sprite-schema';

import { IndexedDbSchemaRepository, type StoredSchemaAsset } from './indexedDbSchemaRepository.js';
import { WorkerSchemaMatchGateway } from './workerSchemaMatchGateway.js';
import { schemaCatalog } from '../../application/schemaCatalog.js';

import type { SchemaMatchGateway } from '../../application/schemaMatchGateway.js';

export class LocalSchemaApi {
  readonly #workerGateway = new WorkerSchemaMatchGateway();
  readonly gateway: SchemaMatchGateway = this.#workerGateway;
  #ready: Promise<void> | null = null;
  readonly #repository = new IndexedDbSchemaRepository();
  initialize(): Promise<void> { return this.#ready ??= schemaCatalog.initialize().then(()=>this.#workerGateway.setCatalog(schemaCatalog.list(),schemaCatalog.revision)); }
  async match(request: SchemaMatchRequest, options?: { signal?: AbortSignal; onProgress?: (event: MatchProgressEvent)=>void }): Promise<SchemaMatchResponse> { await this.initialize();return this.gateway.match(request,options); }
  async save(schema: ModularSpriteSchema): Promise<void> { await this.initialize();await schemaCatalog.save(schema);this.#workerGateway.setCatalog(schemaCatalog.list(),schemaCatalog.revision); }
  async saveAsset(asset: StoredSchemaAsset): Promise<void> { await this.#repository.putAsset(asset); }
  async saveSemantic(definition: SemanticDefinition): Promise<void> { await this.#repository.putSemantic(definition); schemaCatalog.semantics.upsert(definition); }
}
export const localSchemaApi = new LocalSchemaApi();
