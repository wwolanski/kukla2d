// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";

import { createEmptyProject } from "@/core/createEmptyProject";
import { useModularSpriteImport } from "@/features/canvas/application/useModularSpriteImport.js";
import { renderHook } from "../renderHook.jsx";

const image = {
  width: 1,
  height: 1,
  data: new Uint8ClampedArray([255, 255, 255, 255]),
};

function makeRequest(name: string) {
  return {
    name,
    sourceFileName: "hero.png",
    sourceImage: image,
    sourceBlob: new Blob(["source"], { type: "image/png" }),
    recipe: {} as never,
    parts: [
      {
        draft: {
          partKey: "head",
          name: "Head",
          role: "head",
          side: "center" as const,
          required: true,
          order: 0,
          extractionFrame: { x: 0, y: 0, width: 1, height: 1 },
          contentBounds: { x: 0, y: 0, width: 1, height: 1 },
        },
        image,
        blob: new Blob(["part"], { type: "image/png" }),
        contentBounds: { x: 0, y: 0, width: 1, height: 1 },
        componentSeeds: [{ x: 0.5, y: 0.5 }],
      },
    ],
    addToCanvas: false,
  };
}

describe("useModularSpriteImport", () => {
  it("rejects a package import when the folder name is already used case-insensitively", () => {
    const project = createEmptyProject();
    project.libraryFolders.push({
      id: "existing-folder",
      name: "Hero",
      parentId: null,
      origin: "user",
    });
    const updateProject = vi.fn();
    const { result } = renderHook(() =>
      useModularSpriteImport({
        projectRef: { current: project },
        updateProject,
        centerView: vi.fn(),
        sceneGatewayRef: { current: null },
        textureCache: { __internal: { imageDataByPartId: new Map() } } as never,
        markDirty: vi.fn(),
        resourceOwnerRef: { current: { track: vi.fn() } } as never,
      }),
    );

    expect(() => result.current(makeRequest("hero"))).toThrow(
      'A library folder named "Hero" already exists',
    );
    expect(updateProject).not.toHaveBeenCalled();
  });
});
