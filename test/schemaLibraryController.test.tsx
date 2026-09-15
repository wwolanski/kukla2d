// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { ModularSpriteSchema } from "@kukla2d/modular-sprite-schema";

import {
  filterSchemaLibrary,
  useSchemaLibraryController,
} from "@/features/schema-library";

const schema = (overrides: Partial<ModularSpriteSchema> = {}): ModularSpriteSchema =>
  ({
    formatVersion: 1,
    schemaId: "local.humanoid",
    revision: 3,
    compositionId: "composition",
    name: "Humanoid Layout",
    description: "Reference layout",
    characterTypeIds: ["humanoid"],
    characterClassIds: ["wizard"],
    tags: ["bundled", "starter"],
    slots: [],
    fingerprint: {
      canvasAspectRatio: 1,
      foregroundBounds: { x: 0, y: 0, width: 1, height: 1 },
      slots: [],
      expectedIslandCount: 0,
    },
    matcherProfile: {} as ModularSpriteSchema["matcherProfile"],
    referenceAsset: {
      assetId: "reference.png",
      mimeType: "image/png",
      width: 100,
      height: 100,
    },
    origin: { kind: "builtin", sourceId: "bundled" },
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-02T00:00:00.000Z",
    ...overrides,
  }) as ModularSpriteSchema;

afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = "";
});

describe("schema library controller", () => {
  it("filters by origin and searchable schema metadata", () => {
    const local = schema();
    const user = schema({
      schemaId: "user.rogue",
      name: "Rogue Layout",
      origin: { kind: "user", sourceId: "local" },
    });
    const remote = schema({
      schemaId: "remote.knight",
      name: "Knight Layout",
      characterClassIds: ["knight"],
      origin: { kind: "remote", sourceId: "catalog" },
      tags: ["remote"],
    });

    expect(filterSchemaLibrary([local, remote], "wizard", "all")).toEqual([local]);
    expect(filterSchemaLibrary([local, user, remote], "", "local")).toEqual([
      local,
      user,
    ]);
    expect(filterSchemaLibrary([local, user, remote], "", "remote")).toEqual([
      remote,
    ]);
  });

  it("loads shared assets once and revokes every object URL on unmount", async () => {
    const revokeObjectURL = vi.fn();
    const createObjectURL = vi.fn(() => "blob:reference");
    vi.stubGlobal("URL", {
      createObjectURL,
      revokeObjectURL,
    });
    const source = {
      descriptor: { id: "bundled", label: "Bundled", detail: "Built in", kind: "local" as const },
      initialize: vi.fn(async () => undefined),
      list: vi.fn(async () => [schema(), schema({ schemaId: "local.second" })]),
      getAsset: vi.fn(async () => new Blob(["image"], { type: "image/png" })),
    };
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    function Probe() {
      const controller = useSchemaLibraryController(source);
      return <output>{`${controller.status}:${Object.keys(controller.assetUrls).length}`}</output>;
    }

    await act(async () => {
      root.render(<Probe />);
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(source.initialize).toHaveBeenCalled();
    expect(source.getAsset).toHaveBeenCalledWith("reference.png");
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(host.textContent).toContain("ready:1");

    act(() => root.unmount());
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:reference");
  });
});
