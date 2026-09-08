// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

function createMockGraphics() {
  const g = {
    clear: vi.fn(),
    stroke: vi.fn(() => g),
    fill: vi.fn(() => g),
    moveTo: vi.fn(() => g),
    lineTo: vi.fn(() => g),
    closePath: vi.fn(() => g),
    circle: vi.fn(() => g),
    rect: vi.fn(() => g),
    parent: null,
    destroy: vi.fn(),
  };
  return g;
}

function createMockContainer() {
  const c = {
    children: [],
    addChild: vi.fn(function (child) {
      this.children.push(child);
      child.parent = this;
    }),
    removeChild: vi.fn(function (child) {
      this.children = this.children.filter((x) => x !== child);
      child.parent = null;
    }),
    destroy: vi.fn(),
  };
  return c;
}

function createMockText() {
  const t = {
    text: "",
    position: { set: vi.fn() },
    scale: { set: vi.fn() },
    visible: true,
    eventMode: null,
    parent: null,
    destroy: vi.fn(),
  };
  return t;
}

describe("PixiOverlayRenderer", () => {
  let PixiOverlayRenderer;

  beforeEach(async () => {
    vi.resetModules();
    vi.doMock("pixi.js", () => ({
      Graphics: createMockGraphics,
      Container: createMockContainer,
      Text: createMockText,
      TextStyle: function () {},
    }));

    const mod =
      await import("@/features/canvas/infrastructure/rendering/pixi/PixiOverlayRenderer.js");
    PixiOverlayRenderer = mod.PixiOverlayRenderer;
  });

  afterEach(() => {
    vi.doUnmock("pixi.js");
    vi.resetModules();
  });

  function createRenderer() {
    const overlayLayer = createMockContainer();
    const renderer = new PixiOverlayRenderer({ overlayLayer });
    return { renderer, overlayLayer };
  }

  it("creates 11 graphics children on overlayLayer", () => {
    const { overlayLayer } = createRenderer();
    expect(overlayLayer.addChild).toHaveBeenCalledTimes(11);
  });

  it("clear() clears all graphics", () => {
    const { renderer } = createRenderer();
    renderer.clear();
    expect(renderer._gizmoGraphics.clear).toHaveBeenCalled();
    expect(renderer._skeletonGraphics.clear).toHaveBeenCalled();
    expect(renderer._warpGraphics.clear).toHaveBeenCalled();
    expect(renderer._weightGraphics.clear).toHaveBeenCalled();
    expect(renderer._hoverGraphics.clear).toHaveBeenCalled();
  });

  it("renderGizmo does nothing when not visible", () => {
    const { renderer } = createRenderer();
    renderer.renderGizmo({ visible: false }, 1);
    expect(renderer._gizmoGraphics.clear).toHaveBeenCalled();
  });

  it("renderGizmo draws when visible", () => {
    const { renderer } = createRenderer();
    const gizmoFrame = {
      visible: true,
      bboxPoints: [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        { x: 100, y: 80 },
        { x: 0, y: 80 },
      ],
      pivot: { x: 50, y: 40 },
      center: { x: 50, y: 40 },
      topCenter: { x: 50, y: 0 },
      rotationHandle: { x: 50, y: -52 },
    };
    renderer.renderGizmo(gizmoFrame, 1);
    expect(renderer._gizmoGraphics.stroke).toHaveBeenCalled();
    expect(renderer._gizmoGraphics.fill).toHaveBeenCalled();
  });

  it("renderSkeleton draws bone arrows and joints", () => {
    const { renderer } = createRenderer();
    const skeletonFrame = {
      boneLines: [
        { x1: 0, y1: 0, x2: 100, y2: 50, boneId: "b1", name: "Bone" },
      ],
      connections: [
        { x1: 0, y1: 0, x2: 100, y2: 50, fromRole: "torso", toRole: "neck" },
      ],
      joints: [{ x: 0, y: 0, boneId: "b1", name: "Bone" }],
    };
    renderer.renderSkeleton(skeletonFrame, 1);
    expect(renderer._skeletonGraphics.closePath).toHaveBeenCalled();
    expect(renderer._skeletonGraphics.stroke).toHaveBeenCalled();
    expect(renderer._skeletonGraphics.fill).toHaveBeenCalled();
  });

  it("renderSkeleton paints inactive bones grey (0x71717a)", () => {
    const { renderer } = createRenderer();
    renderer.renderSkeleton(
      {
        boneLines: [
          {
            x1: 0,
            y1: 0,
            x2: 100,
            y2: 0,
            boneId: "b1",
            isActive: false,
            isSelected: false,
            isMultiSelected: false,
            isHovered: false,
          },
        ],
        connections: [],
        joints: [
          {
            x: 0,
            y: 0,
            boneId: "b1",
            isActive: false,
            isSelected: false,
            isMultiSelected: false,
            isHovered: false,
          },
        ],
      },
      1,
    );
    const calls = renderer._skeletonGraphics.stroke.mock.calls;
    const fillCalls = renderer._skeletonGraphics.fill.mock.calls;
    const usedGreyStroke = calls.some((c) => c[0]?.color === 0x71717a);
    const usedGreyFill = fillCalls.some((c) => c[0]?.color === 0x71717a);
    expect(usedGreyStroke || usedGreyFill).toBe(true);
  });

  it("renderSkeleton paints multi-selected bones yellow (0xfacc15)", () => {
    const { renderer } = createRenderer();
    renderer.renderSkeleton(
      {
        boneLines: [
          {
            x1: 0,
            y1: 0,
            x2: 100,
            y2: 0,
            boneId: "b1",
            isActive: false,
            isSelected: true,
            isMultiSelected: true,
            isHovered: false,
          },
        ],
        connections: [],
        joints: [
          {
            x: 0,
            y: 0,
            boneId: "b1",
            isActive: false,
            isSelected: true,
            isMultiSelected: true,
            isHovered: false,
          },
        ],
      },
      1,
    );
    const calls = renderer._skeletonGraphics.stroke.mock.calls;
    const fillCalls = renderer._skeletonGraphics.fill.mock.calls;
    const usedYellow =
      calls.some((c) => c[0]?.color === 0xfacc15) ||
      fillCalls.some((c) => c[0]?.color === 0xfacc15);
    expect(usedYellow).toBe(true);
  });

  it("renderSkeleton paints hovered bones with hover color (0xfb923c)", () => {
    const { renderer } = createRenderer();
    renderer.renderSkeleton(
      {
        boneLines: [
          {
            x1: 0,
            y1: 0,
            x2: 100,
            y2: 0,
            boneId: "b1",
            isActive: false,
            isSelected: false,
            isMultiSelected: false,
            isHovered: true,
          },
        ],
        connections: [],
        joints: [
          {
            x: 0,
            y: 0,
            boneId: "b1",
            isActive: false,
            isSelected: false,
            isMultiSelected: false,
            isHovered: true,
          },
        ],
      },
      1,
    );
    const calls = renderer._skeletonGraphics.stroke.mock.calls;
    const fillCalls = renderer._skeletonGraphics.fill.mock.calls;
    const usedHover =
      calls.some((c) => c[0]?.color === 0xfb923c) ||
      fillCalls.some((c) => c[0]?.color === 0xfb923c);
    expect(usedHover).toBe(true);
  });

  it("renderWarpLattice does nothing when not visible", () => {
    const { renderer } = createRenderer();
    renderer.renderWarpLattice({ visible: false }, 1);
    expect(renderer._warpGraphics.clear).toHaveBeenCalled();
  });

  it("renderWarpLattice draws grid when visible", () => {
    const { renderer } = createRenderer();
    const warpFrame = {
      visible: true,
      gridPoints: [
        { x: 0, y: 0 },
        { x: 50, y: 0 },
        { x: 100, y: 0 },
        { x: 0, y: 50 },
        { x: 50, y: 50 },
        { x: 100, y: 50 },
        { x: 0, y: 100 },
        { x: 50, y: 100 },
        { x: 100, y: 100 },
      ],
      col: 2,
      row: 2,
      stride: 3,
    };
    renderer.renderWarpLattice(warpFrame, 1);
    expect(renderer._warpGraphics.stroke).toHaveBeenCalled();
    expect(renderer._warpGraphics.fill).toHaveBeenCalled();
  });

  it("renderMeshWireframe draws triangles and vertices", () => {
    const { renderer } = createRenderer();
    renderer.renderMeshWireframe(
      {
        vertices: [
          { x: 0, y: 0 },
          { x: 20, y: 0 },
          { x: 10, y: 20 },
        ],
        triangles: [[0, 1, 2]],
      },
      1,
    );

    expect(renderer._meshGraphics.stroke).toHaveBeenCalled();
    expect(renderer._meshGraphics.circle).toHaveBeenCalledTimes(3);
  });

  it("renderIkConstraints draws target and assignment preview", () => {
    const { renderer } = createRenderer();
    renderer.renderIkConstraints(
      {
        targets: [{ x: 10, y: 20, color: 0xf472b6, assigned: false }],
        preview: { x1: 10, y1: 20, x2: 100, y2: 20, color: 0xf472b6 },
      },
      1,
    );

    expect(renderer._ikGraphics.circle).toHaveBeenCalled();
    expect(renderer._ikGraphics.stroke).toHaveBeenCalled();
  });

  it("renderWeightPaint draws points (backward compat)", () => {
    const { renderer } = createRenderer();
    const points = [
      { x: 10, y: 20, weight: 0.5 },
      { x: 30, y: 40, weight: 1.0 },
    ];
    renderer.renderWeightPaint(points, 1);
    expect(renderer._weightGraphics.fill).toHaveBeenCalled();
    expect(renderer._weightGraphics.circle).toHaveBeenCalledTimes(2);
  });

  it("renderWeightPaint does nothing for null", () => {
    const { renderer } = createRenderer();
    renderer.renderWeightPaint(null, 1);
    expect(renderer._weightGraphics.clear).toHaveBeenCalled();
  });

  it("renderWeightPaint draws triangle fill and vertex dots from K5 frame", () => {
    const { renderer } = createRenderer();
    const frame = {
      visible: true,
      vertices: [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        { x: 50, y: 100 },
      ],
      triangles: [[0, 1, 2]],
      weights: [0.8, 0.2, 0.5],
      selectedBoneId: "bone-1",
      stats: { vertexCount: 3 },
    };
    renderer.renderWeightPaint(frame, 1);
    expect(renderer._weightGraphics.moveTo).toHaveBeenCalled();
    expect(renderer._weightGraphics.lineTo).toHaveBeenCalled();
    expect(renderer._weightGraphics.fill).toHaveBeenCalled();
    expect(renderer._weightGraphics.circle).toHaveBeenCalledTimes(3);
  });

  it("renderWeightPaint uses different colors for weight 0 vs weight 1 vertex dots", () => {
    const { renderer } = createRenderer();
    const frame = {
      visible: true,
      vertices: [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
      ],
      triangles: [],
      weights: [0, 1],
      selectedBoneId: "bone-1",
      stats: { vertexCount: 2 },
    };
    renderer.renderWeightPaint(frame, 1);
    const fillCalls = renderer._weightGraphics.fill.mock.calls;
    const dotFills = fillCalls.filter((c) => c[0]?.color !== undefined);
    expect(dotFills.length).toBe(2);
    expect(dotFills[0][0].color).not.toEqual(dotFills[1][0].color);
  });

  it("renderWeightPaint skips triangle fill for large meshes beyond limit", () => {
    const { renderer } = createRenderer();
    const largeTriangles = Array.from({ length: 3000 }, (_, i) => [
      i * 3,
      i * 3 + 1,
      i * 3 + 2,
    ]);
    const largeVertices = Array.from({ length: 9000 }, (_, i) => ({
      x: i,
      y: 0,
    }));
    const largeWeights = Array.from({ length: 9000 }, () => 0.5);
    const frame = {
      visible: true,
      vertices: largeVertices,
      triangles: largeTriangles,
      weights: largeWeights,
      selectedBoneId: "bone-1",
      stats: { vertexCount: largeVertices.length },
    };
    const fillCallsBefore = renderer._weightGraphics.fill.mock.calls.length;
    renderer.renderWeightPaint(frame, 1);
    const fillCallsAfter = renderer._weightGraphics.fill.mock.calls.length;
    expect(fillCallsAfter - fillCallsBefore).toBeLessThanOrEqual(
      largeVertices.length,
    );
  });

  it("renderHover does nothing without hit", () => {
    const { renderer } = createRenderer();
    renderer.renderHover(null, 1);
    expect(renderer._hoverGraphics.clear).toHaveBeenCalled();
  });

  it("renderHover draws bbox outline when frame is provided", () => {
    const { renderer } = createRenderer();
    renderer.renderHover(
      {
        bboxPoints: [
          { x: 0, y: 0 },
          { x: 10, y: 0 },
          { x: 10, y: 10 },
          { x: 0, y: 10 },
        ],
      },
      1,
    );
    expect(renderer._hoverGraphics.moveTo).toHaveBeenCalledWith(0, 0);
    expect(renderer._hoverGraphics.stroke).toHaveBeenCalled();
  });

  it("dispose cleans up all graphics", () => {
    const { renderer } = createRenderer();
    renderer.dispose();
    expect(renderer._gizmoGraphics.destroy).toHaveBeenCalled();
    expect(renderer._skeletonGraphics.destroy).toHaveBeenCalled();
    expect(renderer._warpGraphics.destroy).toHaveBeenCalled();
    expect(renderer._meshGraphics.destroy).toHaveBeenCalled();
    expect(renderer._ikGraphics.destroy).toHaveBeenCalled();
    expect(renderer._weightGraphics.destroy).toHaveBeenCalled();
    expect(renderer._hoverGraphics.destroy).toHaveBeenCalled();
    expect(renderer._marqueeGraphics.destroy).toHaveBeenCalled();
    expect(renderer._drawBoneGraphics.destroy).toHaveBeenCalled();
    expect(renderer._brushGraphics.destroy).toHaveBeenCalled();
    expect(renderer._exportAreaGraphics.destroy).toHaveBeenCalled();
  });

  it("renderMarquee does nothing without marqueeWorldBox", () => {
    const { renderer } = createRenderer();
    renderer.renderMarquee(null, 1);
    expect(renderer._marqueeGraphics.clear).toHaveBeenCalled();
  });

  it("renderMarquee draws rect when box provided", () => {
    const { renderer } = createRenderer();
    renderer.renderMarquee({ x: 10, y: 20, w: 100, h: 50 }, 1);
    expect(renderer._marqueeGraphics.rect).toHaveBeenCalled();
    expect(renderer._marqueeGraphics.fill).toHaveBeenCalled();
    expect(renderer._marqueeGraphics.stroke).toHaveBeenCalled();
  });

  it("renderDrawBonePreview does nothing without preview", () => {
    const { renderer } = createRenderer();
    renderer.renderDrawBonePreview(null, 1);
    expect(renderer._drawBoneGraphics.clear).toHaveBeenCalled();
  });

  it("renderDrawBonePreview draws lines and circles", () => {
    const { renderer } = createRenderer();
    renderer.renderDrawBonePreview(
      { startX: 0, startY: 0, endX: 100, endY: 50 },
      1,
    );
    expect(renderer._drawBoneGraphics.moveTo).toHaveBeenCalled();
    expect(renderer._drawBoneGraphics.lineTo).toHaveBeenCalled();
    expect(renderer._drawBoneGraphics.circle).toHaveBeenCalledTimes(2);
    expect(renderer._drawBoneGraphics.stroke).toHaveBeenCalled();
    expect(renderer._drawBoneGraphics.fill).toHaveBeenCalled();
  });

  it("renderBrush does nothing without cursor", () => {
    const { renderer } = createRenderer();
    renderer.renderBrush(null, 0, 0, 1);
    expect(renderer._brushGraphics.clear).toHaveBeenCalled();
  });

  it("renderBrush draws circle at world position", () => {
    const { renderer } = createRenderer();
    renderer.renderBrush({ brushSize: 20 }, 50, 60, 1);
    expect(renderer._brushGraphics.circle).toHaveBeenCalledWith(50, 60, 20);
    expect(renderer._brushGraphics.stroke).toHaveBeenCalled();
  });

  it("renderBrush scales radius by inverse zoom", () => {
    const { renderer } = createRenderer();
    renderer.renderBrush({ brushSize: 20 }, 50, 60, 2);
    expect(renderer._brushGraphics.circle).toHaveBeenCalledWith(50, 60, 10);
  });

  describe("renderExportArea", () => {
    it("clears graphics when frame is invalid", () => {
      const { renderer } = createRenderer();
      renderer.renderExportArea({ valid: false }, 1);
      expect(renderer._exportAreaGraphics.clear).toHaveBeenCalled();
    });

    it("clears graphics when frame is null", () => {
      const { renderer } = createRenderer();
      renderer.renderExportArea(null, 1);
      expect(renderer._exportAreaGraphics.clear).toHaveBeenCalled();
    });

    it("draws a dashed outline without fill for valid frame", () => {
      const { renderer } = createRenderer();
      renderer.renderExportArea(
        { valid: true, x: 10, y: 20, width: 640, height: 360 },
        1,
      );
      expect(renderer._exportAreaGraphics.moveTo).toHaveBeenCalled();
      expect(
        renderer._exportAreaGraphics.lineTo.mock.calls.length,
      ).toBeGreaterThan(4);
      expect(renderer._exportAreaGraphics.stroke).toHaveBeenCalled();
      expect(renderer._exportAreaGraphics.fill).not.toHaveBeenCalled();
      expect(renderer._exportAreaGraphics.rect).not.toHaveBeenCalled();
    });

    it("draws dashed outline from a negative origin", () => {
      const { renderer } = createRenderer();
      renderer.renderExportArea(
        { valid: true, x: -120, y: 40, width: 640, height: 360 },
        1,
      );
      expect(renderer._exportAreaGraphics.moveTo).toHaveBeenCalledWith(
        -120,
        40,
      );
    });

    it("does not create a text label", () => {
      const { renderer } = createRenderer();
      renderer.renderExportArea(
        { valid: true, x: 0, y: 0, width: 100, height: 100 },
        1,
      );
      expect(renderer._exportAreaLabel).toBeUndefined();
    });

    it("keeps dash size and stroke width stable under zoom", () => {
      const { renderer } = createRenderer();
      renderer.renderExportArea(
        { valid: true, x: 50, y: 30, width: 100, height: 100 },
        2,
      );
      expect(renderer._exportAreaGraphics.lineTo).toHaveBeenCalledWith(54, 30);
      expect(renderer._exportAreaGraphics.stroke).toHaveBeenCalledWith(
        expect.objectContaining({ width: 1 }),
      );
    });
  });

  describe("Armature toggle gating (Plan 29 — P6/A8)", () => {
    it("renderSkeleton clears and draws nothing when frame is null", () => {
      const { renderer } = createRenderer();
      renderer.renderSkeleton(null, 1);
      expect(renderer._skeletonGraphics.clear).toHaveBeenCalled();
      expect(renderer._skeletonGraphics.stroke).not.toHaveBeenCalled();
    });

    it("renderMeshWireframe clears and draws nothing when frame is null", () => {
      const { renderer } = createRenderer();
      renderer.renderMeshWireframe(null, 1);
      expect(renderer._meshGraphics.clear).toHaveBeenCalled();
      expect(renderer._meshGraphics.stroke).not.toHaveBeenCalled();
      expect(renderer._meshGraphics.circle).not.toHaveBeenCalled();
    });

    it("renderIkConstraints clears and draws nothing when frame is null", () => {
      const { renderer } = createRenderer();
      renderer.renderIkConstraints(null, 1);
      expect(renderer._ikGraphics.clear).toHaveBeenCalled();
      expect(renderer._ikGraphics.circle).not.toHaveBeenCalled();
      expect(renderer._ikGraphics.stroke).not.toHaveBeenCalled();
    });
  });
});
