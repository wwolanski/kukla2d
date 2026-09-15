// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ProjectDocument } from "@kukla2d/contracts";

import { createEmptyProject } from "@/core/createEmptyProject";
import { useModularSpriteImport } from "@/features/canvas/application/useModularSpriteImport.js";
import type { ModularSpriteCommitRequest } from "@/features/modular-sprite";
import { useProjectStore } from "@/store/projectStore";
import { clearHistory } from "@/store/undoHistory";

import { act, renderHook } from "./renderHook.jsx";

const image = (width = 1, height = 1) => ({
  width,
  height,
  data: new Uint8ClampedArray(width * height * 4).fill(255),
});

function part(assetId: string, partKey = assetId) {
  return {
    partKey,
    assetId,
    name: partKey,
    role: partKey,
    side: "center" as const,
    required: true,
    order: 0,
    extractionFrame: { x: 0, y: 0, width: 1, height: 1 },
    contentBounds: { x: 0, y: 0, width: 1, height: 1 },
    componentSeeds: [{ x: 0.5, y: 0.5 }],
  };
}

function request(
  parts: string[],
  options: Pick<
    ModularSpriteCommitRequest,
    "includeAssetId" | "force" | "removeFromLibrary"
  > = {},
): ModularSpriteCommitRequest {
  return {
    existingId: "target",
    name: "Hero",
    sourceFileName: "hero.png",
    sourceImage: image(),
    sourceBlob: new Blob(["source"], { type: "image/png" }),
    recipe: {} as never,
    parts: parts.map((assetId) => {
      const draft = part(assetId);
      return {
        draft,
        image: image(),
        blob: new Blob([assetId], { type: "image/png" }),
        contentBounds: draft.contentBounds,
        componentSeeds: draft.componentSeeds,
      };
    }),
    addToCanvas: false,
    ...options,
  };
}

function packageDocument(
  id: string,
  name: string,
  sourceAssetId: string,
  parts: string[],
) {
  return {
    id,
    schemaVersion: 1 as const,
    name,
    sourceAssetId,
    source: { width: 1, height: 1 },
    processorVersion: 1 as const,
    recipe: {} as never,
    parts: parts.map((assetId) => part(assetId)),
  };
}

function partNode(id: string, textureId: string) {
  return {
    id,
    type: "part" as const,
    name: textureId,
    parent: null,
    textureId,
    draw_order: 0,
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
  };
}

function baseProject(): ProjectDocument {
  const project = createEmptyProject();
  project.textures.push(
    { id: "target-source", source: "blob:target-source", name: "Hero Source" },
    { id: "head", source: "blob:head", name: "head" },
    { id: "body", source: "blob:body", name: "body" },
  );
  project.libraryFolders.push({
    id: "target-folder",
    name: "Hero",
    parentId: null,
    origin: "import",
  });
  project.assetPlacements.push(
    { assetId: "target-source", folderId: "target-folder" },
    { assetId: "head", folderId: "target-folder" },
    { assetId: "body", folderId: "target-folder" },
  );
  project.nodes.push(partNode("head-node", "head"));
  project.nodes.push(partNode("body-node", "body"));
  project.modularSprites.push(
    packageDocument("target", "Hero", "target-source", ["head", "body"]),
  );
  return project;
}

function useImporter(project: ProjectDocument) {
  useProjectStore.setState({
    project,
    versionControl: {
      geometryVersion: 0,
      transformVersion: 0,
      textureVersion: 0,
    },
    hasUnsavedChanges: false,
  });
  return renderHook(() =>
    useModularSpriteImport({
      projectRef: { current: project },
      updateProject: useProjectStore.getState().updateProject,
      centerView: vi.fn(),
      sceneGatewayRef: { current: null },
      textureCache: { __internal: { imageDataByPartId: new Map() } } as never,
      markDirty: vi.fn(),
      resourceOwnerRef: { current: { track: vi.fn() } } as never,
    }),
  );
}

let originalStoreState: ReturnType<typeof useProjectStore.getState>;

beforeEach(() => {
  originalStoreState = useProjectStore.getState();
  vi.stubGlobal(
    "ImageData",
    class FakeImageData {
      data: Uint8ClampedArray;
      width: number;
      height: number;

      constructor(data: Uint8ClampedArray, width: number, height: number) {
        this.data = data;
        this.width = width;
        this.height = height;
      }
    },
  );
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
    putImageData: vi.fn(),
  } as never);
  vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:generated");
});

afterEach(() => {
  clearHistory();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  useProjectStore.setState(originalStoreState);
});

describe("modular sprite package actions", () => {
  it("removes a part from the document but keeps its node and moves it to Library root", async () => {
    const project = baseProject();
    const hook = useImporter(project);

    await act(async () => {
      await hook.result.current(request(["body"], { removeFromLibrary: false }));
    });

    const nextProject = useProjectStore.getState().project;
    expect(nextProject.modularSprites[0]?.parts.map((item) => item.assetId)).toEqual([
      "body",
    ]);
    expect(nextProject.textures.some((texture) => texture.id === "head")).toBe(
      true,
    );
    expect(nextProject.nodes.some((node) => node.id === "head-node")).toBe(true);
    expect(
      nextProject.assetPlacements.find((placement) => placement.assetId === "head")
        ?.folderId,
    ).toBeNull();
  });

  it("keeps the legacy durable deletion when removeFromLibrary is true", async () => {
    const project = baseProject();
    const hook = useImporter(project);

    await act(async () => {
      await hook.result.current(request(["body"], { removeFromLibrary: true }));
    });

    const nextProject = useProjectStore.getState().project;
    expect(nextProject.modularSprites[0]?.parts.map((item) => item.assetId)).toEqual([
      "body",
    ]);
    expect(nextProject.textures.some((texture) => texture.id === "head")).toBe(
      false,
    );
    expect(nextProject.nodes.some((node) => node.id === "head-node")).toBe(false);
    expect(
      nextProject.assetPlacements.some((placement) => placement.assetId === "head"),
    ).toBe(false);
  });

  it("uses force only to bypass the stable extraction-frame rejection", async () => {
    const project = baseProject();
    const hook = useImporter(project);
    const changedSizeRequest = request(["head"]);
    changedSizeRequest.parts[0]!.image = image(2, 2);

    expect(() => hook.result.current(changedSizeRequest)).toThrow(
      "changed its stable extraction frame",
    );

    await act(async () => {
      await hook.result.current({ ...changedSizeRequest, force: true });
    });

    expect(useProjectStore.getState().project.modularSprites[0]?.parts).toHaveLength(
      1,
    );
  });

  it("moves an included part out of its old package while preserving its source", async () => {
    const project = baseProject();
    project.textures.push({
      id: "old-source",
      source: "blob:old-source",
      name: "Old Source",
    });
    project.libraryFolders.push({
      id: "old-folder",
      name: "Old Hero",
      parentId: null,
      origin: "import",
    });
    project.assetPlacements.push(
      { assetId: "old-source", folderId: "old-folder" },
      { assetId: "old-part", folderId: "old-folder" },
    );
    project.textures.push({ id: "old-part", source: "blob:old-part", name: "old-part" });
    project.nodes.push(partNode("old-part-node", "old-part"));
    project.modularSprites.push(
      packageDocument("old", "Old Hero", "old-source", ["old-part"]),
    );

    const hook = useImporter(project);
    await act(async () => {
      await hook.result.current(
        request(["body", "old-part"], { includeAssetId: "old-part" }),
      );
    });

    const nextProject = useProjectStore.getState().project;
    const oldPackage = nextProject.modularSprites.find((item) => item.id === "old");
    const targetPackage = nextProject.modularSprites.find(
      (item) => item.id === "target",
    );
    expect(oldPackage?.parts).toEqual([]);
    expect(targetPackage?.parts.map((item) => item.assetId)).toEqual([
      "body",
      "old-part",
    ]);
    expect(nextProject.textures.some((texture) => texture.id === "old-source")).toBe(
      true,
    );
    expect(nextProject.textures.some((texture) => texture.id === "old-part")).toBe(
      true,
    );
    expect(
      nextProject.assetPlacements.find((placement) => placement.assetId === "old-source")
        ?.folderId,
    ).toBe("old-folder");
    expect(
      nextProject.assetPlacements.find((placement) => placement.assetId === "old-part")
        ?.folderId,
    ).toBe("target-folder");
  });
});
