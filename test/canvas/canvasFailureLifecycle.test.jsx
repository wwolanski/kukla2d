// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "../renderHook.jsx";

const rendererMocks = vi.hoisted(() => ({
  createCanvasRenderer: vi.fn(),
}));

vi.mock(
  "@/features/canvas/infrastructure/rendering/createCanvasRenderer.js",
  () => ({
    createCanvasRenderer: rendererMocks.createCanvasRenderer,
  }),
);

vi.mock("@/features/canvas/application/useCanvasFrameSubscriptions.js", () => ({
  useCanvasFrameSubscriptions: vi.fn(),
}));

const { useCanvasScene } =
  await import("@/features/canvas/application/useCanvasScene.js");
const { CANVAS_FAILURE_CODES } =
  await import("@/features/canvas/domain/canvasFailureCodes.js");

function hookProps() {
  return {
    canvasRef: { current: document.createElement("canvas") },
    projectRef: { current: { nodes: [], meshes: [], animations: [] } },
    editorRef: { current: { view: {}, interaction: null } },
    animationRef: { current: {} },
    parameterRef: { current: { values: {} } },
    isDarkRef: { current: true },
    setView: vi.fn(),
    setSelection: vi.fn(),
    updateProject: vi.fn(),
    imageDataByPartId: new Map(),
    workflowActorRef: { current: null },
    createRenderer: rendererMocks.createCanvasRenderer,
  };
}

function readyGateway(overrides = {}) {
  return {
    createInteractionSystem: vi.fn(),
    dispose: vi.fn(),
    ...overrides,
  };
}

describe("useCanvasScene failure lifecycle", () => {
  beforeEach(() => {
    rendererMocks.createCanvasRenderer.mockReset();
    vi.stubGlobal(
      "requestAnimationFrame",
      vi.fn(() => 1),
    );
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
  });

  it("shows a synchronous init failure and retry creates one fresh gateway", () => {
    const gateway = readyGateway();
    rendererMocks.createCanvasRenderer
      .mockImplementationOnce(() => {
        throw new Error("unavailable");
      })
      .mockReturnValueOnce(gateway);

    const props = hookProps();
    const { result, unmount } = renderHook(() => useCanvasScene(props));
    expect(result.current.canvasFailure.code).toBe(
      CANVAS_FAILURE_CODES.INIT_UNAVAILABLE,
    );

    act(() => result.current.retryCanvas());

    expect(rendererMocks.createCanvasRenderer).toHaveBeenCalledTimes(2);
    expect(result.current.canvasFailure).toBeNull();
    expect(result.current.sceneGatewayRef.current).toBe(gateway);
    expect(gateway.createInteractionSystem).toHaveBeenCalledOnce();
    unmount();
    expect(gateway.dispose).toHaveBeenCalledOnce();
  });

  it("disposes a rejected async gateway before retry attaches a replacement", async () => {
    let rejectReady;
    const failedGateway = readyGateway({
      ready: new Promise((_, reject) => {
        rejectReady = reject;
      }),
    });
    const replacement = readyGateway();
    rendererMocks.createCanvasRenderer
      .mockReturnValueOnce(failedGateway)
      .mockReturnValueOnce(replacement);

    const props = hookProps();
    const { result, unmount } = renderHook(() => useCanvasScene(props));
    await act(async () => {
      rejectReady(new Error("webgl failed"));
      await failedGateway.ready.catch(() => {});
    });

    expect(result.current.canvasFailure.code).toBe(
      CANVAS_FAILURE_CODES.INIT_FAILED,
    );
    expect(failedGateway.dispose).toHaveBeenCalledOnce();

    act(() => result.current.retryCanvas());
    expect(result.current.sceneGatewayRef.current).toBe(replacement);
    expect(replacement.createInteractionSystem).toHaveBeenCalledOnce();
    unmount();
  });
});
