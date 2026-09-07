import { createLocalSchemaApi } from "../application/createLocalSchemaApi.js";
import { SchemaCatalog } from "../application/schemaCatalog.js";
import { IndexedDbSchemaRepository } from "../infrastructure/browser/indexedDbSchemaRepository.js";
import { WorkerSchemaMatchGateway } from "../infrastructure/browser/workerSchemaMatchGateway.js";
import { BUNDLED_SCHEMAS } from "../infrastructure/bundled/bundledSchemaSource.js";

const repository = new IndexedDbSchemaRepository();
const catalog = new SchemaCatalog(repository, BUNDLED_SCHEMAS);
const matchGateway = new WorkerSchemaMatchGateway();

export const localSchemaApi = createLocalSchemaApi({
  catalog,
  repository,
  matchGateway,
});
