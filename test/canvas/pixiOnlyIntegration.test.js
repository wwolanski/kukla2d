/**
 * Pixi-only integration tests — validates the full Pixi-only runtime
 * covers toolbar → workflow → Pixi gesture, cancel/destroy cleanup,
 * import done → commands, and no legacy DOM/SVG gesture path.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createActor } from 'xstate';
import { editorWorkflowMachine } from '@/features/canvas/application/editorWorkflowMachine.js';
import { routePointerDown } from '@/features/canvas/domain/inputRouter.js';
import { routerResultToMachineEvent } from '@/features/canvas/domain/editorWorkflowEvents.js';
import { useProjectStore } from '@/store/projectStore';
import { beginBatch, endBatch, clearHistory, undoCount } from '@/store/undoHistory';
import {
  createPerformanceCounters,
  incrementCounter,
  recordTiming,
  snapshotStats,
} from '@/features/canvas/domain/pixiPerformanceMetrics.js';

function startMachine() {
  const actor = createActor(editorWorkflowMachine);
  actor.start();
  return actor;
}

function resetProject() {
  useProjectStore.getState().resetProject();
  clearHistory();
}

describe('toolbar → workflow → Pixi gesture (A1)', () => {
  beforeEach(() => resetProject());

  it('SET_TOOL → POINTER_DOWN from Pixi uses same workflow actor', () => {
    const actor = startMachine();

    actor.send({ type: 'SET_TOOL', tool: 'select' });
    expect(actor.getSnapshot().context.activeTool).toBe('select');

    const routerResult = routePointerDown({
      button: 0,
      altKey: false,
      ctrlKey: false,
      editorState: {
        activeTool: 'select',
        selectionTarget: 'element',
        toolMode: 'select',
        meshEditMode: false,
        weightPaintMode: false,
        selection: [],
      },
      toolMode: 'select',
      meshEditMode: false,
      weightPaintMode: false,
      alphaHit: 'part-1',
    });
    const event = routerResultToMachineEvent(routerResult);
    actor.send(event);
    expect(actor.getSnapshot().value).toBe('idle');

    actor.send({ type: 'SELECT_HIT', partId: 'part-1' });
    expect(actor.getSnapshot().value).toBe('idle');

    actor.stop();
  });

  it('toolbar drawBone → Pixi pointerdown transitions to drawingBone', () => {
    const actor = startMachine();
    actor.send({ type: 'SET_TOOL', tool: 'drawBone' });
    expect(actor.getSnapshot().context.activeTool).toBe('drawBone');

    const routerResult = routePointerDown({
      button: 0,
      altKey: false,
      ctrlKey: false,
      editorState: {
        activeTool: 'drawBone',
        selectionTarget: 'element',
        toolMode: 'draw_bone',
        meshEditMode: false,
        weightPaintMode: false,
        selection: [],
      },
      toolMode: 'draw_bone',
      meshEditMode: false,
      weightPaintMode: false,
    });
    const event = routerResultToMachineEvent(routerResult);
    actor.send(event);
    expect(actor.getSnapshot().value).toBe('drawingBone');

    actor.send({ type: 'POINTER_UP' });
    expect(actor.getSnapshot().value).toBe('idle');
    actor.stop();
  });
});

describe('Pixi cancel/destroy → session/cache/batch cleanup (A3)', () => {
  beforeEach(() => resetProject());

  it('CANCEL_GESTURE during pan clears session and returns to idle', () => {
    const actor = startMachine();
    actor.send({ type: 'POINTER_DOWN', intent: 'pan' });
    expect(actor.getSnapshot().value).toBe('panning');

    actor.send({ type: 'CANCEL_GESTURE' });
    expect(actor.getSnapshot().value).toBe('idle');
    expect(actor.getSnapshot().context.activeSession).toBeNull();
    actor.stop();
  });

  it('CANCEL_GESTURE during drag transform clears session', () => {
    const actor = startMachine();
    actor.send({ type: 'START_TRANSFORM_DRAG', payload: { mode: 'move', nodeId: 'n1' } });
    expect(actor.getSnapshot().value).toBe('draggingTransform');
    actor.send({ type: 'MOVE_GESTURE', payload: { clientX: 100, clientY: 200 } });

    actor.send({ type: 'CANCEL_GESTURE' });
    expect(actor.getSnapshot().value).toBe('idle');
    expect(actor.getSnapshot().context.activeSession).toBeNull();
    actor.stop();
  });

  it('CANCEL during gizmo edit clears session', () => {
    const actor = startMachine();
    actor.send({ type: 'START_GIZMO_MOVE', payload: { nodeId: 'n1', startX: 10, startY: 20 } });
    expect(actor.getSnapshot().value).toBe('editingGizmo');
    actor.send({ type: 'MOVE_GESTURE', payload: { clientX: 50, clientY: 60 } });

    actor.send({ type: 'CANCEL' });
    expect(actor.getSnapshot().value).toBe('idle');
    expect(actor.getSnapshot().context.activeSession).toBeNull();
    actor.stop();
  });

  it('CANCEL_GESTURE during marquee clears marqueeBox and session', () => {
    const actor = startMachine();
    actor.send({ type: 'START_MARQUEE', origin: { x: 0, y: 0 }, target: 'element' });
    expect(actor.getSnapshot().value).toBe('marqueeSelecting');
    actor.send({ type: 'UPDATE_MARQUEE', box: { x: 0, y: 0, w: 100, h: 80 } });

    actor.send({ type: 'CANCEL_GESTURE' });
    expect(actor.getSnapshot().value).toBe('idle');
    expect(actor.getSnapshot().context.marqueeBox).toBeNull();
    expect(actor.getSnapshot().context.activeSession).toBeNull();
    actor.stop();
  });

  it('CANCEL_GESTURE during weight painting clears session', () => {
    const actor = startMachine();
    actor.send({ type: 'START_WEIGHT_PAINT', payload: { boneId: 'b1' } });
    expect(actor.getSnapshot().value).toBe('weightPainting');
    actor.send({ type: 'MOVE_GESTURE', payload: { strength: 0.5 } });

    actor.send({ type: 'CANCEL_GESTURE' });
    expect(actor.getSnapshot().value).toBe('idle');
    expect(actor.getSnapshot().context.activeSession).toBeNull();
    actor.stop();
  });

  it('batch cleanup: undo batch collapses after gesture commit', () => {
    const store = useProjectStore.getState();
    const project = useProjectStore.getState().project;

    beginBatch(project);
    store.updateProject((p) => { p.name = 'gesture-A'; });
    endBatch();

    beginBatch(project);
    store.updateProject((p) => { p.name = 'gesture-B'; });
    endBatch();

    expect(undoCount()).toBeGreaterThanOrEqual(2);
  });
});

describe('import done → Pixi upload/select/fit commands (A4)', () => {
  beforeEach(() => resetProject());

  it('IMPORT_DONE returns machine to idle with status done', () => {
    const actor = startMachine();
    actor.send({ type: 'DRAG_FILES_ENTER' });
    expect(actor.getSnapshot().value).toBe('dragOverFiles');
    actor.send({ type: 'DROP_FILES' });
    expect(actor.getSnapshot().value).toBe('importingFiles');
    actor.send({ type: 'IMPORT_DONE' });
    expect(actor.getSnapshot().value).toBe('idle');
    expect(actor.getSnapshot().context.importStatus).toBe('done');
    actor.stop();
  });

  it('full DnD lifecycle emits consistent import status', () => {
    const actor = startMachine();
    actor.send({ type: 'DRAG_FILES_ENTER' });
    expect(actor.getSnapshot().context.importStatus).toBe('dragOver');
    actor.send({ type: 'DROP_FILES' });
    expect(actor.getSnapshot().context.importStatus).toBe('importing');
    actor.send({ type: 'IMPORT_DONE' });
    expect(actor.getSnapshot().context.importStatus).toBe('done');
    actor.stop();
  });

  it('IMPORT_FAILED sets status to failed', () => {
    const actor = startMachine();
    actor.send({ type: 'DROP_FILES' });
    actor.send({ type: 'IMPORT_FAILED' });
    expect(actor.getSnapshot().context.importStatus).toBe('failed');
    expect(actor.getSnapshot().value).toBe('idle');
    actor.stop();
  });
});

describe('no legacy DOM/SVG gesture path in Pixi runtime (A6)', () => {
  it('PixiInteractionSystem does not import DOM gesture hooks', async () => {
    const mod = await import('@/features/canvas/infrastructure/rendering/pixi/PixiInteractionSystem.js');
    const src = Object.values(mod).join('');
    expect(src).not.toContain('useCanvasPointerDown');
    expect(src).not.toContain('useCanvasPointerMove');
    expect(src).not.toContain('useCanvasHover');
  });

  it('CanvasSurface does not render SVG brush circle for pixi backend', async () => {
    const fs = await import('fs');
    const content = fs.default.readFileSync(
      'src/features/canvas/components/CanvasSurface.jsx',
      'utf8',
    );
    expect(content).not.toMatch(/<circle[^>]*r=.*brush/i);
  });

  it('OverlayLayer only renders BoneAssignPrompt for pixi backend', async () => {
    const fs = await import('fs');
    const content = fs.default.readFileSync(
      'src/features/canvas/components/OverlayLayer.jsx',
      'utf8',
    );
    expect(content).not.toContain('MarqueeOverlay');
    expect(content).not.toContain('DrawBoneOverlay');
    expect(content).not.toContain('WeightPaintOverlay');
    expect(content).not.toContain('HoverOverlay');
    expect(content).not.toContain('GizmoOverlay');
  });

  it('CanvasSurface does not have pointer gesture handlers for canvas element', async () => {
    const fs = await import('fs');
    const content = fs.default.readFileSync(
      'src/features/canvas/components/CanvasSurface.jsx',
      'utf8',
    );
    expect(content).not.toMatch(/onPointerDown.*canvas/i);
    expect(content).not.toMatch(/pointerdown.*canvas/i);
  });
});

describe('pixiPerformanceMetrics integration', () => {
  it('PixiRuntimeStats contract is satisfied by snapshotStats', async () => {
    const { createPixiRuntimeStats } = await import(
      '@/features/canvas/domain/pixiRuntimeContracts.js'
    );
    const counters = createPerformanceCounters();
    incrementCounter(counters, 'pointerEventsHandled', 10);
    incrementCounter(counters, 'renderCount', 5);
    incrementCounter(counters, 'gpuUploadCount', 3);
    recordTiming(counters, 'renderTotalMs', 50);

    const stats = snapshotStats(counters);
    const defaultStats = createPixiRuntimeStats();
    expect(Object.keys(stats).sort()).toEqual(Object.keys(defaultStats).sort());
    expect(stats.pointerEventsHandled).toBe(10);
    expect(stats.renderCount).toBe(5);
    expect(stats.gpuUploadCount).toBe(3);
    expect(stats.lastFrameDurationMs).toBe(10);
  });

  it('performance metrics module does not import React, Zustand, DOM', async () => {
    const mod = await import('@/features/canvas/domain/pixiPerformanceMetrics.js');
    const src = Object.values(mod).join('');
    expect(src).not.toContain('useEditorStore');
    expect(src).not.toContain('useProjectStore');
    expect(src).not.toContain('document');
    expect(src).not.toContain('window');
  });
});

describe('Stage 03 lifecycle regression', () => {
  beforeEach(() => resetProject());

  it('gesture start → update → commit uses same workflow actor', () => {
    const actor = startMachine();
    actor.send({ type: 'SET_TOOL', tool: 'select' });
    actor.send({ type: 'START_TRANSFORM_DRAG', payload: { mode: 'move', nodeId: 'n1' } });
    const s1 = actor.getSnapshot();
    actor.send({ type: 'MOVE_GESTURE', payload: { clientX: 10, clientY: 20 } });
    const s2 = actor.getSnapshot();
    actor.send({ type: 'COMMIT_GESTURE' });
    expect(s1.context.activeSession).not.toBeNull();
    expect(s2.context.activeSession).not.toBeNull();
    expect(s2.context.activeSession.kind).toBe('dragZoom');
    expect(actor.getSnapshot().value).toBe('idle');
    actor.stop();
  });

  it('cancel clears session, batch, and preview/snapshot', () => {
    const actor = startMachine();
    actor.send({ type: 'START_MESH_BRUSH', payload: { partId: 'p1', mode: 'deform' } });
    expect(actor.getSnapshot().value).toBe('editingMesh');
    expect(actor.getSnapshot().context.activeSession).not.toBeNull();

    actor.send({ type: 'CANCEL_GESTURE' });
    expect(actor.getSnapshot().value).toBe('idle');
    expect(actor.getSnapshot().context.activeSession).toBeNull();
    expect(undoCount()).toBe(0);
    actor.stop();
  });

  it('dispose clears batch, preview, and viewport drag', () => {
    const graphicsInstances = [];
    function createMockGraphics() {
      const g = {
        position: { set: vi.fn() },
        fill: vi.fn(() => g),
        circle: vi.fn(() => g),
        poly: vi.fn(() => g),
        on: vi.fn(),
        off: vi.fn(),
        destroy: vi.fn(),
        parent: null,
        eventMode: 'passive',
        cursor: null,
      };
      graphicsInstances.push(g);
      return g;
    }
    vi.doMock('pixi.js', () => ({
      Graphics: vi.fn(function Graphics() { return createMockGraphics(); }),
    }));

    return import('@/features/canvas/infrastructure/rendering/pixi/PixiInteractionSystem.js').then(({ PixiInteractionSystem }) => {
      const resumeMock = vi.fn();
      const adapter = new PixiInteractionSystem({
        viewportBridge: {},
        overlayLayer: { addChild: vi.fn(), removeChild: vi.fn() },
        projectRef: { current: { nodes: [] } },
        editorRef: { current: { selection: [], view: { zoom: 1 } } },
        animationRef: { current: {} },
        updateProject: vi.fn(),
        setSelection: vi.fn(),
        markDirty: vi.fn(),
        workflowActor: { send: vi.fn() },
        executeCommand: vi.fn(),
      });
      adapter._viewportDragPaused = true;
      adapter.viewportBridge = { viewport: { plugins: { resume: resumeMock } } };
      adapter._setPreviewPose('node1', { x: 5 });
      adapter._dragState = { type: 'move' };
      adapter._pendingDragEvent = { type: 'move' };

      adapter.dispose();

      expect(adapter._dragState).toBeNull();
      expect(adapter._previewPoseOverrides.size).toBe(0);
      expect(adapter._pendingDragEvent).toBeNull();
      expect(adapter._workflowActor).toBeNull();
      expect(resumeMock).toHaveBeenCalledWith('drag');

      vi.doUnmock('pixi.js');
      vi.resetModules();
    });
  });

  it('import/capture/picking work without backendKind', async () => {
    const { useCanvasCapture } = await import('@/features/canvas/application/useCanvasCapture.js');
    expect(typeof useCanvasCapture).toBe('function');
    const src = useCanvasCapture.toString();
    expect(src).not.toContain('backendKind');
    expect(src).not.toContain('isPixi');
  });

  it('picking works without backendKind', async () => {
    const { useCanvasPicking } = await import('@/features/canvas/application/useCanvasPicking.js');
    expect(typeof useCanvasPicking).toBe('function');
    const src = useCanvasPicking.toString();
    expect(src).not.toContain('backendKind');
  });

  it('input hook works without backendKind', async () => {
    const src = await import('@/features/canvas/application/useCanvasInput.js');
    expect(typeof src.useCanvasInput).toBe('function');
    const fnSrc = src.useCanvasInput.toString();
    expect(fnSrc).not.toContain('backendKind');
  }, 15_000);

  it('PixiInteractionSystem requires workflowActor and executeCommand', () => {
    return import('@/features/canvas/infrastructure/rendering/pixi/PixiInteractionSystem.js').then(({ PixiInteractionSystem }) => {
      expect(() => new PixiInteractionSystem({
        viewportBridge: {}, overlayLayer: { addChild: vi.fn(), removeChild: vi.fn() },
        projectRef: { current: { nodes: [] } }, editorRef: { current: { selection: [], view: { zoom: 1 } } },
        animationRef: { current: {} }, updateProject: vi.fn(), setSelection: vi.fn(), markDirty: vi.fn(),
      })).toThrow('PixiInteractionSystem requires a workflowActor');
    });
  });
});
