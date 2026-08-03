import { describe, expect, it } from 'vitest';
import { buildCanvasOverlayFrame, buildExportAreaOverlayFrame } from '@/features/canvas/domain/canvasOverlayFrame.js';

describe('buildCanvasOverlayFrame', () => {
  it('reuses precomputed pose data and world matrices', () => {
    const effectiveNodes = [
      { id: 'part-1', type: 'part', transform: { x: 10, y: 20 } },
    ];
    const effectiveBones = [{ id: 'bone-1' }];
    const worldMatrices = new Map([['part-1', new Float32Array([1, 0, 0, 0, 1, 0, 10, 20, 1])]]);

    const frame = buildCanvasOverlayFrame({
      project: { nodes: [] },
      editorState: {
        toolMode: 'select',
        selection: ['part-1'],
      },
      framePose: {
        effectiveNodes,
        effectiveBones,
        worldMatrices,
      },
    });

    expect(frame.selectedNodeId).toBe('part-1');
    expect(frame.effectiveNodes).toBe(effectiveNodes);
    expect(frame.effectiveBones).toBe(effectiveBones);
    expect(frame.worldMatrices).toBe(worldMatrices);
  });

  it('hides element gizmo and hover chrome in pose mode', () => {
    const effectiveNodes = [
      { id: 'part-1', type: 'part', transform: { x: 10, y: 20 } },
    ];
    const frame = buildCanvasOverlayFrame({
      project: { nodes: [] },
      editorState: {
        activeTool: 'pose',
        selectionTarget: 'all',
        selection: ['part-1'],
        hoverHit: 'part-1',
      },
      framePose: {
        effectiveNodes,
        effectiveBones: [],
        worldMatrices: new Map(),
      },
    });

    expect(frame.selectedNodeId).toBeNull();
    expect(frame.hoverHit).toBeNull();
  });

  it('keeps panel-originated part hover visible while rig targeting is active', () => {
    const frame = buildCanvasOverlayFrame({
      project: { nodes: [] },
      editorState: {
        activeTool: 'transform',
        selectionTarget: 'rig',
        selection: [],
        hoverHit: 'part-1',
        hoverSource: 'panel',
      },
      framePose: {
        effectiveNodes: [{ id: 'part-1', type: 'part', transform: {} }],
        effectiveBones: [],
        worldMatrices: new Map(),
      },
    });

    expect(frame.selectedNodeId).toBeNull();
    expect(frame.hoverHit).toBe('part-1');
  });

  it('suppresses passive canvas hover while an element is active', () => {
    const frame = buildCanvasOverlayFrame({
      project: { nodes: [] },
      editorState: {
        activeTool: 'select',
        selection: ['part-2'],
        hoverHit: 'part-1',
        hoverSource: 'canvas',
      },
      framePose: {
        effectiveNodes: [
          { id: 'part-1', type: 'part', transform: {} },
          { id: 'part-2', type: 'part', transform: {} },
        ],
        effectiveBones: [],
        worldMatrices: new Map(),
      },
    });

    expect(frame.hoverHit).toBeNull();
  });

  it('keeps explicit panel hover visible in any tool with an active element', () => {
    const frame = buildCanvasOverlayFrame({
      project: { nodes: [] },
      editorState: {
        activeTool: 'pose',
        selection: ['part-2'],
        hoverHit: 'part-1',
        hoverSource: 'panel',
      },
      framePose: {
        effectiveNodes: [
          { id: 'part-1', type: 'part', transform: {} },
          { id: 'part-2', type: 'part', transform: {} },
        ],
        effectiveBones: [],
        worldMatrices: new Map(),
      },
    });

    expect(frame.hoverHit).toBe('part-1');
  });

  it('converts marqueeBox screen coords to world coords', () => {
    const frame = buildCanvasOverlayFrame({
      project: { nodes: [] },
      editorState: {
        marqueeBox: { x: 100, y: 200, w: 300, h: 150 },
        view: { zoom: 2, panX: 50, panY: 30 },
      },
      framePose: {
        effectiveNodes: [],
        effectiveBones: [],
        worldMatrices: new Map(),
      },
    });

    expect(frame.marqueeWorldBox).toEqual({
      x: 25,
      y: 85,
      w: 150,
      h: 75,
    });
  });

  it('returns null marqueeWorldBox when no marqueeBox', () => {
    const frame = buildCanvasOverlayFrame({
      project: { nodes: [] },
      editorState: { view: { zoom: 1, panX: 0, panY: 0 } },
      framePose: {
        effectiveNodes: [],
        effectiveBones: [],
        worldMatrices: new Map(),
      },
    });

    expect(frame.marqueeWorldBox).toBeNull();
  });

  it('returns drawBonePreview from editorState', () => {
    const preview = { startX: 0, startY: 0, endX: 100, endY: 50 };
    const frame = buildCanvasOverlayFrame({
      project: { nodes: [] },
      editorState: { drawBonePreview: preview },
      framePose: {
        effectiveNodes: [],
        effectiveBones: [],
        worldMatrices: new Map(),
      },
    });

    expect(frame.drawBonePreview).toBe(preview);
  });

  it('builds a subtle assigned-bone line while hovering an IK target', () => {
    const constraint = {
      id: 'ik-1',
      type: 'ik',
      assignedBoneId: 'bone-1',
      targetX: 100,
      targetY: 80,
      color: 0xf472b6,
    };
    const bone = {
      id: 'bone-1',
      parentId: null,
      setup: { x: 10, y: 20, length: 30, rotation: 0 },
    };
    const frame = buildCanvasOverlayFrame({
      project: { nodes: [], constraints: [constraint] },
      editorState: { hoverHit: 'constraint:ik-1' },
      framePose: {
        effectiveNodes: [],
        effectiveBones: [bone],
        worldMatrices: new Map(),
      },
    });

    expect(frame.ikOverlay.preview).toMatchObject({
      x1: 100,
      y1: 80,
      x2: 40,
      y2: 20,
      color: 0xf472b6,
      alpha: 0.35,
    });
  });

  it('scales IK target radius with its assigned bone and keeps unassigned targets at default size', () => {
    const frame = buildCanvasOverlayFrame({
      project: {
        nodes: [],
        constraints: [
          { id: 'ik-unassigned', type: 'ik', targetX: 10, targetY: 20 },
          { id: 'ik-assigned', type: 'ik', assignedBoneId: 'bone-1', targetX: 30, targetY: 40 },
        ],
      },
      editorState: {},
      framePose: {
        effectiveNodes: [],
        effectiveBones: [{
          id: 'bone-1',
          setup: { length: 40, scaleX: 1 },
        }],
        worldMatrices: new Map(),
      },
    });

    expect(frame.ikOverlay.targets).toMatchObject([
      { id: 'ik-unassigned', radius: 9 },
      { id: 'ik-assigned', radius: 4.5 },
    ]);
  });

  it('clamps IK target radius for extremely small and large bones', () => {
    const frame = buildCanvasOverlayFrame({
      project: {
        nodes: [],
        constraints: [
          { id: 'ik-small', type: 'ik', assignedBoneId: 'small', targetX: 10, targetY: 20 },
          { id: 'ik-large', type: 'ik', assignedBoneId: 'large', targetX: 30, targetY: 40 },
        ],
      },
      editorState: {},
      framePose: {
        effectiveNodes: [],
        effectiveBones: [
          { id: 'small', setup: { length: 1, scaleX: 1 } },
          { id: 'large', setup: { length: 1000, scaleX: 1 } },
        ],
        worldMatrices: new Map(),
      },
    });

    expect(frame.ikOverlay.targets).toMatchObject([
      { id: 'ik-small', radius: 4 },
      { id: 'ik-large', radius: 16 },
    ]);
  });

  it('shows the IK link only while hovering an inactive affected bone', () => {
    const constraint = {
      id: 'ik-1',
      type: 'ik',
      assignedBoneId: 'bone-1',
      affectedBoneIds: ['bone-1'],
      targetX: 100,
      targetY: 80,
      color: 0xf472b6,
    };
    const bone = {
      id: 'bone-1',
      parentId: null,
      setup: { x: 10, y: 20, length: 30, rotation: 0 },
    };
    const build = editorState => buildCanvasOverlayFrame({
      project: { nodes: [], constraints: [constraint] },
      editorState,
      framePose: {
        effectiveNodes: [],
        effectiveBones: [bone],
        worldMatrices: new Map(),
      },
    });

    expect(build({ hoverHit: 'bone:bone-1', selection: [] }).ikOverlay.preview)
      .toMatchObject({
        x1: 100,
        y1: 80,
        x2: 40,
        y2: 20,
        alpha: 0.55,
      });
    expect(build({
      hoverHit: 'bone:bone-1',
      selection: ['bone-1'],
      activeBoneId: 'bone-1',
    }).ikOverlay.preview).toBeNull();
  });

  it('builds weightPaintPoints in world coordinates', () => {
    const partNode = {
      id: 'part-1',
      type: 'part',
      mesh: {
        vertices: [{ x: 10, y: 20 }, { x: 30, y: 40 }],
        influences: [
          [{ boneId: 'bone-1', weight: 0.8 }],
          [{ boneId: 'bone-1', weight: 0.3 }],
        ],
      },
    };
    const wm = new Float32Array([2, 0, 0, 0, 2, 0, 100, 200, 1]);
    const worldMatrices = new Map([['part-1', wm]]);

    const frame = buildCanvasOverlayFrame({
      project: { nodes: [] },
      editorState: {
        weightPaintMode: true,
        selection: ['part-1'],
        weightPaintBoneId: 'bone-1',
      },
      framePose: {
        effectiveNodes: [partNode],
        effectiveBones: [],
        worldMatrices,
      },
    });

    expect(frame.weightPaintPoints).toEqual([
      { x: 120, y: 240, weight: 0.8 },
      { x: 160, y: 280, weight: 0.3 },
    ]);
  });

  it('builds weightPaintPoints from effective mesh vertices', () => {
    const partNode = {
      id: 'part-1',
      type: 'part',
      mesh: {
        vertices: [{ x: 10, y: 20 }],
        influences: [[{ boneId: 'bone-1', weight: 0.8 }]],
      },
    };
    const worldMatrices = new Map([[
      'part-1',
      new Float32Array([1, 0, 0, 0, 1, 0, 100, 200, 1]),
    ]]);

    const frame = buildCanvasOverlayFrame({
      project: { nodes: [] },
      editorState: {
        weightPaintMode: true,
        selection: ['part-1'],
        weightPaintBoneId: 'bone-1',
      },
      framePose: {
        effectiveNodes: [partNode],
        effectiveBones: [],
        effectiveMeshes: new Map([[
          'part-1',
          { vertices: [{ x: 70, y: 80 }], triangles: [] },
        ]]),
        worldMatrices,
      },
    });

    expect(frame.weightPaintPoints).toEqual([
      { x: 170, y: 280, weight: 0.8 },
    ]);
  });

  it('builds mesh wireframe from effective mesh vertices', () => {
    const partNode = {
      id: 'part-1',
      type: 'part',
      mesh: {
        vertices: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 0, y: 10 }],
        triangles: [[0, 1, 2]],
      },
    };
    const worldMatrices = new Map([[
      'part-1',
      new Float32Array([1, 0, 0, 0, 1, 0, 5, 7, 1]),
    ]]);

    const frame = buildCanvasOverlayFrame({
      project: { nodes: [] },
      editorState: {
        meshEditMode: true,
        selection: ['part-1'],
      },
      framePose: {
        effectiveNodes: [partNode],
        effectiveBones: [],
        effectiveMeshes: new Map([[
          'part-1',
          {
            vertices: [{ x: 20, y: 30 }, { x: 40, y: 30 }, { x: 20, y: 50 }],
            triangles: [[0, 1, 2]],
          },
        ]]),
        worldMatrices,
      },
    });

    expect(frame.meshWireframe.vertices).toEqual([
      { x: 25, y: 37 },
      { x: 45, y: 37 },
      { x: 25, y: 57 },
    ]);
  });

  it('returns null weightPaintPoints when not in weight paint mode', () => {
    const frame = buildCanvasOverlayFrame({
      project: { nodes: [] },
      editorState: { weightPaintMode: false },
      framePose: {
        effectiveNodes: [],
        effectiveBones: [],
        worldMatrices: new Map(),
      },
    });

    expect(frame.weightPaintPoints).toBeNull();
  });

  it('builds weightPaintOverlay frame with vertices/triangles/weights/stats', () => {
    const partNode = {
      id: 'part-1',
      type: 'part',
      mesh: {
        vertices: [{ x: 10, y: 20 }, { x: 30, y: 40 }, { x: 50, y: 60 }],
        triangles: [[0, 1, 2]],
        influences: [
          [{ boneId: 'bone-1', weight: 0.8 }],
          [{ boneId: 'bone-1', weight: 0.3 }],
          [],
        ],
      },
    };
    const wm = new Float32Array([2, 0, 0, 0, 2, 0, 100, 200, 1]);
    const worldMatrices = new Map([['part-1', wm]]);

    const frame = buildCanvasOverlayFrame({
      project: { nodes: [] },
      editorState: {
        weightPaintMode: true,
        selection: ['part-1'],
        weightPaintBoneId: 'bone-1',
      },
      framePose: {
        effectiveNodes: [partNode],
        effectiveBones: [],
        worldMatrices,
      },
    });

    expect(frame.weightPaintOverlay).not.toBeNull();
    expect(frame.weightPaintOverlay.visible).toBe(true);
    expect(frame.weightPaintOverlay.vertices).toHaveLength(3);
    expect(frame.weightPaintOverlay.vertices[0]).toEqual({ x: 120, y: 240 });
    expect(frame.weightPaintOverlay.triangles).toEqual([[0, 1, 2]]);
    expect(frame.weightPaintOverlay.weights).toEqual([0.8, 0.3, 0]);
    expect(frame.weightPaintOverlay.selectedBoneId).toBe('bone-1');
    expect(frame.weightPaintOverlay.stats.vertexCount).toBe(3);
    expect(frame.weightPaintOverlay.stats.selectedBoneVertexCount).toBe(2);
  });

  it('converts flat triangle indices for weightPaintOverlay', () => {
    const partNode = {
      id: 'part-1',
      type: 'part',
      mesh: {
        vertices: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 0, y: 10 }],
        triangles: [0, 1, 2],
        influences: [
          [{ boneId: 'bone-1', weight: 1 }],
          [{ boneId: 'bone-1', weight: 0.5 }],
          [],
        ],
      },
    };

    const frame = buildCanvasOverlayFrame({
      project: { nodes: [] },
      editorState: {
        weightPaintMode: true,
        selection: ['part-1'],
        weightPaintBoneId: 'bone-1',
      },
      framePose: {
        effectiveNodes: [partNode],
        effectiveBones: [],
        worldMatrices: new Map([['part-1', new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1])]]),
      },
    });

    expect(frame.weightPaintOverlay.triangles).toEqual([[0, 1, 2]]);
  });

  it('returns null weightPaintOverlay when not in weight paint mode', () => {
    const frame = buildCanvasOverlayFrame({
      project: { nodes: [] },
      editorState: { weightPaintMode: false },
      framePose: {
        effectiveNodes: [],
        effectiveBones: [],
        worldMatrices: new Map(),
      },
    });
    expect(frame.weightPaintOverlay).toBeNull();
  });

  it('returns null weightPaintOverlay without selected bone', () => {
    const frame = buildCanvasOverlayFrame({
      project: { nodes: [] },
      editorState: {
        weightPaintMode: true,
        selection: ['part-1'],
      },
      framePose: {
        effectiveNodes: [],
        effectiveBones: [],
        worldMatrices: new Map(),
      },
    });
    expect(frame.weightPaintOverlay).toBeNull();
  });

  it('weightPaintOverlay uses effective mesh vertices when available', () => {
    const partNode = {
      id: 'part-1',
      type: 'part',
      mesh: {
        vertices: [{ x: 10, y: 20 }],
        triangles: [[0, 0, 0]],
        influences: [[{ boneId: 'bone-1', weight: 1 }]],
      },
    };
    const wm = new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1]);
    const worldMatrices = new Map([['part-1', wm]]);

    const frame = buildCanvasOverlayFrame({
      project: { nodes: [] },
      editorState: {
        weightPaintMode: true,
        selection: ['part-1'],
        weightPaintBoneId: 'bone-1',
      },
      framePose: {
        effectiveNodes: [partNode],
        effectiveBones: [],
        effectiveMeshes: new Map([[
          'part-1',
          { vertices: [{ x: 70, y: 80 }], triangles: [] },
        ]]),
        worldMatrices,
      },
    });

    expect(frame.weightPaintOverlay.vertices[0]).toEqual({ x: 70, y: 80 });
  });

  it('derived weightPaintPoints matches weightPaintOverlay data', () => {
    const partNode = {
      id: 'part-1',
      type: 'part',
      mesh: {
        vertices: [{ x: 10, y: 20 }, { x: 30, y: 40 }],
        triangles: [],
        influences: [
          [{ boneId: 'bone-1', weight: 0.8 }],
          [{ boneId: 'bone-1', weight: 0.3 }],
        ],
      },
    };
    const wm = new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1]);
    const worldMatrices = new Map([['part-1', wm]]);

    const frame = buildCanvasOverlayFrame({
      project: { nodes: [] },
      editorState: {
        weightPaintMode: true,
        selection: ['part-1'],
        weightPaintBoneId: 'bone-1',
      },
      framePose: {
        effectiveNodes: [partNode],
        effectiveBones: [],
        worldMatrices,
      },
    });

    expect(frame.weightPaintPoints).toHaveLength(2);
    expect(frame.weightPaintPoints[0]).toEqual({ x: 10, y: 20, weight: 0.8 });
    expect(frame.weightPaintPoints[1]).toEqual({ x: 30, y: 40, weight: 0.3 });
  });

  it('returns brushCursor with brushSize when in brush mode', () => {
    const frame = buildCanvasOverlayFrame({
      project: { nodes: [] },
      editorState: {
        weightPaintMode: true,
        brushSize: 25,
      },
      framePose: {
        effectiveNodes: [],
        effectiveBones: [],
        worldMatrices: new Map(),
      },
    });

    expect(frame.brushCursor).toEqual({ brushSize: 25 });
  });

  it('returns null brushCursor when not in brush mode', () => {
    const frame = buildCanvasOverlayFrame({
      project: { nodes: [] },
      editorState: { weightPaintMode: false, meshEditMode: false },
      framePose: {
        effectiveNodes: [],
        effectiveBones: [],
        worldMatrices: new Map(),
      },
    });

    expect(frame.brushCursor).toBeNull();
  });

  describe('buildExportAreaOverlayFrame', () => {
    it('returns valid frame for positive dimensions', () => {
      const frame = buildExportAreaOverlayFrame({ x: 10, y: 20, width: 640, height: 360 }, true);
      expect(frame.valid).toBe(true);
      expect(frame.x).toBe(10);
      expect(frame.y).toBe(20);
      expect(frame.width).toBe(640);
      expect(frame.height).toBe(360);
    });

    it('returns valid frame for negative origin', () => {
      const frame = buildExportAreaOverlayFrame({ x: -120, y: 40, width: 640, height: 360 }, true);
      expect(frame.valid).toBe(true);
      expect(frame.x).toBe(-120);
      expect(frame.y).toBe(40);
    });

    it('returns invalid frame for zero dimensions', () => {
      const frame = buildExportAreaOverlayFrame({ x: 0, y: 0, width: 0, height: 0 });
      expect(frame.valid).toBe(false);
    });

    it('returns invalid frame for negative dimensions', () => {
      const frame = buildExportAreaOverlayFrame({ x: 0, y: 0, width: -100, height: -100 });
      expect(frame.valid).toBe(false);
    });

    it('returns invalid frame for NaN dimensions', () => {
      const frame = buildExportAreaOverlayFrame({ x: NaN, y: NaN, width: NaN, height: NaN });
      expect(frame.valid).toBe(false);
    });

    it('returns invalid frame for null canvas', () => {
      const frame = buildExportAreaOverlayFrame(null);
      expect(frame.valid).toBe(false);
    });

    it('returns invalid frame for undefined canvas', () => {
      const frame = buildExportAreaOverlayFrame(undefined);
      expect(frame.valid).toBe(false);
    });

    it('preserves fractional dimensions', () => {
      const frame = buildExportAreaOverlayFrame({ x: 10.5, y: 20.3, width: 640.7, height: 360.2 }, true);
      expect(frame.valid).toBe(true);
      expect(frame.width).toBe(640.7);
      expect(frame.height).toBe(360.2);
    });

    it('returns invalid frame when showExportArea is false', () => {
      const frame = buildExportAreaOverlayFrame({ x: 10, y: 20, width: 640, height: 360 }, false);
      expect(frame.valid).toBe(false);
    });

    it('returns valid frame when showExportArea is true explicitly', () => {
      const frame = buildExportAreaOverlayFrame({ x: 10, y: 20, width: 640, height: 360 }, true);
      expect(frame.valid).toBe(true);
    });

    it('defaults to invalid when editor state omits the visibility flag', () => {
      const frame = buildCanvasOverlayFrame({
        project: { nodes: [], canvas: { x: 50, y: -30, width: 800, height: 600 } },
        editorState: {},
        framePose: { effectiveNodes: [], effectiveBones: [], worldMatrices: new Map() },
      });
      expect(frame.exportAreaFrame).toBeDefined();
      expect(frame.exportAreaFrame.valid).toBe(false);
    });

    it('is invalid when showExportArea is false in editorState', () => {
      const frame = buildCanvasOverlayFrame({
        project: { nodes: [], canvas: { x: 0, y: 0, width: 800, height: 600 } },
        editorState: { showExportArea: false },
        framePose: { effectiveNodes: [], effectiveBones: [], worldMatrices: new Map() },
      });
      expect(frame.exportAreaFrame.valid).toBe(false);
    });

    it('is valid when showExportArea=true in editorState', () => {
      const frame = buildCanvasOverlayFrame({
        project: { nodes: [], canvas: { x: 0, y: 0, width: 800, height: 600 } },
        editorState: { showExportArea: true },
        framePose: { effectiveNodes: [], effectiveBones: [], worldMatrices: new Map() },
      });
      expect(frame.exportAreaFrame.valid).toBe(true);
    });

    it('stays invalid when showExportArea is false', () => {
      const frame = buildCanvasOverlayFrame({
        project: { nodes: [], canvas: { x: 10, y: 20, width: 640, height: 360 } },
        editorState: { showExportArea: false },
        framePose: { effectiveNodes: [], effectiveBones: [], worldMatrices: new Map() },
      });
      expect(frame.exportAreaFrame.valid).toBe(false);
    });
  });
});
