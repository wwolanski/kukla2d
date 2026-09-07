// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useCanvasCapture } from "@/features/canvas/application/useCanvasCapture.js";
import { composeCanvasFrameState } from "@/features/canvas/application/composeCanvasFrameState.js";
import { buildCanvasFrame } from "@/features/canvas/domain/canvasFrame.js";
import {
  captureCanvasDataUrl,
  imageDataToDataUrl,
} from "@/features/canvas/infrastructure/captureAdapter.js";
import { renderHook, act } from "../renderHook.jsx";

function makeProject() {
  return {
    version: 6,
    canvas: {
      width: 200,
      height: 100,
      x: 0,
      y: 0,
      bgEnabled: false,
      bgColor: "#fff",
    },
    textures: [],
    nodes: [
      {
        id: "warp",
        type: "warpDeformer",
        name: "Warp",
        parent: null,
        visible: true,
        opacity: 1,
        transform: {
          x: 0,
          y: 0,
          rotation: 0,
          scaleX: 1,
          scaleY: 1,
          pivotX: 0,
          pivotY: 0,
        },
        col: 1,
        row: 1,
        gridX: 0,
        gridY: 0,
        gridW: 100,
        gridH: 100,
      },
      {
        id: "part",
        type: "part",
        name: "Part",
        parent: "warp",
        draw_order: 0,
        visible: true,
        opacity: 1,
        transform: {
          x: 0,
          y: 0,
          rotation: 0,
          scaleX: 1,
          scaleY: 1,
          pivotX: 0,
          pivotY: 0,
        },
        mesh: {
          vertices: [
            { x: 0, y: 0 },
            { x: 100, y: 0 },
            { x: 100, y: 100 },
            { x: 0, y: 100 },
          ],
          uvs: [0, 0, 1, 0, 1, 1, 0, 1],
          indices: [0, 1, 2, 0, 2, 3],
        },
      },
    ],
    bones: [],
    slots: [],
    attachments: [],
    skins: [],
    constraints: [],
    defaultPose: {},
    physics_groups: [],
    physicsRules: [],
    libraryFolders: [],
    assetPlacements: [],
    animations: [
      {
        id: "anim",
        name: "Anim",
        duration: 1000,
        fps: 30,
        tracks: [
          {
            targetId: "warp",
            property: "mesh_verts",
            keyframes: [
              {
                time: 0,
                value: [
                  { x: 0, y: 0 },
                  { x: 100, y: 0 },
                  { x: 0, y: 100 },
                  { x: 100, y: 100 },
                ],
              },
              {
                time: 1000,
                value: [
                  { x: 0, y: 0 },
                  { x: 140, y: 0 },
                  { x: 0, y: 100 },
                  { x: 140, y: 100 },
                ],
              },
            ],
          },
        ],
      },
    ],
  };
}

function snapshot(value) {
  return JSON.stringify(value);
}

function makeImageData(width, height) {
  return { width, height, data: new Uint8ClampedArray(width * height * 4) };
}

function makeHarness({
  captureThrows = false,
  restoreThrows = false,
  editorMode = "animation",
} = {}) {
  const project = makeProject();
  const editor = {
    activeTool: "mesh",
    editorMode,
    view: { zoom: 1, panX: 0, panY: 0 },
  };
  const animation = {
    activeAnimationId: "anim",
    currentTime: 0,
    isPlaying: true,
    draftPose: new Map(),
  };
  const projectRef = { current: project };
  const frames = [];
  const sceneGateway = {
    drawFrame: vi.fn((frame) => frames.push(frame)),
    capture: vi.fn(({ width, height }) => makeImageData(width, height)),
    overlayLayer: { visible: true },
  };
  const captureFrame = vi.fn((options = {}) => {
    if (options.exportMode && captureThrows) throw new Error("draw failed");
    if (!options.exportMode && restoreThrows) throw new Error("restore failed");
    const baseEditor = options.editorStateOverride ?? editor;
    const frameEditor = options.viewOverride
      ? { ...baseEditor, view: options.viewOverride }
      : baseEditor;
    const frameAnimation = options.animationStateOverride ?? animation;
    const effectiveProject = projectRef.current;
    const composed = composeCanvasFrameState({
      project: effectiveProject,
      editorState: frameEditor,
      animationState: frameAnimation,
      physicsRuntime: null,
      timestamp: frameAnimation.currentTime ?? 0,
    });
    sceneGateway.drawFrame(
      buildCanvasFrame({
        project: effectiveProject,
        editor: frameEditor,
        isDark: true,
        poseOverrides: composed.poseOverrides,
        effectiveNodes: composed.effectiveNodes,
        canvasSize: { width: 200, height: 100 },
        options,
      }),
    );
  });

  return {
    project,
    projectRef,
    editor,
    animation,
    frames,
    sceneGateway,
    captureFrame,
    hook: renderHook(() =>
      useCanvasCapture({
        canvasRef: {
          current: {
            width: 200,
            height: 100,
            toDataURL: vi.fn(() => "data:image/png;base64,fallback"),
          },
        },
        projectRef,
        editorRef: { current: editor },
        animationRef: { current: animation },
        captureFrame,
        sceneGatewayRef: { current: sceneGateway },
        captureCanvasDataUrl,
        imageDataToDataUrl,
      }),
    ),
  };
}

describe("useCanvasCapture final frame sink", () => {
  let originalCreateElement;
  let originalImageData;

  beforeEach(() => {
    originalCreateElement = document.createElement.bind(document);
    originalImageData = globalThis.ImageData;
    globalThis.ImageData = class ImageData {
      constructor(data, width, height) {
        this.data = data;
        this.width = width;
        this.height = height;
      }
    };
    vi.spyOn(document, "createElement").mockImplementation(
      (tagName, options) => {
        if (String(tagName).toLowerCase() !== "canvas") {
          return originalCreateElement(tagName, options);
        }
        return {
          width: 0,
          height: 0,
          getContext: vi.fn(() => ({
            fillRect: vi.fn(),
            drawImage: vi.fn(),
            putImageData: vi.fn(),
          })),
          toDataURL: vi.fn(() => "data:image/png;base64,captured"),
        };
      },
    );
  });

  afterEach(() => {
    document.createElement.mockRestore();
    globalThis.ImageData = originalImageData;
  });

  it("sends crop view and requested animation time to the final frame sink without mutating session", () => {
    const harness = makeHarness({ editorMode: "setup" });
    const before = [
      snapshot(harness.project),
      snapshot(harness.editor),
      snapshot(harness.animation),
    ];

    let result;
    act(() => {
      result = harness.hook.result.current.captureExportFrame({
        animationId: "anim",
        timeMs: 1000,
        width: 400,
        height: 200,
        format: "png",
        quality: 1,
        background: { enabled: false, color: "#fff" },
        crop: { x: 10, y: 5, width: 100, height: 50 },
      });
    });

    expect(result.ok).toBe(true);
    expect(harness.frames).toHaveLength(2);
    expect(harness.frames[0].view).toEqual({ zoom: 4, panX: -40, panY: -20 });
    expect(harness.frames[0].poseOverrides.get("part").mesh_verts[1]).toEqual({
      x: 140,
      y: 0,
    });
    expect(harness.frames[1].view).toEqual({ zoom: 1, panX: 0, panY: 0 });
    expect(harness.sceneGateway.capture).toHaveBeenCalledWith({
      width: 400,
      height: 200,
    });
    expect(
      harness.captureFrame.mock.calls[0][0].editorStateOverride.editorMode,
    ).toBe("animation");
    expect([
      snapshot(harness.project),
      snapshot(harness.editor),
      snapshot(harness.animation),
    ]).toEqual(before);
  });

  it("captures project export area for staging thumbnail, not current viewport", () => {
    const harness = makeHarness();
    harness.projectRef.current = {
      ...harness.project,
      canvas: {
        ...harness.project.canvas,
        x: 12,
        y: 34,
        width: 800,
        height: 200,
      },
    };

    let thumbnail;
    act(() => {
      thumbnail = harness.hook.result.current.captureStaging();
    });

    expect(thumbnail).toBe("data:image/png;base64,captured");
    expect(harness.sceneGateway.capture).toHaveBeenCalledWith({
      width: 400,
      height: 100,
    });
    expect(harness.frames[0].view).toEqual({ zoom: 0.5, panX: -6, panY: -17 });
  });

  it("capture frame includes animation modifier blendShape overrides at requested time", () => {
    const harness = makeHarness();
    const projectWithModifier = {
      ...harness.project,
      animationModifiers: [
        {
          id: "mod1",
          name: "Breathing",
          presetId: "builtin.idleBreathing",
          presetVersion: 1,
          enabled: true,
          muted: false,
          order: 0,
          category: "loop",
          scope: "project",
          driver: {
            kind: "time",
            periodMs: 2000,
            phase: 0,
            curve: "easeInOutSine",
          },
          bindings: [],
          outputs: [
            {
              kind: "blendShapeValue",
              targetId: "part",
              property: "breathe",
              weight: 1,
            },
          ],
          params: { strength: 1, breathe: 1 },
        },
      ],
    };
    projectWithModifier.nodes[1].blendShapes = [
      {
        id: "breathe",
        deltas: [
          { dx: 1, dy: 0 },
          { dx: 1, dy: 0 },
          { dx: 1, dy: 0 },
          { dx: 1, dy: 0 },
        ],
      },
    ];
    projectWithModifier.nodes[1].blendShapeValues = {};
    harness.projectRef.current = projectWithModifier;

    let result;
    act(() => {
      result = harness.hook.result.current.captureExportFrame({
        animationId: "anim",
        timeMs: 1000,
        width: 400,
        height: 200,
        format: "png",
        quality: 1,
        background: { enabled: false, color: "#fff" },
      });
    });

    expect(result.ok).toBe(true);
    const capturePose = harness.frames[0].poseOverrides;
    expect(capturePose).toBeDefined();
    const partOverrides = capturePose.get("part");
    expect(partOverrides).toBeDefined();
    expect(partOverrides["blendShape:breathe"]).toBeGreaterThan(0);
  });

  it("capture and render produce same modifier overrides for same time", () => {
    const harness = makeHarness();
    const projectWithModifier = {
      ...harness.project,
      animationModifiers: [
        {
          id: "mod1",
          name: "Breathing",
          presetId: "builtin.idleBreathing",
          presetVersion: 1,
          enabled: true,
          muted: false,
          order: 0,
          category: "loop",
          scope: "project",
          driver: { kind: "time", periodMs: 2000, phase: 0, curve: "sine" },
          bindings: [],
          outputs: [
            {
              kind: "blendShapeValue",
              targetId: "part",
              property: "breathe",
              weight: 1,
            },
          ],
          params: { strength: 1, breathe: 1 },
        },
      ],
    };
    projectWithModifier.nodes[1].blendShapes = [
      {
        id: "breathe",
        deltas: [
          { dx: 1, dy: 0 },
          { dx: 1, dy: 0 },
          { dx: 1, dy: 0 },
          { dx: 1, dy: 0 },
        ],
      },
    ];
    projectWithModifier.nodes[1].blendShapeValues = {};
    harness.projectRef.current = projectWithModifier;

    const renderComposed = composeCanvasFrameState({
      project: projectWithModifier,
      editorState: harness.editor,
      animationState: {
        activeAnimationId: "anim",
        currentTime: 500,
        draftPose: new Map(),
      },
      physicsRuntime: null,
      timestamp: 0,
    });
    const renderValue =
      renderComposed.poseOverrides.get("part")["blendShape:breathe"];

    let result;
    act(() => {
      result = harness.hook.result.current.captureExportFrame({
        animationId: "anim",
        timeMs: 500,
        width: 400,
        height: 200,
        format: "png",
        quality: 1,
        background: { enabled: false, color: "#fff" },
      });
    });

    expect(result.ok).toBe(true);
    const captureValue =
      harness.frames[0].poseOverrides.get("part")["blendShape:breathe"];
    expect(captureValue).toBe(renderValue);
  });

  it("returns K6 error for capture throw and still restores live frame and overlay visibility", () => {
    const harness = makeHarness({ captureThrows: true, restoreThrows: true });
    const overlayLayer = harness.sceneGateway.overlayLayer;
    const visibilityLog = [];
    Object.defineProperty(overlayLayer, "visible", {
      get() {
        return this._v;
      },
      set(v) {
        this._v = v;
        visibilityLog.push(v);
      },
      configurable: true,
    });
    overlayLayer._v = true;

    let result;
    act(() => {
      result = harness.hook.result.current.captureExportFrame({
        animationId: "anim",
        timeMs: 1000,
        width: 400,
        height: 200,
        format: "png",
        quality: 1,
        background: { enabled: false, color: "#fff" },
      });
    });

    expect(result).toEqual({
      ok: false,
      error: { code: "CAPTURE_FAILED", message: "draw failed" },
    });
    expect(harness.captureFrame).toHaveBeenLastCalledWith({
      skipResize: false,
    });
    expect(visibilityLog[0]).toBe(false);
    expect(overlayLayer.visible).toBe(true);
  });

  it("hides overlay regardless of Export Area visibility — guard is not conditional", () => {
    const harness = makeHarness();
    const overlayLayer = harness.sceneGateway.overlayLayer;
    const visibilityLog = [];
    Object.defineProperty(overlayLayer, "visible", {
      get() {
        return this._v;
      },
      set(v) {
        this._v = v;
        visibilityLog.push(v);
      },
      configurable: true,
    });
    overlayLayer._v = true;

    let result;
    act(() => {
      result = harness.hook.result.current.captureExportFrame({
        animationId: "anim",
        timeMs: 500,
        width: 400,
        height: 200,
        format: "png",
        quality: 1,
        background: { enabled: false, color: "#fff" },
      });
    });

    expect(result.ok).toBe(true);
    expect(visibilityLog[0]).toBe(false);
    expect(overlayLayer.visible).toBe(true);
  });

  it("hides overlay layer during capture and restores it afterwards", () => {
    const harness = makeHarness();
    const overlayLayer = harness.sceneGateway.overlayLayer;
    const visibilityLog = [];
    Object.defineProperty(overlayLayer, "visible", {
      get() {
        return this._v;
      },
      set(v) {
        this._v = v;
        visibilityLog.push(v);
      },
      configurable: true,
    });
    overlayLayer._v = true;

    let result;
    act(() => {
      result = harness.hook.result.current.captureExportFrame({
        animationId: "anim",
        timeMs: 1000,
        width: 400,
        height: 200,
        format: "png",
        quality: 1,
        background: { enabled: false, color: "#fff" },
        crop: { x: 0, y: 0, width: 200, height: 100 },
      });
    });

    expect(result.ok).toBe(true);
    expect(visibilityLog[0]).toBe(false);
    expect(visibilityLog[visibilityLog.length - 1]).toBe(true);
    expect(overlayLayer.visible).toBe(true);
  });
});
