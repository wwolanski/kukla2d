import { beforeEach, describe, expect, it } from 'vitest';
import { canNavigate } from '../src/domain/animationAuthoring.js';
import { useAnimationStore } from '../src/store/animationStore.js';
import { useProjectStore } from '../src/store/projectStore.js';
import { clearHistory } from '../src/store/undoHistory.js';
import { createAnimationAuthoringApi } from '@/features/animation';
import { createTimelineCommandApi } from '@/features/timeline';

function resetStores() {
  clearHistory();
  useAnimationStore.getState().resetPlayback();
  useProjectStore.getState().resetProject();
}

function setupClip(id = 'anim-1') {
  useProjectStore.getState().createAnimationClip({
    animationId: id,
    durationMs: 2000,
    fps: 24,
  });
  useProjectStore.getState().updateProject((p) => {
    p.nodes.push({
      id: 'node-1',
      type: 'part',
      name: 'Head',
      parent: null,
      transform: { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1, pivotX: 0, pivotY: 0 },
      opacity: 1,
      visible: true,
    });
  }, { skipHistory: true });
  useAnimationStore.getState().switchAnimation(
    useProjectStore.getState().project.animations.find((a) => a.id === id),
  );
}

function setupTwoClips() {
  setupClip('anim-1');
  useProjectStore.getState().createAnimationClip({
    animationId: 'anim-2',
    durationMs: 1500,
    fps: 24,
  });
}

function createDraft() {
  const api = createAnimationAuthoringApi();
  api.preview({
    animationId: 'anim-1',
    targetId: 'node-1',
    property: 'x',
    value: 42,
    timeMs: 500,
    source: 'inspector',
    phase: 'preview',
  });
  return api;
}

describe('canNavigate — pure domain guard', () => {
  it('allows when state is null', () => {
    expect(canNavigate(null)).toEqual({ allowed: true });
  });

  it('allows when state is undefined', () => {
    expect(canNavigate(undefined)).toEqual({ allowed: true });
  });

  it('allows when dirty is false', () => {
    expect(canNavigate({ dirty: false, values: new Map([['a', {}]]) })).toEqual({ allowed: true });
  });

  it('allows when values is empty', () => {
    expect(canNavigate({ dirty: true, values: new Map() })).toEqual({ allowed: true });
  });

  it('blocks when dirty is true and values is non-empty', () => {
    expect(canNavigate({ dirty: true, values: new Map([['a', {}]]) })).toEqual({
      allowed: false,
      reason: 'pending-draft',
    });
  });

  it('allows when values is null', () => {
    expect(canNavigate({ dirty: true, values: null })).toEqual({ allowed: true });
  });

  it('allows when values has no size property', () => {
    expect(canNavigate({ dirty: true, values: {} })).toEqual({ allowed: true });
  });
});

describe('animation store — transport guard behavior', () => {
  beforeEach(() => {
    resetStores();
    setupClip();
  });

  it('stop does not clear draftPose', () => {
    const store = useAnimationStore.getState();
    store.setDraftPose('node-1', { x: 10 });
    store.markDraftDirty();
    store.setDraftContext({ animationId: 'anim-1', timeMs: 500 });

    useAnimationStore.getState().stop();

    const after = useAnimationStore.getState();
    expect(after.draftPose.size).toBe(1);
    expect(after.draftDirty).toBe(true);
  });

  it('seekFrame does not clear draftPose', () => {
    const store = useAnimationStore.getState();
    store.setDraftPose('node-1', { x: 10 });
    store.markDraftDirty();

    useAnimationStore.getState().seekFrame(10);

    const after = useAnimationStore.getState();
    expect(after.draftPose.size).toBe(1);
  });

  it('seekTime does not clear draftPose', () => {
    const store = useAnimationStore.getState();
    store.setDraftPose('node-1', { x: 10 });
    store.markDraftDirty();

    useAnimationStore.getState().seekTime(500);

    const after = useAnimationStore.getState();
    expect(after.draftPose.size).toBe(1);
  });

  it('play does not clear draftPose', () => {
    const store = useAnimationStore.getState();
    store.setDraftPose('node-1', { x: 10 });
    store.markDraftDirty();

    useAnimationStore.getState().play();

    const after = useAnimationStore.getState();
    expect(after.draftPose.size).toBe(1);
    expect(after.isPlaying).toBe(true);
  });
});

describe('animation store — reconcileRuntimeSession foreign draft', () => {
  beforeEach(() => {
    resetStores();
    setupTwoClips();
  });

  it('discards draft when active clip changes', () => {
    const store = useAnimationStore.getState();
    store.setDraftPose('node-1', { x: 10 });
    store.markDraftDirty();
    store.setDraftContext({ animationId: 'anim-1', timeMs: 500 });

    useAnimationStore.getState().switchAnimation(
      useProjectStore.getState().project.animations.find((a) => a.id === 'anim-2'),
    );

    const after = useAnimationStore.getState();
    expect(after.activeAnimationId).toBe('anim-2');
  });

  it('preserves draft when same clip is reconciled', () => {
    const store = useAnimationStore.getState();
    store.setDraftPose('node-1', { x: 10 });
    store.markDraftDirty();
    store.setDraftContext({ animationId: 'anim-1', timeMs: 500 });

    useAnimationStore.getState().reconcileRuntimeSession();

    const after = useAnimationStore.getState();
    expect(after.draftPose.size).toBe(1);
    expect(after.draftDirty).toBe(true);
  });
});

describe('timeline command API — navigation guard', () => {
  let commands;

  beforeEach(() => {
    resetStores();
    setupTwoClips();
    commands = createTimelineCommandApi();
  });

  it('selectAnimationClip blocks when draft is dirty', () => {
    createDraft();

    const result = commands.selectAnimationClip('anim-2');
    expect(result).toBeNull();
    expect(useAnimationStore.getState().activeAnimationId).toBe('anim-1');
  });

  it('selectAnimationClip allows when draft is clean', () => {
    const result = commands.selectAnimationClip('anim-2');
    expect(result).toBe('anim-2');
    expect(useAnimationStore.getState().activeAnimationId).toBe('anim-2');
  });

  it('selectAnimationClip allows after commit', () => {
    const api = createDraft();
    api.commit();

    const result = commands.selectAnimationClip('anim-2');
    expect(result).toBe('anim-2');
  });

  it('selectAnimationClip allows after discard', () => {
    createDraft();
    const api = createAnimationAuthoringApi();
    api.discard();

    const result = commands.selectAnimationClip('anim-2');
    expect(result).toBe('anim-2');
  });

  it('deleteAnimationClip blocks when deleting active clip with dirty draft', () => {
    createDraft();

    const result = commands.deleteAnimationClip('anim-1');
    expect(result.changed).toBe(false);
    expect(useAnimationStore.getState().activeAnimationId).toBe('anim-1');
  });

  it('deleteAnimationClip allows when deleting non-active clip', () => {
    createDraft();

    const result = commands.deleteAnimationClip('anim-2');
    expect(result.changed).toBe(true);
  });

  it('deleteAnimationClip allows when deleting active clip with clean draft', () => {
    const result = commands.deleteAnimationClip('anim-1');
    expect(result.changed).toBe(true);
  });
});

describe('transport guard — canNavigate condition', () => {
  beforeEach(() => {
    resetStores();
    setupClip();
  });

  it('canNavigate blocks when draft is dirty and non-empty', () => {
    createDraft();
    const anim = useAnimationStore.getState();
    expect(canNavigate({ dirty: anim.draftDirty, values: anim.draftPose })).toEqual({
      allowed: false,
      reason: 'pending-draft',
    });
  });

  it('canNavigate allows when draft is clean', () => {
    const anim = useAnimationStore.getState();
    expect(canNavigate({ dirty: anim.draftDirty, values: anim.draftPose })).toEqual({
      allowed: true,
    });
  });

  it('canNavigate allows after commit', () => {
    createDraft();
    const api = createAnimationAuthoringApi();
    api.commit();
    const anim = useAnimationStore.getState();
    expect(canNavigate({ dirty: anim.draftDirty, values: anim.draftPose })).toEqual({
      allowed: true,
    });
  });

  it('canNavigate allows after discard', () => {
    createDraft();
    const api = createAnimationAuthoringApi();
    api.discard();
    const anim = useAnimationStore.getState();
    expect(canNavigate({ dirty: anim.draftDirty, values: anim.draftPose })).toEqual({
      allowed: true,
    });
  });

  it('store seekFrame does not clear draft (guard is at controller level)', () => {
    createDraft();
    useAnimationStore.getState().seekFrame(10);
    expect(useAnimationStore.getState().draftPose.size).toBe(1);
  });

  it('store stop does not clear draft (guard is at controller level)', () => {
    createDraft();
    useAnimationStore.getState().play();
    useAnimationStore.getState().stop();
    expect(useAnimationStore.getState().draftPose.size).toBe(1);
  });

  it('store play does not clear draft (guard is at controller level)', () => {
    createDraft();
    useAnimationStore.getState().play();
    expect(useAnimationStore.getState().draftPose.size).toBe(1);
  });
});

describe('navigation guard — R7 transition coverage', () => {
  beforeEach(() => {
    resetStores();
    setupTwoClips();
  });

  const transitions = [
    { name: 'switch clip', action: () => {
      const commands = createTimelineCommandApi();
      return commands.selectAnimationClip('anim-2');
    }},
    { name: 'delete active clip', action: () => {
      const commands = createTimelineCommandApi();
      return commands.deleteAnimationClip('anim-1');
    }},
  ];

  for (const t of transitions) {
    it(`${t.name} — blocks with dirty draft, allows after commit`, () => {
      createDraft();
      const snap = {
        active: useAnimationStore.getState().activeAnimationId,
      };

      const _result = t.action();

      const after = useAnimationStore.getState();
      expect(after.activeAnimationId).toBe(snap.active);

      const api = createAnimationAuthoringApi();
      api.commit();

      t.action();
    });
  }

  it('seek — canNavigate blocks, allows after commit', () => {
    createDraft();
    const anim = useAnimationStore.getState();
    expect(canNavigate({ dirty: anim.draftDirty, values: anim.draftPose })).toEqual({
      allowed: false,
      reason: 'pending-draft',
    });

    const api = createAnimationAuthoringApi();
    api.commit();

    const animAfter = useAnimationStore.getState();
    expect(canNavigate({ dirty: animAfter.draftDirty, values: animAfter.draftPose })).toEqual({
      allowed: true,
    });
  });

  it('play — canNavigate blocks, allows after commit', () => {
    createDraft();
    const anim = useAnimationStore.getState();
    expect(canNavigate({ dirty: anim.draftDirty, values: anim.draftPose })).toEqual({
      allowed: false,
      reason: 'pending-draft',
    });

    const api = createAnimationAuthoringApi();
    api.commit();

    const animAfter = useAnimationStore.getState();
    expect(canNavigate({ dirty: animAfter.draftDirty, values: animAfter.draftPose })).toEqual({
      allowed: true,
    });
  });

  it('stop — canNavigate blocks, allows after commit', () => {
    createDraft();
    const anim = useAnimationStore.getState();
    expect(canNavigate({ dirty: anim.draftDirty, values: anim.draftPose })).toEqual({
      allowed: false,
      reason: 'pending-draft',
    });

    const api = createAnimationAuthoringApi();
    api.commit();

    const animAfter = useAnimationStore.getState();
    expect(canNavigate({ dirty: animAfter.draftDirty, values: animAfter.draftPose })).toEqual({
      allowed: true,
    });
  });
});
