import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useProjectStore } from '@/store/projectStore';
import { useAnimationStore } from '@/store/animationStore';
import { useEditorStore } from '@/store/editorStore';
import {
  clearHistory,
  undo,
  undoCount,
  applyPatches,
} from '@/store/undoHistory';
import { createTimelineCommandApi } from '@/features/timeline';
import { createAnimationAuthoringApi } from '@/features/animation';
import { evaluateEditorFramePose } from '@/features/canvas/application/evaluateEditorFramePose.js';
import { computePoseOverrides, evaluateAnimationPose } from '@/domain/animationEngine.js';
import { PixiSceneGateway } from '@/features/canvas/infrastructure/rendering/pixi/PixiSceneGateway.js';

function resetState() {
  clearHistory();
  useAnimationStore.getState().resetPlayback();
  useProjectStore.getState().resetProject();
  useEditorStore.setState({ editorMode: 'staging', autoKeyframe: true, selection: [] });
}

function enterAnimationMode() {
  useEditorStore.setState({ editorMode: 'animation' });
  useAnimationStore.getState().captureRestPose(
    useProjectStore.getState().project.nodes,
  );
}

function makeProjectWithNode(nodeOverrides = {}) {
  resetState();
  useProjectStore.getState().updateProject((project) => {
    project.nodes.push({
      id: 'node-1',
      type: 'part',
      name: 'Node 1',
      parent: null,
      transform: { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1, pivotX: 0, pivotY: 0 },
      opacity: 1,
      visible: true,
      ...nodeOverrides,
    });
  }, { skipHistory: true });
}

function makeProjectFull() {
  resetState();
  useProjectStore.getState().updateProject((project) => {
    project.nodes.push({
      id: 'node-1',
      type: 'part',
      name: 'Head',
      parent: null,
      transform: { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1, pivotX: 0, pivotY: 0 },
      opacity: 1,
      visible: true,
      mesh: {
        geometry: {
          vertices: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 0, y: 10 }],
          uvs: [0, 0, 1, 0, 0, 1, 1, 1],
          indices: [0, 1, 2, 1, 3, 2],
        },
        uvs: new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]),
        edgeIndices: new Uint16Array([0, 1, 1, 2]),
      },
      blendShapes: [{ id: 'smile', deltas: [{ dx: 2, dy: 1 }, { dx: -1, dy: 2 }, { dx: 1, dy: -1 }] }],
      blendShapeValues: { smile: 0 },
      drawOrder: 0,
    });
    project.nodes.push({
      id: 'node-2',
      type: 'part',
      name: 'Eye',
      parent: null,
      transform: { x: 5, y: 5, rotation: 0, scaleX: 1, scaleY: 1, pivotX: 0, pivotY: 0 },
      opacity: 0.8,
      visible: true,
      drawOrder: 1,
    });
    project.bones.push({
      id: 'bone-1',
      name: 'Spine',
      parentId: null,
      setup: { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1, pivotX: 0, pivotY: 0 },
    });
    project.constraints.push({
      id: 'ik-1',
      name: 'IK Arm',
      targetX: 0,
      targetY: 0,
      mix: 1,
      fkIk: 0,
      bendPositive: true,
      order: 0,
    });
  }, { skipHistory: true });
}

function createClipWithKeyframes() {
  const commands = createTimelineCommandApi();
  commands.createAnimationClip({
    animationId: 'anim-1',
    name: 'Walk',
    durationMs: 2000,
    fps: 24,
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
    timeMs: 2000,
    value: 100,
    easing: 'linear',
  });
  return commands;
}

describe('A1: auto-key inspector edit → keyframe → canvas → undo', () => {
  beforeEach(resetState);

  it('inspector commit creates keyframe and undo reverts', () => {
    makeProjectWithNode();
    createClipWithKeyframes();
    enterAnimationMode();

    const api = createAnimationAuthoringApi();
    api.preview({
      animationId: 'anim-1',
      targetId: 'node-1',
      property: 'x',
      value: 50,
      timeMs: 1000,
      source: 'inspector',
      phase: 'preview',
    });
    const commitResult = api.commit({ source: 'auto-key' });

    expect(commitResult.changed).toBe(true);
    expect(commitResult.committedAddresses).toContain('node-1::x@1000');

    const clip = useProjectStore.getState().project.animations[0];
    const track = clip.tracks.find(t => t.targetId === 'node-1' && t.property === 'x');
    expect(track).toBeDefined();
    const kf1000 = track.keyframes.find(k => k.time === 1000);
    expect(kf1000?.value).toBe(50);

    const overrides = computePoseOverrides(clip, 1000);
    expect(overrides.get('node-1')?.x).toBe(50);

    useAnimationStore.getState().seekTime(1000);

    const frame = evaluateEditorFramePose({
      project: useProjectStore.getState().project,
      editorState: { editorMode: 'animation', activeTool: 'pose' },
      animationState: useAnimationStore.getState(),
      physicsRuntime: null,
      timestamp: 1000,
    });
    const headNode = frame.effectiveNodes.find(n => n.id === 'node-1');
    expect(headNode.transform.x).toBe(50);

    undo((patches) => {
      const restored = applyPatches(useProjectStore.getState(), patches);
      useProjectStore.getState().restoreProject(restored);
    });

    const clipAfterUndo = useProjectStore.getState().project.animations[0];
    const trackAfter = clipAfterUndo.tracks.find(t => t.targetId === 'node-1' && t.property === 'x');
    expect(trackAfter.keyframes).toHaveLength(2);
    expect(trackAfter.keyframes.find(k => k.time === 1000)).toBeUndefined();
  });

  it('undo restores full intent (baseline + key)', () => {
    makeProjectWithNode();
    createClipWithKeyframes();
    enterAnimationMode();

    const api = createAnimationAuthoringApi();
    api.preview({
      animationId: 'anim-1',
      targetId: 'node-1',
      property: 'y',
      value: 30,
      timeMs: 500,
      source: 'canvas',
      phase: 'preview',
    });
    api.commit({ source: 'auto-key' });

    const clip = useProjectStore.getState().project.animations[0];
    const trackY = clip.tracks.find(t => t.targetId === 'node-1' && t.property === 'y');
    expect(trackY).toBeDefined();
    expect(trackY.keyframes).toHaveLength(2);

    undo((patches) => {
      const restored = applyPatches(useProjectStore.getState(), patches);
      useProjectStore.getState().restoreProject(restored);
    });

    const clipAfter = useProjectStore.getState().project.animations[0];
    const trackYAfter = clipAfter.tracks.find(t => t.targetId === 'node-1' && t.property === 'y');
    expect(trackYAfter).toBeUndefined();
  });
});

describe('A2: navigation guard blocks seek/play/stop/switch with pending draft', () => {
  beforeEach(resetState);

  it('pending draft blocks navigation and commit/discard clears', () => {
    makeProjectWithNode();
    createClipWithKeyframes();
    enterAnimationMode();

    const api = createAnimationAuthoringApi();
    api.preview({
      animationId: 'anim-1',
      targetId: 'node-1',
      property: 'x',
      value: 50,
      timeMs: 500,
      source: 'inspector',
      phase: 'preview',
    });

    expect(api.checkNavigation()).toEqual({ allowed: false, reason: 'pending-draft' });

    useAnimationStore.getState().play();
    expect(useAnimationStore.getState().isPlaying).toBe(true);
    useAnimationStore.getState().stop();
    expect(useAnimationStore.getState().isPlaying).toBe(false);

    expect(api.checkNavigation().allowed).toBe(false);

    api.commit({ source: 'auto-key' });
    expect(api.checkNavigation()).toEqual({ allowed: true });
  });

  it('discard clears draft and allows navigation', () => {
    makeProjectWithNode();
    createClipWithKeyframes();
    enterAnimationMode();

    const api = createAnimationAuthoringApi();
    api.preview({
      animationId: 'anim-1',
      targetId: 'node-1',
      property: 'x',
      value: 99,
      timeMs: 500,
      source: 'canvas',
      phase: 'preview',
    });

    expect(api.checkNavigation().allowed).toBe(false);
    api.discard();
    expect(api.checkNavigation()).toEqual({ allowed: true });

    const clip = useProjectStore.getState().project.animations[0];
    const track = clip.tracks.find(t => t.targetId === 'node-1' && t.property === 'x');
    expect(track.keyframes.find(k => k.time === 500)).toBeUndefined();
  });
});

describe('A3: bone/IK in animation mode does not mutate setup', () => {
  beforeEach(resetState);

  it('bone setup unchanged after animation commit', () => {
    makeProjectFull();
    createClipWithKeyframes();
    enterAnimationMode();

    const boneSetupBefore = { ...useProjectStore.getState().project.bones[0].setup };

    const api = createAnimationAuthoringApi();
    api.preview({
      animationId: 'anim-1',
      targetId: 'bone-1',
      property: 'rotation',
      value: 45,
      timeMs: 500,
      source: 'inspector',
      phase: 'preview',
    });
    api.commit({ source: 'auto-key' });

    const boneSetupAfter = useProjectStore.getState().project.bones[0].setup;
    expect(boneSetupAfter).toEqual(boneSetupBefore);

    const clip = useProjectStore.getState().project.animations[0];
    const track = clip.tracks.find(t => t.targetId === 'bone-1' && t.property === 'rotation');
    expect(track).toBeDefined();
    expect(track.keyframes.find(k => k.time === 500)?.value).toBe(45);
  });

  it('IK constraint setup unchanged after animation commit', () => {
    makeProjectFull();
    createClipWithKeyframes();
    enterAnimationMode();

    const ikBefore = { ...useProjectStore.getState().project.constraints[0] };
    delete ikBefore.id;

    const api = createAnimationAuthoringApi();
    api.preview({
      animationId: 'anim-1',
      targetId: 'ik-1',
      property: 'targetX',
      value: 10,
      timeMs: 500,
      source: 'inspector',
      phase: 'preview',
    });
    api.commit({ source: 'auto-key' });

    const ikAfter = { ...useProjectStore.getState().project.constraints[0] };
    delete ikAfter.id;
    expect(ikAfter.targetX).toBe(ikBefore.targetX);
    expect(ikAfter.targetY).toBe(ikBefore.targetY);
  });
});

describe('A4: mesh/blend-shape/drawOrder keys reach Pixi frame', () => {
  beforeEach(resetState);

  it('drawOrder keyframe produces draw_order on effective node', () => {
    makeProjectFull();
    const commands = createClipWithKeyframes();
    commands.upsertAnimationKeyframe({
      animationId: 'anim-1',
      targetId: 'node-1',
      property: 'drawOrder',
      timeMs: 0,
      value: 5,
      easing: 'linear',
    });

    enterAnimationMode();
    useAnimationStore.getState().seekTime(0);

    const frame = evaluateEditorFramePose({
      project: useProjectStore.getState().project,
      editorState: { editorMode: 'animation', activeTool: 'pose' },
      animationState: useAnimationStore.getState(),
      physicsRuntime: null,
      timestamp: 0,
    });

    const headNode = frame.effectiveNodes.find(n => n.id === 'node-1');
    expect(headNode.draw_order).toBe(5);
  });

  it('blend shape keyframe interpolates blendShape value', () => {
    makeProjectFull();
    const commands = createClipWithKeyframes();
    commands.upsertAnimationKeyframe({
      animationId: 'anim-1',
      targetId: 'node-1',
      property: 'blendShape:smile',
      timeMs: 0,
      value: 0,
      easing: 'linear',
    });
    commands.upsertAnimationKeyframe({
      animationId: 'anim-1',
      targetId: 'node-1',
      property: 'blendShape:smile',
      timeMs: 1000,
      value: 1,
      easing: 'linear',
    });

    enterAnimationMode();
    useAnimationStore.getState().seekTime(500);

    const clip = useProjectStore.getState().project.animations[0];
    const pose = computePoseOverrides(clip, 500);
    expect(pose.get('node-1')?.['blendShape:smile']).toBeCloseTo(0.5, 2);
  });

  it('mesh_verts keyframe produces poseOverrides with interpolated vertices', () => {
    makeProjectFull();
    const commands = createClipWithKeyframes();
    const verts1 = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 0, y: 10 }];
    const verts2 = [{ x: 20, y: 20 }, { x: 30, y: 20 }, { x: 20, y: 30 }];
    commands.upsertAnimationKeyframe({
      animationId: 'anim-1',
      targetId: 'node-1',
      property: 'mesh_verts',
      timeMs: 0,
      value: verts1,
      easing: 'linear',
    });
    commands.upsertAnimationKeyframe({
      animationId: 'anim-1',
      targetId: 'node-1',
      property: 'mesh_verts',
      timeMs: 1000,
      value: verts2,
      easing: 'linear',
    });

    enterAnimationMode();
    useAnimationStore.getState().seekTime(500);

    const clip = useProjectStore.getState().project.animations[0];
    const pose = computePoseOverrides(clip, 500);
    expect(pose.get('node-1')?.mesh_verts[0].x).toBeCloseTo(10, 0);
    expect(pose.get('node-1')?.mesh_verts[0].y).toBeCloseTo(10, 0);

    const frame = evaluateEditorFramePose({
      project: useProjectStore.getState().project,
      editorState: { editorMode: 'animation', activeTool: 'pose' },
      animationState: useAnimationStore.getState(),
      physicsRuntime: null,
      timestamp: 500,
    });

    expect(frame.poseOverrides).toBeDefined();
    const meshOv = frame.poseOverrides.get('node-1');
    expect(meshOv).toBeDefined();
    expect(meshOv.mesh_verts[0].x).toBeCloseTo(10, 0);
    expect(meshOv.mesh_verts[0].y).toBeCloseTo(10, 0);
  });
});

describe('A5: multiple properties at same time get canonical addresses', () => {
  beforeEach(resetState);

  it('each property key has distinct canonical address', () => {
    makeProjectWithNode();
    createClipWithKeyframes();
    enterAnimationMode();

    const api = createAnimationAuthoringApi();
    api.preview({
      animationId: 'anim-1',
      targetId: 'node-1',
      property: 'x',
      value: 50,
      timeMs: 1000,
      source: 'inspector',
      phase: 'preview',
    });
    api.preview({
      animationId: 'anim-1',
      targetId: 'node-1',
      property: 'opacity',
      value: 0.5,
      timeMs: 1000,
      source: 'inspector',
      phase: 'preview',
    });
    const result = api.commit({ source: 'manual-key' });

    expect(result.committedAddresses).toContain('node-1::x@1000');
    expect(result.committedAddresses).toContain('node-1::opacity@1000');

    const clip = useProjectStore.getState().project.animations[0];
    const xTrack = clip.tracks.find(t => t.targetId === 'node-1' && t.property === 'x');
    const opTrack = clip.tracks.find(t => t.targetId === 'node-1' && t.property === 'opacity');
    expect(xTrack).toBeDefined();
    expect(opTrack).toBeDefined();
    expect(xTrack.keyframes.find(k => k.time === 1000)?.value).toBe(50);
    expect(opTrack.keyframes.find(k => k.time === 1000)?.value).toBeCloseTo(0.5, 2);
  });
});

describe('A6: collision / boundary protection', () => {
  beforeEach(resetState);

  it('upsert to occupied time updates existing keyframe', () => {
    makeProjectWithNode();
    createClipWithKeyframes();

    const clipBefore = useProjectStore.getState().project.animations[0];
    const trackBefore = clipBefore.tracks.find(t => t.targetId === 'node-1' && t.property === 'x');
    expect(trackBefore.keyframes).toHaveLength(2);

    const commands = createTimelineCommandApi();
    commands.upsertAnimationKeyframe({
      animationId: 'anim-1',
      targetId: 'node-1',
      property: 'x',
      timeMs: 0,
      value: 999,
      easing: 'linear',
    });

    const clipAfter = useProjectStore.getState().project.animations[0];
    const trackAfter = clipAfter.tracks.find(t => t.targetId === 'node-1' && t.property === 'x');
    expect(trackAfter.keyframes).toHaveLength(2);
    expect(trackAfter.keyframes[0].value).toBe(999);
  });

  it('moveAnimationKeyframes at zero delta returns unchanged', () => {
    makeProjectWithNode();
    createClipWithKeyframes();

    const clipBefore = JSON.stringify(useProjectStore.getState().project.animations[0]);
    const commands = createTimelineCommandApi();
    const result = commands.moveAnimationKeyframes({
      animationId: 'anim-1',
      keyframes: [{ targetId: 'node-1', property: 'x', timeMs: 0 }],
      deltaMs: 0,
    });
    expect(result.changed).toBe(false);
    expect(JSON.stringify(useProjectStore.getState().project.animations[0])).toBe(clipBefore);
  });
});

describe('A7: graph value/easing change produces one undo entry', () => {
  beforeEach(resetState);

  it('changing keyframe value and easing is one undo entry', () => {
    makeProjectWithNode();
    createClipWithKeyframes();

    const beforeUndo = undoCount();

    const commands = createTimelineCommandApi();
    commands.upsertAnimationKeyframe({
      animationId: 'anim-1',
      targetId: 'node-1',
      property: 'x',
      timeMs: 0,
      value: 75,
      easing: 'ease-in',
    });

    expect(undoCount()).toBe(beforeUndo + 1);

    const clip = useProjectStore.getState().project.animations[0];
    const track = clip.tracks.find(t => t.targetId === 'node-1' && t.property === 'x');
    const kf = track.keyframes.find(k => k.time === 0);
    expect(kf.value).toBe(75);
    expect(kf.easing).toBe('ease-in');

    undo((patches) => {
      const restored = applyPatches(useProjectStore.getState(), patches);
      useProjectStore.getState().restoreProject(restored);
    });

    const clipAfter = useProjectStore.getState().project.animations[0];
    const trackAfter = clipAfter.tracks.find(t => t.targetId === 'node-1' && t.property === 'x');
    const kfAfter = trackAfter.keyframes.find(k => k.time === 0);
    expect(kfAfter.value).toBe(0);
  });
});

describe('A8: save → reload round-trip preserves clip/curves/pose', () => {
  beforeEach(resetState);

  it('serialization round-trip preserves keyframes and easing', () => {
    makeProjectFull();
    const commands = createClipWithKeyframes();
    commands.upsertAnimationKeyframe({
      animationId: 'anim-1',
      targetId: 'node-1',
      property: 'opacity',
      timeMs: 0,
      value: 1,
      easing: 'linear',
    });
    commands.upsertAnimationKeyframe({
      animationId: 'anim-1',
      targetId: 'node-1',
      property: 'opacity',
      timeMs: 2000,
      value: 0.3,
      easing: [0.25, 0.1, 0.25, 1],
    });
    commands.upsertAnimationKeyframe({
      animationId: 'anim-1',
      targetId: 'bone-1',
      property: 'rotation',
      timeMs: 0,
      value: 0,
      easing: 'linear',
    });
    commands.upsertAnimationKeyframe({
      animationId: 'anim-1',
      targetId: 'bone-1',
      property: 'rotation',
      timeMs: 2000,
      value: 45,
      easing: 'ease-in',
    });

    const project = useProjectStore.getState().project;
    const serialized = JSON.parse(JSON.stringify(project));

    expect(serialized.animations[0].tracks.length).toBeGreaterThanOrEqual(3);

    const xTrack = serialized.animations[0].tracks.find(
      t => t.targetId === 'node-1' && t.property === 'x',
    );
    expect(xTrack.keyframes).toHaveLength(2);
    expect(xTrack.keyframes[0].value).toBe(0);
    expect(xTrack.keyframes[1].value).toBe(100);

    const opTrack = serialized.animations[0].tracks.find(
      t => t.targetId === 'node-1' && t.property === 'opacity',
    );
    expect(opTrack.keyframes[1].easing).toEqual([0.25, 0.1, 0.25, 1]);

    const boneTrack = serialized.animations[0].tracks.find(
      t => t.targetId === 'bone-1' && t.property === 'rotation',
    );
    expect(boneTrack.keyframes[1].value).toBe(45);
    expect(boneTrack.keyframes[1].easing).toBe('ease-in');

    const pose = evaluateAnimationPose(serialized.animations[0], { timeMs: 1000 });
    expect(pose.get('node-1').x).toBe(50);
    expect(pose.get('node-1').opacity).toBeCloseTo(0.65, 1);
    expect(pose.get('bone-1').rotation).toBeCloseTo(22.5, 0);
  });
});

describe('history granularity', () => {
  beforeEach(resetState);

  it('preview + commit = one undo entry', () => {
    makeProjectWithNode();
    createClipWithKeyframes();
    enterAnimationMode();

    const before = undoCount();
    const api = createAnimationAuthoringApi();
    api.preview({
      animationId: 'anim-1',
      targetId: 'node-1',
      property: 'x',
      value: 50,
      timeMs: 500,
      source: 'inspector',
      phase: 'preview',
    });
    api.commit({ source: 'auto-key' });

    expect(undoCount()).toBe(before + 1);
  });

  it('manual K without draft snapshots only existing animated core channels', () => {
    makeProjectFull();
    createClipWithKeyframes();
    enterAnimationMode();
    useAnimationStore.getState().seekTime(500);

    const before = undoCount();
    const api = createAnimationAuthoringApi();
    const result = api.keySelected({ targetIds: ['node-1'] });

    expect(result.changed).toBe(true);
    expect(undoCount()).toBe(before + 1);

    const clip = useProjectStore.getState().project.animations[0];
    const props = clip.tracks
      .filter(t => t.targetId === 'node-1')
      .map(t => t.property);
    expect(props).toContain('x');
    expect(props).not.toContain('y');
    expect(props).not.toContain('opacity');
    expect(props).not.toContain('visible');
  });

  it('undo after commit restores clip to pre-commit state', () => {
    makeProjectWithNode();
    createClipWithKeyframes();
    enterAnimationMode();

    const api = createAnimationAuthoringApi();
    api.preview({
      animationId: 'anim-1',
      targetId: 'node-1',
      property: 'x',
      value: 99,
      timeMs: 1000,
      source: 'inspector',
      phase: 'preview',
    });
    api.commit({ source: 'auto-key' });

    undo((patches) => {
      const restored = applyPatches(useProjectStore.getState(), patches);
      useProjectStore.getState().restoreProject(restored);
    });

    const clipAfter = useProjectStore.getState().project.animations[0];
    const track = clipAfter.tracks.find(t => t.targetId === 'node-1' && t.property === 'x');
    expect(track.keyframes.find(k => k.time === 1000)).toBeUndefined();
  });
});

describe('setup immutability', () => {
  beforeEach(resetState);

  it('node transform unchanged after animation commit', () => {
    makeProjectFull();
    createClipWithKeyframes();
    enterAnimationMode();

    const transformBefore = JSON.stringify(
      useProjectStore.getState().project.nodes[0].transform,
    );

    const api = createAnimationAuthoringApi();
    api.preview({
      animationId: 'anim-1',
      targetId: 'node-1',
      property: 'x',
      value: 100,
      timeMs: 500,
      source: 'inspector',
      phase: 'preview',
    });
    api.commit({ source: 'auto-key' });

    const transformAfter = JSON.stringify(
      useProjectStore.getState().project.nodes[0].transform,
    );
    expect(transformAfter).toBe(transformBefore);
  });

  it('node opacity unchanged after animation commit', () => {
    makeProjectFull();
    createClipWithKeyframes();
    enterAnimationMode();

    const opacityBefore = useProjectStore.getState().project.nodes[0].opacity;

    const api = createAnimationAuthoringApi();
    api.preview({
      animationId: 'anim-1',
      targetId: 'node-1',
      property: 'opacity',
      value: 0.2,
      timeMs: 500,
      source: 'inspector',
      phase: 'preview',
    });
    api.commit({ source: 'auto-key' });

    expect(useProjectStore.getState().project.nodes[0].opacity).toBe(opacityBefore);
  });
});

describe('canvas gesture → auto-key → Pixi sink', () => {
  beforeEach(resetState);

  it('gesture commit produces visible frame change', () => {
    makeProjectWithNode();
    createClipWithKeyframes();
    enterAnimationMode();

    const api = createAnimationAuthoringApi();
    api.preview({
      animationId: 'anim-1',
      targetId: 'node-1',
      property: 'x',
      value: 80,
      timeMs: 1000,
      source: 'canvas',
      phase: 'preview',
    });
    api.commit({ source: 'gesture' });

    useAnimationStore.getState().seekTime(1000);

    const frame = evaluateEditorFramePose({
      project: useProjectStore.getState().project,
      editorState: { editorMode: 'animation', activeTool: 'pose' },
      animationState: useAnimationStore.getState(),
      physicsRuntime: null,
      timestamp: 1000,
    });

    const headNode = frame.effectiveNodes.find(n => n.id === 'node-1');
    expect(headNode.transform.x).toBe(80);

    const fakeGateway = {
      app: {},
      contentLayer: {},
      frameRenderer: { drawFrame: vi.fn(() => true) },
      render: vi.fn(),
    };
    PixiSceneGateway.prototype.drawFrame.call(fakeGateway, frame, { reason: 'test' });
    expect(fakeGateway.frameRenderer.drawFrame).toHaveBeenCalledTimes(1);
  });
});

describe('drawOrder on effective nodes', () => {
  beforeEach(resetState);

  it('drawOrder keyframe maps to draw_order', () => {
    makeProjectFull();
    const commands = createClipWithKeyframes();
    commands.upsertAnimationKeyframe({
      animationId: 'anim-1',
      targetId: 'node-1',
      property: 'drawOrder',
      timeMs: 0,
      value: 10,
      easing: 'linear',
    });
    commands.upsertAnimationKeyframe({
      animationId: 'anim-1',
      targetId: 'node-2',
      property: 'drawOrder',
      timeMs: 0,
      value: 20,
      easing: 'linear',
    });

    enterAnimationMode();
    useAnimationStore.getState().seekTime(0);

    const frame = evaluateEditorFramePose({
      project: useProjectStore.getState().project,
      editorState: { editorMode: 'animation', activeTool: 'pose' },
      animationState: useAnimationStore.getState(),
      physicsRuntime: null,
      timestamp: 0,
    });

    expect(frame.effectiveNodes.find(n => n.id === 'node-1').draw_order).toBe(10);
    expect(frame.effectiveNodes.find(n => n.id === 'node-2').draw_order).toBe(20);
  });
});

describe('multiple clips', () => {
  beforeEach(resetState);

  it('switching clips preserves keyframes', () => {
    makeProjectWithNode();
    const commands = createTimelineCommandApi();
    commands.createAnimationClip({
      animationId: 'anim-1',
      name: 'Walk',
      durationMs: 1000,
      fps: 24,
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

    commands.createAnimationClip({
      animationId: 'anim-2',
      name: 'Run',
      durationMs: 2000,
      fps: 24,
    });
    commands.upsertAnimationKeyframe({
      animationId: 'anim-2',
      targetId: 'node-1',
      property: 'x',
      timeMs: 0,
      value: 0,
      easing: 'linear',
    });
    commands.upsertAnimationKeyframe({
      animationId: 'anim-2',
      targetId: 'node-1',
      property: 'x',
      timeMs: 2000,
      value: 200,
      easing: 'linear',
    });

    commands.selectAnimationClip('anim-1');
    expect(useAnimationStore.getState().activeAnimationId).toBe('anim-1');

    commands.selectAnimationClip('anim-2');
    expect(useAnimationStore.getState().activeAnimationId).toBe('anim-2');

    const clip2 = useProjectStore.getState().project.animations.find(a => a.id === 'anim-2');
    const track = clip2.tracks.find(t => t.targetId === 'node-1' && t.property === 'x');
    expect(track.keyframes[1].value).toBe(200);

    commands.selectAnimationClip('anim-1');
    const clip1 = useProjectStore.getState().project.animations.find(a => a.id === 'anim-1');
    const track1 = clip1.tracks.find(t => t.targetId === 'node-1' && t.property === 'x');
    expect(track1.keyframes[1].value).toBe(100);
  });
});

describe('easing round-trip', () => {
  beforeEach(resetState);

  it('cubic tuple easing preserved through upsert', () => {
    makeProjectWithNode();
    createClipWithKeyframes();

    const commands = createTimelineCommandApi();
    commands.upsertAnimationKeyframe({
      animationId: 'anim-1',
      targetId: 'node-1',
      property: 'x',
      timeMs: 0,
      value: 0,
      easing: [0.25, 0.1, 0.25, 1],
    });

    const clip = useProjectStore.getState().project.animations[0];
    const track = clip.tracks.find(t => t.targetId === 'node-1' && t.property === 'x');
    const kf = track.keyframes.find(k => k.time === 0);
    expect(kf.easing).toEqual([0.25, 0.1, 0.25, 1]);

    const serialized = JSON.parse(JSON.stringify(clip));
    const trackS = serialized.tracks.find(t => t.targetId === 'node-1' && t.property === 'x');
    expect(trackS.keyframes[0].easing).toEqual([0.25, 0.1, 0.25, 1]);
  });
});
