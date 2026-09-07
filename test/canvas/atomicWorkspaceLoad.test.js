// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, act } from "../renderHook.jsx";
import { useCanvasImport } from "@/features/canvas/application/useCanvasImport.js";
import { commitWorkspaceLoad } from "@/features/canvas/application/workspaceLoadTransaction";
import { prepareLoadedProjectState } from "@/store/project/projectStoreShared.js";
import { useProjectStore } from "@/store/projectStore";

const projectFileMock = vi.hoisted(() => ({
  loadProject: vi.fn(),
}));

vi.mock("@/io/projectFile", () => projectFileMock);

function makeProject(partIds = ["part-new"]) {
  return {
    version: 6,
    canvas: { width: 320, height: 240 },
    textures: partIds.map((id) => ({
      id,
      source: `blob:${id}`,
      fileName: `${id}.png`,
      fileSize: 4,
    })),
    nodes: partIds.map((id, index) => ({
      id,
      type: "part",
      name: id,
      parent: null,
      draw_order: index,
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
      imageWidth: 2,
      imageHeight: 2,
    })),
    animations: [],
  };
}

function makeImage(width = 2, height = 2) {
  return { width, height };
}

function makeImageData(width = 2, height = 2) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 3; i < data.length; i += 4) data[i] = 255;
  return { width, height, data };
}

function makeOwner(label) {
  return { label, dispose: vi.fn(), track: vi.fn() };
}

function makeGateway({ failOnUpload = null } = {}) {
  const oldRegistry = { label: "old-registry", disposeAll: vi.fn() };
  const newRegistry = { label: "new-registry", disposeAll: vi.fn() };
  const staged = {
    resources: newRegistry,
    uploadTexture: vi.fn((partId) => {
      if (failOnUpload === `texture:${partId}`)
        throw new Error(`upload ${partId}`);
    }),
    uploadMesh: vi.fn(),
    uploadQuadFallback: vi.fn((partId) => {
      if (failOnUpload === `quad:${partId}`) throw new Error(`quad ${partId}`);
    }),
    commit: vi.fn(() => {
      gateway.resources = newRegistry;
      gateway._frameRenderer.resources = newRegistry;
      return oldRegistry;
    }),
    dispose: vi.fn(),
  };
  const gateway = {
    resources: oldRegistry,
    _frameRenderer: { resources: oldRegistry },
    createStagedResources: vi.fn(() => staged),
    swapResources: vi.fn((resources) => {
      const previous = gateway.resources;
      gateway.resources = resources;
      gateway._frameRenderer.resources = resources;
      return previous;
    }),
  };
  return { gateway, oldRegistry, newRegistry, staged };
}

function mountImport({
  gateway,
  imageDataByPartId,
  ownerRef,
  markDirty = vi.fn(),
  centerView = vi.fn(),
}) {
  return {
    markDirty,
    centerView,
    hook: renderHook(() =>
      useCanvasImport({
        projectRef: { current: useProjectStore.getState().project },
        updateProject: useProjectStore.getState().updateProject,
        resetProject: useProjectStore.getState().resetProject,
        centerView,
        sceneGatewayRef: { current: gateway },
        textureCache: { __internal: { imageDataByPartId } },
        markDirty,
        setConfirmWipeOpen: vi.fn(),
        pendingFile: null,
        setPendingFile: vi.fn(),
        animRef: { current: { resetPlayback: vi.fn() } },
        sendWorkflowEvent: vi.fn(),
        resourceOwnerRef: ownerRef,
      }),
    ),
  };
}

describe("atomic workspace load", () => {
  let originalCreateElement;

  beforeEach(() => {
    useProjectStore.getState().loadProject(makeProject(["part-old"]));
    projectFileMock.loadProject.mockReset();
    originalCreateElement = document.createElement.bind(document);
    vi.spyOn(document, "createElement").mockImplementation(
      (tagName, options) => {
        if (String(tagName).toLowerCase() !== "canvas") {
          return originalCreateElement(tagName, options);
        }
        return {
          width: 0,
          height: 0,
          getContext: vi.fn(() => ({
            drawImage: vi.fn(),
            getImageData: vi.fn((x, y, width, height) =>
              makeImageData(width, height),
            ),
          })),
        };
      },
    );
  });

  afterEach(() => {
    document.createElement.mockRestore();
    useProjectStore.getState().resetProject();
  });

  it("prepareLoadedProjectState normalizes without mutating projectData", () => {
    const input = {
      version: 6,
      canvas: {},
      nodes: [{ id: "warp", type: "warpDeformer" }],
      textures: [],
      animations: [],
    };

    const prepared = prepareLoadedProjectState(input);

    expect(input.nodes[0].blendShapes).toBeUndefined();
    expect(prepared.project.nodes[0].blendShapes).toEqual([]);
    expect(prepared.project.nodes[0].col).toBe(2);
    expect(prepared.project.canvas.width).toBe(800);
  });

  it("does not mutate active workspace when staged GPU upload throws", async () => {
    const oldProject = useProjectStore.getState().project;
    const oldVersion = useProjectStore.getState().versionControl.textureVersion;
    const oldOwner = makeOwner("old");
    const loadedOwner = makeOwner("loaded");
    const imageDataByPartId = new Map([["part-old", makeImageData()]]);
    const { gateway, oldRegistry, staged } = makeGateway({
      failOnUpload: "quad:part-2",
    });
    const ownerRef = { current: oldOwner };
    projectFileMock.loadProject.mockResolvedValue({
      project: makeProject(["part-1", "part-2"]),
      images: new Map([
        ["part-1", makeImage()],
        ["part-2", makeImage()],
      ]),
      resources: loadedOwner,
    });
    const { hook, markDirty, centerView } = mountImport({
      gateway,
      imageDataByPartId,
      ownerRef,
    });

    let result;
    await act(async () => {
      result = await hook.result.current.handleLoadProject(
        new File(["x"], "badkk2d"),
      );
    });

    expect(result.success).toBe(false);
    expect(useProjectStore.getState().project).toBe(oldProject);
    expect(useProjectStore.getState().versionControl.textureVersion).toBe(
      oldVersion,
    );
    expect(imageDataByPartId.has("part-old")).toBe(true);
    expect(imageDataByPartId.has("part-1")).toBe(false);
    expect(gateway.resources).toBe(oldRegistry);
    expect(ownerRef.current).toBe(oldOwner);
    expect(oldOwner.dispose).not.toHaveBeenCalled();
    expect(loadedOwner.dispose).toHaveBeenCalledOnce();
    expect(staged.dispose).toHaveBeenCalledOnce();
    expect(markDirty).not.toHaveBeenCalled();
    expect(centerView).not.toHaveBeenCalled();
  });

  it("commits store, registry, image data and owner as one workspace swap", async () => {
    const oldOwner = makeOwner("old");
    const loadedOwner = makeOwner("loaded");
    const imageDataByPartId = new Map([["part-old", makeImageData()]]);
    const { gateway, oldRegistry, newRegistry, staged } = makeGateway();
    const ownerRef = { current: oldOwner };
    projectFileMock.loadProject.mockResolvedValue({
      project: makeProject(["part-new"]),
      images: new Map([["part-new", makeImage()]]),
      resources: loadedOwner,
    });
    const { hook, markDirty, centerView } = mountImport({
      gateway,
      imageDataByPartId,
      ownerRef,
    });

    let result;
    await act(async () => {
      result = await hook.result.current.handleLoadProject(
        new File(["x"], "okkk2d"),
      );
    });

    expect(result).toEqual({ success: true });
    expect(
      useProjectStore.getState().project.nodes.map((node) => node.id),
    ).toEqual(["part-new"]);
    expect(imageDataByPartId.has("part-old")).toBe(false);
    expect(imageDataByPartId.has("part-new")).toBe(true);
    expect(gateway.resources).toBe(newRegistry);
    expect(gateway._frameRenderer.resources).toBe(newRegistry);
    expect(oldRegistry.disposeAll).toHaveBeenCalledOnce();
    expect(staged.dispose).not.toHaveBeenCalled();
    expect(ownerRef.current).toBe(loadedOwner);
    expect(oldOwner.dispose).toHaveBeenCalledOnce();
    expect(loadedOwner.dispose).not.toHaveBeenCalled();
    expect(markDirty).toHaveBeenCalledOnce();
    expect(centerView).toHaveBeenCalledWith(320, 240);
  });

  it("materializes one shared texture for every imported sprite node", async () => {
    const oldOwner = makeOwner("old");
    const loadedOwner = makeOwner("loaded");
    const imageDataByPartId = new Map();
    const { gateway, staged } = makeGateway();
    const ownerRef = { current: oldOwner };
    const project = makeProject(["sprite-a", "sprite-b"]);
    project.textures = [
      {
        id: "shared-asset",
        source: "blob:shared",
        fileName: "shared.png",
        fileSize: 4,
      },
    ];
    project.nodes.forEach((node) => {
      node.textureId = "shared-asset";
    });
    const sharedImage = makeImage();
    projectFileMock.loadProject.mockResolvedValue({
      project,
      images: new Map([["shared-asset", sharedImage]]),
      resources: loadedOwner,
    });
    const { hook } = mountImport({ gateway, imageDataByPartId, ownerRef });

    let result;
    await act(async () => {
      result = await hook.result.current.handleLoadProject(
        new File(["x"], "shared.kk2d"),
      );
    });

    expect(result).toEqual({ success: true });
    expect(staged.uploadTexture).toHaveBeenCalledWith("sprite-a", sharedImage);
    expect(staged.uploadTexture).toHaveBeenCalledWith("sprite-b", sharedImage);
    expect(imageDataByPartId.has("sprite-a")).toBe(true);
    expect(imageDataByPartId.has("sprite-b")).toBe(true);
  });

  it("restores renderer registry when project commit fails after renderer commit", () => {
    const oldOwner = makeOwner("old");
    const loadedOwner = makeOwner("loaded");
    const imageDataByPartId = new Map([["part-old", makeImageData()]]);
    const { gateway, oldRegistry, newRegistry, staged } = makeGateway();
    const ownerRef = { current: oldOwner };

    expect(() =>
      commitWorkspaceLoad({
        stagedLoad: {
          project: makeProject(["part-new"]),
          stagedImageData: new Map([["part-new", makeImageData()]]),
          stagedResources: staged,
        },
        commitPort: {
          commitProject: () => {
            throw new Error("store commit failed");
          },
        },
        sceneGateway: gateway,
        imageDataMap: imageDataByPartId,
        resourceOwnerRef: ownerRef,
        resources: loadedOwner,
      }),
    ).toThrow("store commit failed");

    expect(gateway.resources).toBe(oldRegistry);
    expect(gateway.swapResources).toHaveBeenCalledWith(oldRegistry);
    expect(newRegistry.disposeAll).toHaveBeenCalledOnce();
    expect(imageDataByPartId.has("part-old")).toBe(true);
    expect(ownerRef.current).toBe(oldOwner);
  });
});
