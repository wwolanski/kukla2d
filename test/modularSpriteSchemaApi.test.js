import { describe, expect, it, vi } from "vitest";

import { SemanticCatalog } from "@kukla2d/modular-sprite-schema";

import { createLocalSchemaApi } from "../src/features/modular-sprite-schema/application/createLocalSchemaApi.js";

describe("local schema application capability", () => {
  it("coordinates injected catalog, repository, and match gateway", async () => {
    const schemas = [{ schemaId: "schema-1" }];
    const semantics = new SemanticCatalog([]);
    const catalog = {
      semantics,
      revision: "revision-1",
      list: vi.fn(() => schemas),
      initialize: vi.fn(async () => undefined),
      save: vi.fn(async () => undefined),
    };
    const repository = {
      list: vi.fn(),
      put: vi.fn(),
      putSemantic: vi.fn(async () => undefined),
      listSemantics: vi.fn(),
      setSyncState: vi.fn(),
      putAsset: vi.fn(async () => undefined),
    };
    const response = { requestId: "request-1", matches: [] };
    const matchGateway = {
      setCatalog: vi.fn(),
      match: vi.fn(async () => response),
    };
    const api = createLocalSchemaApi({ catalog, repository, matchGateway });

    await api.initialize();
    await api.initialize();
    await api.match({ requestId: "request-1" });
    await api.save({ schemaId: "schema-2" });
    await api.saveAsset({ assetId: "asset-1", blob: new Blob() });
    await api.saveSemantic({
      id: "semantic-1",
      revision: 1,
      kind: "part-role",
      key: "head",
      label: "Head",
      aliases: [],
      origin: "user",
    });

    expect(catalog.initialize).toHaveBeenCalledOnce();
    expect(matchGateway.setCatalog).toHaveBeenNthCalledWith(
      1,
      schemas,
      "revision-1",
    );
    expect(matchGateway.setCatalog).toHaveBeenCalledTimes(2);
    expect(matchGateway.match).toHaveBeenCalledOnce();
    expect(catalog.save).toHaveBeenCalledOnce();
    expect(repository.putAsset).toHaveBeenCalledOnce();
    expect(repository.putSemantic).toHaveBeenCalledOnce();
    expect(semantics.get("semantic-1")).toBeDefined();
  });
});
