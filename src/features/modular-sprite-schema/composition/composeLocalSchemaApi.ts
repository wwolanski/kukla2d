import { createLocalSchemaApi } from "@/features/modular-sprite-schema/application/createLocalSchemaApi.js";
import { SchemaCatalog } from "@/features/modular-sprite-schema/application/schemaCatalog.js";
import { IndexedDbSchemaRepository } from "@/features/modular-sprite-schema/infrastructure/browser/indexedDbSchemaRepository.js";
import { WorkerSchemaMatchGateway } from "@/features/modular-sprite-schema/infrastructure/browser/workerSchemaMatchGateway.js";
import { BUNDLED_SCHEMAS } from "@/features/modular-sprite-schema/infrastructure/bundled/bundledSchemaSource.js";

const repository = new IndexedDbSchemaRepository();
const catalog = new SchemaCatalog(repository, BUNDLED_SCHEMAS);
const matchGateway = new WorkerSchemaMatchGateway();

export const localSchemaApi = createLocalSchemaApi({
  catalog,
  repository,
  matchGateway,
});
