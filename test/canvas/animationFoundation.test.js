import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createTimelineCommandApi } from '@/features/timeline';
import { useProjectStore } from '@/store/projectStore';
import { useAnimationStore } from '@/store/animationStore';
import {
  applyPatches,
  clearHistory,
  peekUndo,
  undo,
  undoCount,
} from '@/store/undoHistory';
import { evaluateEditorFramePose } from '@/features/canvas/application/evaluateEditorFramePose.js';
import { PixiSceneGateway } from '@/features/canvas/infrastructure/rendering/pixi/PixiSceneGateway.js';

function resetState() {
  clearHistory();
  useAnimationStore.getState().resetPlayback();
  useProjectStore.getState().resetProject();
}

describe('animation foundation integration', () => {
  beforeEach(() => {
    resetState();
  });

  it('flows command -> patch history -> session tick -> frame evaluation -> renderer sink without document mutation', () => {
    useProjectStore.getState().updateProject((project) => {
      project.nodes.push({
        id: 'node-1',
        type: 'part',
        name: 'Node 1',
        parent: null,
        transform: {
          x: 0,
          y: 0,
          rotation: 0,
          scaleX: 1,
          scaleY: 1,
          pivotX: 0,
          pivotY: 0,
        },
        opacity: 1,
        visible: true,
      });
    }, { skipHistory: true });

    const commands = createTimelineCommandApi();

    commands.createAnimationClip({
      animationId: 'anim-1',
      name: 'Walk',
      durationMs: 1000,
      fps: 10,
    });
    commands.upsertAnimationKeyframe({
      animationId: 'anim-1',
      targetId: 'node-1',
      property: 'x',
      timeMs: 0,
      value: 0,
      easing: 'linear',
    });
    commands.upsertAnimationKeyframe({
      animationId: 'anim-1',
      targetId: 'node-1',
      property: 'x',
      timeMs: 1000,
      value: 100,
      easing: 'linear',
    });

    expect(undoCount()).toBe(3);
    expect(peekUndo()).toMatchObject({ name: 'Upsert Animation Keyframe', type: 'timeline' });
    expect(useAnimationStore.getState().activeAnimationId).toBe('anim-1');

    const documentBeforeRuntime = JSON.stringify(useProjectStore.getState().project);

    const animationStore = useAnimationStore.getState();
    animationStore.play();
    expect(animationStore.tick(1000)).toBe(false);
    expect(animationStore.tick(1500)).toBe(true);

    const physicsRuntime = {
      evaluate: vi.fn(() => ({
        active: true,
        overrides: new Map([['node-1', { x: 60 }]]),
      })),
    };

    const frame = evaluateEditorFramePose({
      project: useProjectStore.getState().project,
      editorState: {
        editorMode: 'animation',
        activeTool: 'pose',
      },
      animationState: useAnimationStore.getState(),
      physicsRuntime,
      timestamp: 1500,
    });

    expect(physicsRuntime.evaluate).toHaveBeenCalledTimes(1);
    expect(frame.poseOverrides.get('node-1').x).toBe(60);
    expect(frame.physicsActive).toBe(true);

    const fakeGateway = {
      app: {},
      contentLayer: {},
      frameRenderer: {
        drawFrame: vi.fn(() => true),
      },
      render: vi.fn(),
    };

    PixiSceneGateway.prototype.drawFrame.call(fakeGateway, frame, { reason: 'integration-test' });

    expect(fakeGateway.frameRenderer.drawFrame).toHaveBeenCalledWith(frame, { reason: 'integration-test' });
    expect(fakeGateway.render).toHaveBeenCalledTimes(1);

    expect(JSON.stringify(useProjectStore.getState().project)).toBe(documentBeforeRuntime);

    undo((inversePatches) => {
      const restored = applyPatches(useProjectStore.getState(), inversePatches);
      useProjectStore.getState().restoreProject(restored);
    });

    const track = useProjectStore.getState().project.animations[0].tracks[0];
    expect(track.keyframes).toEqual([
      { time: 0, value: 0, easing: 'linear' },
    ]);
  });
});
