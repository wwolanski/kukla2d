import { describe, expect, it } from "vitest";

import { createEmptyProject } from "@/core/createEmptyProject";
import { commitGeneratedPackage } from "@/features/modular-sprite-generator/application/commitGeneratedPackage.js";
import { generateModularSprite } from "@/features/modular-sprite-generator";
import type { ModularSpriteCommitResult } from "@/features/modular-sprite";
import { useProjectStore } from "@/store/projectStore";
import {
  applyPatches,
  clearHistory,
  undo,
  undoCount,
} from "@/store/undoHistory";

const pixel = (alpha = 255) => ({
  width: 1,
  height: 1,
  data: new Uint8ClampedArray([10, 20, 30, alpha]),
});

describe("generateModularSprite", () => {
  it("packs assets, preserves their IDs, and prioritizes canvas draw order", async () => {
    const project = createEmptyProject();
    project.textures.push(
      { id: "a", source: "blob:a", name: "Head" },
      { id: "b", source: "blob:b", name: "Body" },
    );
    project.nodes.push(
      {
        id: "node-a",
        type: "part",
        name: "Head",
        parent: null,
        textureId: "a",
        draw_order: 9,
        opacity: 1,
        visible: true,
        clip_mask: null,
        transform: {
          x: 20,
          y: 20,
          rotation: 0,
          scaleX: 1,
          scaleY: 1,
          pivotX: 0,
          pivotY: 0,
        },
        meshOpts: null,
        mesh: null,
      },
      {
        id: "node-b",
        type: "part",
        name: "Body",
        parent: null,
        textureId: "b",
        draw_order: 2,
        opacity: 1,
        visible: true,
        clip_mask: null,
        transform: {
          x: 0,
          y: 0,
          rotation: 0,
          scaleX: 1,
          scaleY: 1,
          pivotX: 0,
          pivotY: 0,
        },
        meshOpts: null,
        mesh: null,
      },
    );

    const request = await generateModularSprite(
      {
        project,
        name: "Hero",
        assets: [
          { assetId: "a", image: pixel(), blob: new Blob(["a"]) },
          { assetId: "b", image: pixel(), blob: new Blob(["b"]) },
        ],
      },
      { encode: async () => new Blob(["sheet"], { type: "image/png" }) },
    );

    expect(request.parts.map((part) => part.draft.assetId)).toEqual([
      "b",
      "a",
    ]);
    expect(request.parts.map((part) => part.draft.order)).toEqual([2, 9]);
    expect(request.sourceImage.data.some((value) => value !== 0)).toBe(true);
  });

  it("keeps existing package metadata during regeneration", async () => {
    const project = createEmptyProject();
    project.textures.push({ id: "a", source: "blob:a", name: "Renamed" });
    project.modularSprites.push({
      id: "sprite-1",
      schemaVersion: 1,
      name: "Hero",
      sourceAssetId: "source",
      source: { width: 10, height: 10 },
      processorVersion: 1,
      recipe: structuredClone(requestRecipe()),
      parts: [
        {
          partKey: "stable-head",
          assetId: "a",
          name: "Head",
          role: "head",
          side: "center",
          required: true,
          order: 3,
          extractionFrame: { x: 0, y: 0, width: 1, height: 1 },
          contentBounds: { x: 0, y: 0, width: 1, height: 1 },
          componentSeeds: [{ x: 0.5, y: 0.5 }],
        },
      ],
    });

    const request = await generateModularSprite(
      {
        project,
        name: "Hero",
        existingId: "sprite-1",
        assets: [{ assetId: "a", image: pixel(), blob: new Blob(["a"]) }],
      },
      { encode: async () => new Blob(["sheet"]) },
    );

    expect(request.addToCanvas).toBe(false);
    expect(request.parts[0]?.draft).toMatchObject({
      assetId: "a",
      partKey: "stable-head",
      name: "Head",
      role: "head",
      order: 3,
    });
  });

  it("groups the synchronous commit and cleanup into one undo operation", async () => {
    const originalState = useProjectStore.getState();
    clearHistory();
    useProjectStore.setState({
      project: createEmptyProject(),
      versionControl: {
        geometryVersion: 0,
        transformVersion: 0,
        textureVersion: 0,
      },
      hasUnsavedChanges: false,
    });
    const updateProject = useProjectStore.getState().updateProject;

    try {
      await commitGeneratedPackage(
        {} as Parameters<typeof commitGeneratedPackage>[0],
        () => {
          updateProject((draft) => {
            draft.textures.push({ id: "committed", source: "blob:committed" });
          });
          return Promise.resolve({} as ModularSpriteCommitResult);
        },
        updateProject,
        (draft) => {
          draft.textures.push({ id: "cleaned", source: "blob:cleaned" });
        },
      );

      expect(undoCount()).toBe(1);
      undo((inversePatches) => {
        useProjectStore.setState(
          applyPatches(useProjectStore.getState(), inversePatches),
        );
      });
      expect(useProjectStore.getState().project.textures).toEqual([]);
    } finally {
      clearHistory();
      useProjectStore.setState(originalState);
    }
  });
});

function requestRecipe() {
  return {
    background: {
      mode: "alpha" as const,
      color: { r: 0, g: 0, b: 0 },
      tolerance: 0,
      softness: 0.1,
      despill: 0,
    },
    detection: {
      alphaThreshold: 1,
      minimumRegionAreaRatio: 0,
      openingRadius: 0,
      closingRadius: 0,
      connectivity: 8 as const,
    },
    strokes: [],
  };
}
