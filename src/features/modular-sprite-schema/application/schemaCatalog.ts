import {
  BUILTIN_SEMANTIC_DEFINITIONS,
  SemanticCatalog,
  type SemanticDefinition,
  type ModularSpriteSchema,
} from "@kukla2d/modular-sprite-schema";

import type { SchemaCatalogCapability } from "@/features/modular-sprite-schema/application/localSchemaApi.types.js";

interface SchemaCatalogRepository {
  list(): Promise<ModularSpriteSchema[]>;
  put(schema: ModularSpriteSchema): Promise<void>;
  delete(schemaId: string, revision: number): Promise<void>;
  putSemantic(definition: SemanticDefinition): Promise<void>;
  listSemantics(): Promise<SemanticDefinition[]>;
  setSyncState(state: {
    sourceId: string;
    revision: string;
    updatedAt: string;
  }): Promise<void>;
}

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
    const bundledIds = new Set(this.bundledSchemas.map((item) => item.schemaId));
    const bundledKeys = new Set(
      this.bundledSchemas.map((item) => `${item.schemaId}@${item.revision}`),
    );
    for (const schema of stored) {
      if (
        schema.origin.kind === "builtin" &&
        !bundledKeys.has(`${schema.schemaId}@${schema.revision}`)
      )
        await this.repository.delete(schema.schemaId, schema.revision);
    }
    const keys = new Set(
      stored
        .filter(
          (item) =>
            item.origin.kind !== "builtin" ||
            bundledKeys.has(`${item.schemaId}@${item.revision}`),
        )
        .map((item) => `${item.schemaId}@${item.revision}`),
    );
    for (const schema of this.bundledSchemas) {
      const storedAtRevision = stored.find(
        (item) =>
          item.schemaId === schema.schemaId && item.revision === schema.revision,
      );
      if (
        !keys.has(`${schema.schemaId}@${schema.revision}`) ||
        storedAtRevision?.origin.kind !== "builtin"
      )
        await this.repository.put(schema);
    }
    for (const item of BUILTIN_SEMANTIC_DEFINITIONS) {
      this.semantics.upsert(item);
      await this.repository.putSemantic(item);
    }
    for (const item of await this.repository.listSemantics())
      this.semantics.upsert(item);
    const allSchemas = (await this.repository.list()).filter(
      (schema) =>
        !bundledIds.has(schema.schemaId) || schema.origin.kind === "builtin",
    );
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
    if (
      schema.origin.kind !== "builtin" &&
      this.bundledSchemas.some((item) => item.schemaId === schema.schemaId)
    )
      throw new Error(
        `Schema ID "${schema.schemaId}" is reserved by a built-in schema.`,
      );
    await this.repository.put(schema);
    await this.initialize();
  }
}
