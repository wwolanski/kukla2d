// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react";
import { EditorWorkflowContext } from "@/features/canvas/application/EditorWorkflowContext.js";

vi.mock("@/io/psd.js", () => ({
  importPsd: vi.fn(async () => ({ width: 100, height: 100, layers: [] })),
}));

vi.mock("@/io/projectFile", () => ({
  saveProject: vi.fn(() => ({ blob: new Blob(), fileName: "a.kk2d" })),
  loadProject: vi.fn(async () => ({ project: {} })),
}));

vi.mock("@/app/providers/theme/useTheme.js", () => ({
  useTheme: () => ({
    theme: "dark",
    setTheme: () => {},
    resolvedTheme: "dark",
  }),
}));

vi.mock(
  "@/features/canvas/infrastructure/rendering/pixi/createPixiSceneGateway.js",
  () => ({
    createPixiSceneGateway: vi.fn(() => ({
      ready: Promise.resolve(),
      draw: vi.fn(),
      drawFrame: vi.fn(),
      render: vi.fn(),
      uploadTexture: vi.fn(),
      uploadMesh: vi.fn(),
      uploadQuadFallback: vi.fn(),
      uploadPositions: vi.fn(),
      createInteractionSystem: vi.fn(),
      hasTexture: vi.fn(() => false),
      hasMesh: vi.fn(() => false),
      capture: vi.fn(() => null),
      resize: vi.fn(),
      dispose: vi.fn(),
    })),
  }),
);

function withProvider(element) {
  return React.createElement(EditorWorkflowContext.Provider, null, element);
}

describe("useCanvasScene renderer selector", () => {
  let root;

  afterEach(() => {
    if (root) {
      act(() => root.unmount());
      root = null;
    }
    document.body.innerHTML = "";
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it("uses pixi backend by default", async () => {
    const { CanvasViewport } = await import("@/features/canvas");
    const container = document.createElement("div");
    document.body.appendChild(container);

    const refs = {
      remeshRef: { current: null },
      deleteMeshRef: { current: null },
      saveRef: { current: null },
      loadRef: { current: null },
      resetRef: { current: null },
      exportCaptureRef: { current: null },
      thumbCaptureRef: { current: null },
    };

    await act(async () => {
      root = createRoot(container);
      root.render(withProvider(React.createElement(CanvasViewport, refs)));
    });

    const canvas = container.querySelector("canvas");
    expect(canvas).toBeTruthy();

    const { createPixiSceneGateway } =
      await import("@/features/canvas/infrastructure/rendering/pixi/createPixiSceneGateway.js");
    await act(async () => {
      await Promise.resolve();
    });
    const gateway = createPixiSceneGateway.mock.results.at(-1).value;
    expect(gateway.createInteractionSystem).toHaveBeenCalled();
  });

  it("readCanvasRendererFromEnv always returns pixi", async () => {
    const mod =
      await import("@/features/canvas/config/canvasRendererConfig.js");
    expect(mod.readCanvasRendererFromEnv()).toBe("pixi");
  });

  it("canvasRendererConfig exports correct constant", async () => {
    const mod =
      await import("@/features/canvas/config/canvasRendererConfig.js");
    expect(mod.CANVAS_RENDERER_PIXI).toBe("pixi");
  });
});
