import {
  BUILTIN_SEMANTIC_DEFINITIONS,
  SemanticCatalog,
  type ModularSpriteSchema,
} from "@kukla2d/modular-sprite-schema";

import type {
  SchemaCatalogCapability,
  SchemaCatalogRepository,
} from "./localSchemaApi.types.js";

export class SchemaCatalog implements SchemaCatalogCapability {
  readonly semantics = new SemanticCatalog();
  #schemas: ModularSpriteSchema[] = [];
  #revision = "empty";
  constructor(
    private readonly repository: SchemaCatalogRepository,
    private readonly bundledSchemas: readonly ModularSpriteSchema[],
  ) {}
  get revision(): string {
    return this.#revision;
  }
  list(): ModularSpriteSchema[] {
    return structuredClone(this.#schemas);
  }
  async initialize(): Promise<void> {
    const stored = await this.repository.list();
    const keys = new Set(
      stored.map((item) => `${item.schemaId}@${item.revision}`),
    );
    for (const schema of this.bundledSchemas)
      if (!keys.has(`${schema.schemaId}@${schema.revision}`))
        await this.repository.put(schema);
    for (const item of BUILTIN_SEMANTIC_DEFINITIONS) {
      this.semantics.upsert(item);
      await this.repository.putSemantic(item);
    }
    for (const item of await this.repository.listSemantics())
      this.semantics.upsert(item);
    const allSchemas = await this.repository.list();
    allSchemas.sort(
      (left, right) =>
        left.schemaId.localeCompare(right.schemaId) ||
        right.revision - left.revision,
    );
    this.#schemas = allSchemas.filter(
      (schema, index) =>
        index === 0 || allSchemas[index - 1]?.schemaId !== schema.schemaId,
    );
    this.#revision = this.#schemas
      .map((item) => `${item.schemaId}@${item.revision}:${item.updatedAt}`)
      .join("|");
    await this.repository.setSyncState({
      sourceId: "local",
      revision: this.#revision,
      updatedAt: new Date().toISOString(),
    });
  }
  async save(schema: ModularSpriteSchema): Promise<void> {
    await this.repository.put(schema);
    await this.initialize();
  }
}
