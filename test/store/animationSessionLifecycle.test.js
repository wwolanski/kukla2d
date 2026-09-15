import { beforeEach, describe, expect, it } from 'vitest';
import { useAnimationStore } from '@/store/animationStore';
import { clearHistory, undo, applyPatches } from '@/store/undoHistory';
import { useProjectStore } from '@/store/projectStore';
import { createTimelineCommandApi } from '@/features/timeline';

function resetStores() {
  clearHistory();
  useAnimationStore.getState().resetPlayback();
  useProjectStore.getState().resetProject();
}

describe('animation session lifecycle', () => {
  beforeEach(() => {
    resetStores();
  });

  describe('create clip syncs runtime', () => {
    it('creates first clip and selects it in runtime', () => {
      const commands = createTimelineCommandApi();
      const id = commands.ensureAnimationClip();

      expect(useAnimationStore.getState().activeAnimationId).toBe(id);
      expect(useAnimationStore.getState().fps).toBe(24);
      expect(useAnimationStore.getState().endFrame).toBe(48);
    });

    it('creates clip with custom timing', () => {
      const commands = createTimelineCommandApi();
      commands.createAnimationClip({
        animationId: 'anim-1',
        durationMs: 1000,
        fps: 30,
      });

      expect(useAnimationStore.getState().activeAnimationId).toBe('anim-1');
      expect(useAnimationStore.getState().fps).toBe(30);
      expect(useAnimationStore.getState().endFrame).toBe(30);
    });
  });

  describe('select clip syncs runtime', () => {
    it('switches to another clip', () => {
      const commands = createTimelineCommandApi();
      commands.createAnimationClip({ animationId: 'a1', durationMs: 1000, fps: 24 });
      commands.createAnimationClip({ animationId: 'a2', durationMs: 2000, fps: 30 });

      commands.selectAnimationClip('a2');

      expect(useAnimationStore.getState().activeAnimationId).toBe('a2');
      expect(useProjectStore.getState().project.lastActiveAnimationId).toBe('a2');
      expect(useAnimationStore.getState().fps).toBe(30);
      expect(useAnimationStore.getState().endFrame).toBe(60);
    });

    it('resets to idle when selecting nonexistent clip', () => {
      const commands = createTimelineCommandApi();
      commands.createAnimationClip({ animationId: 'a1', durationMs: 1000, fps: 24 });

      commands.selectAnimationClip('nonexistent');

      expect(useAnimationStore.getState().activeAnimationId).toBeNull();
      expect(useProjectStore.getState().project.lastActiveAnimationId).toBeNull();
    });
  });

  describe('delete clip syncs runtime', () => {
    it('selects remaining clip after deleting active', () => {
      const commands = createTimelineCommandApi();
      commands.createAnimationClip({ animationId: 'a1', durationMs: 1000, fps: 24 });
      commands.createAnimationClip({ animationId: 'a2', durationMs: 2000, fps: 30 });
      commands.selectAnimationClip('a1');

      commands.deleteAnimationClip('a1');

      expect(useAnimationStore.getState().activeAnimationId).toBe('a2');
      expect(useAnimationStore.getState().fps).toBe(30);
    });

    it('resets to idle when deleting last clip', () => {
      const commands = createTimelineCommandApi();
      commands.createAnimationClip({ animationId: 'a1', durationMs: 1000, fps: 24 });

      commands.deleteAnimationClip('a1');

      expect(useAnimationStore.getState().activeAnimationId).toBeNull();
      expect(useProjectStore.getState().project.lastActiveAnimationId).toBeNull();
    });
  });

  describe('timing changes sync runtime', () => {
    it('syncs fps and endFrame after timing update', () => {
      const commands = createTimelineCommandApi();
      commands.createAnimationClip({ animationId: 'a1', durationMs: 1000, fps: 24 });

      commands.updateAnimationTiming({
        animationId: 'a1',
        durationMs: 2000,
        fps: 60,
      });

      expect(useAnimationStore.getState().fps).toBe(60);
      expect(useAnimationStore.getState().endFrame).toBe(120);
    });

    it('no-op timing does not change runtime', () => {
      const commands = createTimelineCommandApi();
      commands.createAnimationClip({ animationId: 'a1', durationMs: 1000, fps: 24 });
      const beforeFps = useAnimationStore.getState().fps;

      const result = commands.updateAnimationTiming({
        animationId: 'nonexistent',
        durationMs: 5000,
        fps: 120,
      });

      expect(result.changed).toBe(false);
      expect(useAnimationStore.getState().fps).toBe(beforeFps);
    });
  });

  describe('load project reconciles session', () => {
    it('keeps active clip if it exists in loaded project', () => {
      const commands = createTimelineCommandApi();
      commands.createAnimationClip({ animationId: 'a1', durationMs: 1000, fps: 24 });
      commands.createAnimationClip({ animationId: 'a2', durationMs: 2000, fps: 30 });
      commands.selectAnimationClip('a2');

      const project = useProjectStore.getState().project;
      useProjectStore.getState().loadProject(project);

      expect(useAnimationStore.getState().activeAnimationId).toBe('a2');
      expect(useAnimationStore.getState().fps).toBe(30);
    });

    it('selects first clip when active clip missing from loaded project', () => {
      const commands = createTimelineCommandApi();
      commands.createAnimationClip({ animationId: 'a1', durationMs: 1000, fps: 24 });
      commands.selectAnimationClip('a1');

      useProjectStore.getState().loadProject({
        version: 5,
        canvas: {},
        textures: [],
        nodes: [],
        animations: [
          { id: 'b1', name: 'Other', duration: 500, fps: 12, tracks: [], audioTracks: [] },
        ],
      });

      expect(useAnimationStore.getState().activeAnimationId).toBe('b1');
      expect(useAnimationStore.getState().fps).toBe(12);
    });

    it('reconciles to idle when loading empty project', () => {
      const commands = createTimelineCommandApi();
      commands.createAnimationClip({ animationId: 'a1', durationMs: 1000, fps: 24 });

      useProjectStore.getState().loadProject({
        version: 5,
        canvas: {},
        textures: [],
        nodes: [],
        animations: [],
      });

      expect(useAnimationStore.getState().activeAnimationId).toBeNull();
    });
  });

  describe('undo reconciles session', () => {
    it('restores project after undo of delete, keeps runtime consistent', () => {
      const commands = createTimelineCommandApi();
      commands.createAnimationClip({ animationId: 'a1', durationMs: 1000, fps: 24 });
      commands.createAnimationClip({ animationId: 'a2', durationMs: 2000, fps: 30 });
      commands.selectAnimationClip('a1');

      commands.deleteAnimationClip('a1');
      expect(useAnimationStore.getState().activeAnimationId).toBe('a2');

      const stateSnapshot = { ...useProjectStore.getState() };
      undo((inversePatches) => {
        const restored = applyPatches(stateSnapshot, inversePatches);
        useProjectStore.getState().restoreProject(restored);
      });

      expect(useProjectStore.getState().project.animations).toHaveLength(2);
      expect(useAnimationStore.getState().activeAnimationId).toBe('a2');
    });

    it('restores runtime timing after undo of timing change', () => {
      const commands = createTimelineCommandApi();
      commands.createAnimationClip({ animationId: 'a1', durationMs: 1000, fps: 24 });

      commands.updateAnimationTiming({
        animationId: 'a1',
        durationMs: 2000,
        fps: 60,
      });
      expect(useAnimationStore.getState().fps).toBe(60);

      const stateSnapshot = { ...useProjectStore.getState() };
      undo((inversePatches) => {
        const restored = applyPatches(stateSnapshot, inversePatches);
        useProjectStore.getState().restoreProject(restored);
      });

      expect(useAnimationStore.getState().fps).toBe(24);
      expect(useAnimationStore.getState().endFrame).toBe(24);
    });

    it('reconciles to idle after undo restores empty project', () => {
      const commands = createTimelineCommandApi();
      commands.createAnimationClip({ animationId: 'a1', durationMs: 1000, fps: 24 });

      const stateSnapshot = { ...useProjectStore.getState() };
      undo((inversePatches) => {
        const restored = applyPatches(stateSnapshot, inversePatches);
        useProjectStore.getState().restoreProject(restored);
      });

      expect(useProjectStore.getState().project.animations).toHaveLength(0);
      expect(useAnimationStore.getState().activeAnimationId).toBeNull();
    });
  });

  describe('empty project idle state', () => {
    it('session is idle after reset', () => {
      useAnimationStore.getState().resetPlayback();
      expect(useAnimationStore.getState().activeAnimationId).toBeNull();
      expect(useAnimationStore.getState().isPlaying).toBe(false);
    });
  });
});
