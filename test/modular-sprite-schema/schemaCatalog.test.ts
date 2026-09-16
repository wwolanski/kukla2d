import { describe, expect, it, vi } from "vitest";

import type {
  ModularSpriteSchema,
  SemanticDefinition,
} from "@kukla2d/modular-sprite-schema";

import { SchemaCatalog } from "@/features/modular-sprite-schema/application/schemaCatalog";
import { BUNDLED_SCHEMAS } from "@/features/modular-sprite-schema/infrastructure/bundled/bundledSchemaSource";

describe("schema catalog", () => {
  it("removes obsolete built-ins while preserving local schemas", async () => {
    const obsolete = {
      ...structuredClone(BUNDLED_SCHEMAS[0]!),
      schemaId: "builtin.obsolete",
    };
    const local = {
      ...structuredClone(BUNDLED_SCHEMAS[0]!),
      schemaId: "local.keep",
      origin: { kind: "local" as const },
    };
    let schemas: ModularSpriteSchema[] = [obsolete, local];
    const semantics: SemanticDefinition[] = [];
    const repository = {
      list: vi.fn(async () => structuredClone(schemas)),
      put: vi.fn(async (schema: ModularSpriteSchema) => {
        schemas = schemas.filter(
          (item) =>
            item.schemaId !== schema.schemaId || item.revision !== schema.revision,
        );
        schemas.push(structuredClone(schema));
      }),
      delete: vi.fn(async (schemaId: string, revision: number) => {
        schemas = schemas.filter(
          (item) => item.schemaId !== schemaId || item.revision !== revision,
        );
      }),
      putSemantic: vi.fn(async (definition: SemanticDefinition) => {
        semantics.push(definition);
      }),
      listSemantics: vi.fn(async () => semantics),
      setSyncState: vi.fn(async () => undefined),
    };
    const catalog = new SchemaCatalog(repository, BUNDLED_SCHEMAS);

    await catalog.initialize();

    expect(repository.delete).toHaveBeenCalledWith(
      "builtin.obsolete",
      obsolete.revision,
    );
    expect(catalog.list().map((schema) => schema.schemaId).sort()).toEqual([
      "builtin.arcane-wizard",
      "builtin.armored-panda",
      "local.keep",
    ]);
  });

  it("keeps a bundled schema authoritative when a local record reuses its id", async () => {
    const collision = {
      ...structuredClone(BUNDLED_SCHEMAS[0]!),
      revision: BUNDLED_SCHEMAS[0]!.revision + 10,
      name: "Colliding local record",
      origin: { kind: "local" as const },
    };
    let schemas: ModularSpriteSchema[] = [collision];
    const repository = {
      list: vi.fn(async () => structuredClone(schemas)),
      put: vi.fn(async (schema: ModularSpriteSchema) => {
        schemas = schemas.filter(
          (item) =>
            item.schemaId !== schema.schemaId || item.revision !== schema.revision,
        );
        schemas.push(structuredClone(schema));
      }),
      delete: vi.fn(async () => undefined),
      putSemantic: vi.fn(async () => undefined),
      listSemantics: vi.fn(async () => []),
      setSyncState: vi.fn(async () => undefined),
    };

    const catalog = new SchemaCatalog(repository, BUNDLED_SCHEMAS);
    await catalog.initialize();

    expect(
      catalog
        .list()
        .find((schema) => schema.schemaId === collision.schemaId),
    ).toMatchObject({ name: BUNDLED_SCHEMAS[0]!.name, origin: { kind: "builtin" } });
    await expect(catalog.save(collision)).rejects.toThrow("reserved");
  });
});
