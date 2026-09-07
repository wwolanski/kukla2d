// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "../renderHook.jsx";

const rendererMocks = vi.hoisted(() => ({ createCanvasRenderer: vi.fn() }));

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

function props() {
  return {
    canvasRef: { current: document.createElement("canvas") },
    projectRef: { current: { nodes: [], meshes: [], animations: [] } },
    editorRef: { current: { view: {}, interaction: null } },
    animationRef: { current: {} },
    isDarkRef: { current: true },
    setView: vi.fn(),
    setSelection: vi.fn(),
    updateProject: vi.fn(),
    imageDataByPartId: new Map(),
    workflowActorRef: { current: null },
    createRenderer: rendererMocks.createCanvasRenderer,
  };
}

function gateway(overrides = {}) {
  return { createInteractionSystem: vi.fn(), dispose: vi.fn(), ...overrides };
}

describe("useCanvasScene lifecycle ownership", () => {
  let rafCallbacks;

  beforeEach(() => {
    rendererMocks.createCanvasRenderer.mockReset();
    rafCallbacks = [];
    vi.stubGlobal(
      "requestAnimationFrame",
      vi.fn((callback) => {
        rafCallbacks.push(callback);
        return rafCallbacks.length;
      }),
    );
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
  });

  afterEach(() => vi.unstubAllGlobals());

  it("attaches synchronous and asynchronous ready gateways exactly once", async () => {
    const syncGateway = gateway();
    let resolveReady;
    const asyncGateway = gateway({
      ready: new Promise((resolve) => {
        resolveReady = resolve;
      }),
    });
    rendererMocks.createCanvasRenderer
      .mockReturnValueOnce(syncGateway)
      .mockReturnValueOnce(asyncGateway);

    const sceneProps = props();
    const sync = renderHook(() => useCanvasScene(sceneProps));
    expect(syncGateway.createInteractionSystem).toHaveBeenCalledOnce();
    act(() => sync.result.current.retryCanvas());
    await act(async () => {
      resolveReady();
      await asyncGateway.ready;
    });
    expect(asyncGateway.createInteractionSystem).toHaveBeenCalledOnce();
    sync.unmount();
  });

  it("does not attach a stale ready gateway after generation changes or unmount", async () => {
    let resolveReady;
    const stale = gateway({
      ready: new Promise((resolve) => {
        resolveReady = resolve;
      }),
    });
    const replacement = gateway();
    rendererMocks.createCanvasRenderer
      .mockReturnValueOnce(stale)
      .mockReturnValueOnce(replacement);

    const sceneProps = props();
    const mounted = renderHook(() => useCanvasScene(sceneProps));
    act(() => mounted.result.current.retryCanvas());
    await act(async () => {
      resolveReady();
      await stale.ready;
    });
    expect(stale.createInteractionSystem).not.toHaveBeenCalled();
    expect(replacement.createInteractionSystem).toHaveBeenCalledOnce();
    mounted.unmount();
  });

  it("maps readiness rejection, starts one replacement RAF chain, and tears down once", async () => {
    let rejectReady;
    const failed = gateway({
      ready: new Promise((_, reject) => {
        rejectReady = reject;
      }),
    });
    const replacement = gateway();
    rendererMocks.createCanvasRenderer
      .mockReturnValueOnce(failed)
      .mockReturnValueOnce(replacement);
    const sceneProps = props();
    const mounted = renderHook(() => useCanvasScene(sceneProps));

    await act(async () => {
      rejectReady(new Error("failed"));
      await failed.ready.catch(() => {});
    });
    expect(mounted.result.current.canvasFailure.code).toBe(
      CANVAS_FAILURE_CODES.INIT_FAILED,
    );
    expect(failed.dispose).toHaveBeenCalledOnce();
    expect(rafCallbacks).toHaveLength(1);
    act(() => mounted.result.current.retryCanvas());
    expect(rafCallbacks).toHaveLength(2);
    mounted.unmount();
    expect(replacement.dispose).toHaveBeenCalledOnce();
    expect(cancelAnimationFrame).toHaveBeenCalled();
  });
});
