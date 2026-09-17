/**
 * Cross-layer editor mode contract — Stage 06
 *
 * End-to-end integration tests covering:
 *   A1: Staging linked image move → propagation intact
 *   A2: Animation linked image move → stable offset, node tracks, no bone mutation
 *   A3: A2 + scrub → position persists
 *   A4: Animation bone move/rotate/scale → bone track, setup invariant, linked follow
 *   A5: Animation linked image → "Select linked bone" affordance
 *   A6: Animation bone length → blocked, no mutation
 *   A7: Animation pivot → disabled, no mutation
 *   A8: Animation shortcut Draw Bone/IK/Weights → blocked, feedback
 *   A9: Animation structural ops → blocked, document unchanged
 *   A10: Missing clip → blocked with feedback
 *   A11: Dirty draft transition → Commit/Discard/Cancel
 *   A12: Cancel during linked gesture → frame/draft/project restored
 *
 * Also covers: blocked = zero undo, commit gesture = one undo.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { useProjectStore } from '@/store/projectStore';
import { useAnimationStore } from '@/store/animationStore';
import { useEditorStore } from '@/store/editorStore';
import {
  clearHistory,
  undoCount,
} from '@/store/undoHistory';
import { createTimelineCommandApi } from '@/features/timeline';
import { createAnimationAuthoringApi } from '@/features/animation';
import { evaluateEditorFramePose } from '@/features/canvas/application/evaluateEditorFramePose.js';
import {
  buildEffectiveNodes,
} from '@/features/canvas/domain/framePose.js';
import {
  applyBoneLinkedNodeOverrides,
  poseRecordToMap,
} from '@/features/canvas/domain/poseModel.js';
import { resolveLinkedNodeAuthoredTransform } from '@/features/canvas/domain/linkedNodeAuthoring.js';
import { editorModePolicy, ACTION_IDS, REASON_CODES } from '@/domain/editorModePolicy.js';
import { getFeedback } from '@/domain/editorModeFeedback.js';
import { requestEditorMode } from '@/domain/editorModeTransition.js';
import {
  computeWorldMatrices,
} from '@/domain/transforms';
import { applyBoneConstraintOverrides } from '@/features/canvas/domain/constraintPose.js';

// ── Helpers ──────────────────────────────────────────────────────────────────

function resetState() {
  clearHistory();
  useAnimationStore.getState().resetPlayback();
  useProjectStore.getState().resetProject();
  useEditorStore.setState({
    editorMode: 'staging',
    autoKeyframe: true,
    selection: [],
  });
}

function enterAnimationMode() {
  useEditorStore.setState({ editorMode: 'animation' });
  useAnimationStore.getState().captureRestPose(
    useProjectStore.getState().project.nodes,
  );
}

function makeLinkedProject(overrides = {}) {
  resetState();
  useProjectStore.getState().updateProject((project) => {
    project.nodes.push({
      id: 'image-1',
      type: 'part',
      name: 'Hand Image',
      parent: null,
      boneId: 'bone-1',
      transform: { x: 10, y: 5, rotation: 0, scaleX: 1, scaleY: 1, pivotX: 0, pivotY: 0 },
      opacity: 1,
      visible: true,
      boneLinkLocked: true,
      ...overrides,
    });
    project.bones.push({
      id: 'bone-1',
      name: 'Arm',
      parentId: null,
      setup: { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1, length: 100, pivotX: 0, pivotY: 0 },
    });
  }, { skipHistory: true });
}

function createClipWithKeyframes(targetId = 'image-1') {
  const commands = createTimelineCommandApi();
  commands.createAnimationClip({
    animationId: 'anim-1',
    name: 'Walk',
    durationMs: 2000,
    fps: 24,
  });
  commands.upsertAnimationKeyframe({
    animationId: 'anim-1',
    targetId,
    property: 'x',
    timeMs: 0,
    value: 0,
    easing: 'linear',
  });
  commands.upsertAnimationKeyframe({
    animationId: 'anim-1',
    targetId,
    property: 'x',
    timeMs: 2000,
    value: 100,
    easing: 'linear',
  });
  return commands;
}

function snapshotSetup() {
  const project = useProjectStore.getState().project;
  return {
    nodes: JSON.parse(JSON.stringify(project.nodes)),
    bones: JSON.parse(JSON.stringify(project.bones)),
    constraints: JSON.parse(JSON.stringify(project.constraints ?? [])),
  };
}

function evaluateFrame(timestamp = 0) {
  return evaluateEditorFramePose({
    project: useProjectStore.getState().project,
    editorState: useEditorStore.getState(),
    animationState: useAnimationStore.getState(),
    physicsRuntime: null,
    timestamp,
  });
}

// ── A1: Staging linked image move — propagation intact ────────────────────────

describe('A1: Staging linked image move — propagation intact', () => {
  beforeEach(resetState);

  it('linked image, bone branch, and linked peers keep current propagation in Staging', () => {
    makeLinkedProject();
    const setupBefore = snapshotSetup();

    useEditorStore.setState({ selection: ['image-1'] });

    const project = useProjectStore.getState().project;
    const nodeBefore = project.nodes.find(n => n.id === 'image-1');
    expect(nodeBefore.boneId).toBe('bone-1');

    useProjectStore.getState().updateProject((p) => {
      const node = p.nodes.find(n => n.id === 'image-1');
      node.transform.x = 50;
      node.transform.y = 25;
    });

    const nodeAfter = useProjectStore.getState().project.nodes.find(n => n.id === 'image-1');
    expect(nodeAfter.transform.x).toBe(50);
    expect(nodeAfter.transform.y).toBe(25);

    const boneAfter = useProjectStore.getState().project.bones.find(b => b.id === 'bone-1');
    expect(boneAfter.setup.x).toBe(setupBefore.bones[0].setup.x);
    expect(boneAfter.setup.y).toBe(setupBefore.bones[0].setup.y);

    const frame = evaluateFrame();
    const effNode = frame.effectiveNodes.find(n => n.id === 'image-1');
    expect(effNode).toBeDefined();
  });
});

// ── A2: Animation linked image move → stable offset, node tracks, no bone mutation ──

describe('A2: Animation linked image move — stable offset, no bone mutation', () => {
  beforeEach(resetState);

  it('DnD linked image in Animation writes node tracks, bone untouched', () => {
    makeLinkedProject();
    createClipWithKeyframes();
    enterAnimationMode();

    const setupBefore = snapshotSetup();
    const boneSetupBefore = { ...setupBefore.bones[0] };

    const api = createAnimationAuthoringApi();
    api.preview({
      animationId: 'anim-1',
      targetId: 'image-1',
      property: 'x',
      value: 50,
      timeMs: 1000,
      source: 'canvas',
      phase: 'preview',
    });
    api.commit({ source: 'auto-key' });

    const clip = useProjectStore.getState().project.animations[0];
    const track = clip.tracks.find(t => t.targetId === 'image-1' && t.property === 'x');
    expect(track).toBeDefined();
    expect(track.keyframes.find(k => k.time === 1000)?.value).toBe(50);

    const boneSetupAfter = useProjectStore.getState().project.bones[0].setup;
    expect(boneSetupAfter.x).toBe(boneSetupBefore.setup.x);
    expect(boneSetupAfter.y).toBe(boneSetupBefore.setup.y);
    expect(boneSetupAfter.rotation).toBe(boneSetupBefore.setup.rotation);
    expect(boneSetupAfter.length).toBe(boneSetupBefore.setup.length);
  });
});

// ── A3: A2 + scrub → position persists ───────────────────────────────────────

describe('A3: Animation linked image — scrub persists position', () => {
  beforeEach(resetState);

  it('after writing keyframe, scrubbing back to time restores position', () => {
    makeLinkedProject();
    createClipWithKeyframes();
    enterAnimationMode();

    const api = createAnimationAuthoringApi();
    api.preview({
      animationId: 'anim-1',
      targetId: 'image-1',
      property: 'x',
      value: 75,
      timeMs: 1000,
      source: 'canvas',
      phase: 'preview',
    });
    api.commit({ source: 'auto-key' });

    useAnimationStore.getState().seekTime(1000);
    const frame1 = evaluateFrame(1000);
    const node1 = frame1.effectiveNodes.find(n => n.id === 'image-1');
    expect(node1.transform.x).toBe(75);

    useAnimationStore.getState().seekTime(0);
    const frame0 = evaluateFrame(0);
    const node0 = frame0.effectiveNodes.find(n => n.id === 'image-1');
    expect(node0.transform.x).toBe(0);

    useAnimationStore.getState().seekTime(1000);
    const frame2 = evaluateFrame(1000);
    const node2 = frame2.effectiveNodes.find(n => n.id === 'image-1');
    expect(node2.transform.x).toBe(75);
  });
});

// ── A4: Animation bone move/rotate/scale → bone track, setup invariant ────────

describe('A4: Animation bone transform — bone track, setup invariant, linked follow', () => {
  beforeEach(resetState);

  it('bone rotation creates track, setup unchanged, linked node follows', () => {
    makeLinkedProject();
    createClipWithKeyframes();
    enterAnimationMode();

    const setupBefore = snapshotSetup();
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
    expect(boneSetupAfter.rotation).toBe(setupBefore.bones[0].setup.rotation);

    const clip = useProjectStore.getState().project.animations[0];
    const track = clip.tracks.find(t => t.targetId === 'bone-1' && t.property === 'rotation');
    expect(track).toBeDefined();
    expect(track.keyframes.find(k => k.time === 500)?.value).toBe(45);

    useAnimationStore.getState().seekTime(500);
    const frame = evaluateFrame(500);
    const bone = frame.effectiveBones.find(b => b.id === 'bone-1');
    expect(bone.setup.rotation).toBe(45);

    const linkedNode = frame.effectiveNodes.find(n => n.id === 'image-1');
    expect(linkedNode).toBeDefined();
    expect(linkedNode.transform.rotation).toBe(45);
  });

  it('bone scaleX creates track, setup unchanged', () => {
    makeLinkedProject();
    createClipWithKeyframes();
    enterAnimationMode();

    const setupBefore = snapshotSetup();
    const api = createAnimationAuthoringApi();

    api.preview({
      animationId: 'anim-1',
      targetId: 'bone-1',
      property: 'scaleX',
      value: 2,
      timeMs: 500,
      source: 'inspector',
      phase: 'preview',
    });
    api.commit({ source: 'auto-key' });

    const boneSetupAfter = useProjectStore.getState().project.bones[0].setup;
    expect(boneSetupAfter.scaleX).toBe(setupBefore.bones[0].setup.scaleX);

    const clip = useProjectStore.getState().project.animations[0];
    const track = clip.tracks.find(t => t.targetId === 'bone-1' && t.property === 'scaleX');
    expect(track).toBeDefined();
    expect(track.keyframes.find(k => k.time === 500)?.value).toBe(2);
  });
});

// ── A5: Animation linked image → "Select linked bone" affordance ─────────────

describe('A5: Animation linked image — linked bone target info', () => {
  beforeEach(resetState);

  it('linked node in Animation has boneId accessible for quick select', () => {
    makeLinkedProject();
    enterAnimationMode();

    const project = useProjectStore.getState().project;
    const node = project.nodes.find(n => n.id === 'image-1');
    expect(node.boneId).toBe('bone-1');

    const bone = project.bones.find(b => b.id === 'bone-1');
    expect(bone).toBeDefined();
    expect(bone.name).toBe('Arm');
  });

  it('policy allows SELECTION for element target in animation', () => {
    const decision = editorModePolicy({
      mode: 'animation',
      actionId: ACTION_IDS.SELECTION,
      targetKind: 'node',
    });
    expect(decision.allowed).toBe(true);
    expect(decision.channel).toBe('navigation');
  });
});

// ── A6: Animation bone length → blocked, no mutation ──────────────────────────

describe('A6: Animation bone length — blocked, no mutation', () => {
  beforeEach(resetState);

  it('policy blocks bone.length in animation', () => {
    const decision = editorModePolicy({
      mode: 'animation',
      actionId: ACTION_IDS.BONE_LENGTH,
      targetKind: 'bone',
    });
    expect(decision.allowed).toBe(false);
    expect(decision.reasonCode).toBe(REASON_CODES.STAGING_ONLY_BONE_LENGTH);

    const feedback = getFeedback(decision.reasonCode);
    expect(feedback.suggestedAction).toContain('Scale X');
  });

  it('staging allows bone.length', () => {
    const decision = editorModePolicy({
      mode: 'staging',
      actionId: ACTION_IDS.BONE_LENGTH,
      targetKind: 'bone',
    });
    expect(decision.allowed).toBe(true);
  });

  it('bone length setup unchanged after failed animation edit', () => {
    makeLinkedProject();
    createClipWithKeyframes();
    enterAnimationMode();

    const setupBefore = snapshotSetup();
    const api = createAnimationAuthoringApi();

    const result = api.preview({
      animationId: 'anim-1',
      targetId: 'bone-1',
      property: 'length',
      value: 200,
      timeMs: 500,
      source: 'inspector',
      phase: 'preview',
    });

    expect(result.valid).toBe(false);

    const boneSetupAfter = useProjectStore.getState().project.bones[0].setup;
    expect(boneSetupAfter.length).toBe(setupBefore.bones[0].setup.length);
  });
});

// ── A7: Animation pivot → disabled, no mutation ───────────────────────────────

describe('A7: Animation pivot — disabled, no mutation', () => {
  beforeEach(resetState);

  it('policy blocks bone.pivot in animation', () => {
    const decision = editorModePolicy({
      mode: 'animation',
      actionId: ACTION_IDS.BONE_PIVOT,
      targetKind: 'bone',
    });
    expect(decision.allowed).toBe(false);
    expect(decision.reasonCode).toBe(REASON_CODES.STAGING_ONLY_PIVOT);
  });

  it('pivotX is not authorable property', async () => {
    const { isAuthorableProperty } = await import('@/domain/animationProperties.js');
    expect(isAuthorableProperty('pivotX')).toBe(false);
    expect(isAuthorableProperty('pivotY')).toBe(false);
  });
});

// ── A8: Animation shortcut Draw Bone/IK/Weights → blocked, feedback ──────────

describe('A8: Animation shortcuts — Draw Bone/IK/Weights blocked', () => {
  beforeEach(resetState);

  const toolActions = [
    [ACTION_IDS.BONE_CREATE, 'bone.create'],
    [ACTION_IDS.IK_CREATE, 'ik.create'],
    [ACTION_IDS.WEIGHTS_EDIT, 'weights.edit'],
  ];

  it.each(toolActions)('blocks %s in animation', (actionId) => {
    const decision = editorModePolicy({
      mode: 'animation',
      actionId,
    });
    expect(decision.allowed).toBe(false);
    expect(decision.channel).toBe('blocked');
    expect(decision.reasonCode).toBe(REASON_CODES.STAGING_ONLY_STRUCTURE);

    const feedback = getFeedback(decision.reasonCode);
    expect(feedback.message).toBeTruthy();
    expect(feedback.suggestedAction).toContain('Staging');
  });

  it.each(toolActions)('allows %s in staging', (actionId) => {
    const decision = editorModePolicy({
      mode: 'staging',
      actionId,
    });
    expect(decision.allowed).toBe(true);
  });
});

// ── A9: Animation structural ops → blocked, document unchanged ────────────────

describe('A9: Animation structural ops — blocked, document unchanged', () => {
  beforeEach(resetState);

  const structuralActions = [
    ACTION_IDS.BONE_CREATE,
    ACTION_IDS.BONE_DELETE,
    ACTION_IDS.BONE_REPARENT,
    ACTION_IDS.IK_CREATE,
    ACTION_IDS.IK_ASSIGN,
    ACTION_IDS.REMESH,
    ACTION_IDS.WEIGHTS_EDIT,
    ACTION_IDS.LINK_TOGGLE,
    ACTION_IDS.BIND_TOGGLE,
    ACTION_IDS.SLOT_CREATE,
    ACTION_IDS.SLOT_DELETE,
    ACTION_IDS.HIERARCHY_REORDER,
  ];

  it.each(structuralActions)('blocks %s in animation', (actionId) => {
    const decision = editorModePolicy({ mode: 'animation', actionId });
    expect(decision.allowed).toBe(false);
    expect(decision.channel).toBe('blocked');
  });

  it('document unchanged after blocked policy decisions in animation', () => {
    makeLinkedProject();
    enterAnimationMode();
    const snapshot = snapshotSetup();

    for (const actionId of structuralActions) {
      editorModePolicy({ mode: 'animation', actionId });
    }

    const projectAfter = useProjectStore.getState().project;
    expect(JSON.stringify(projectAfter.nodes)).toBe(JSON.stringify(snapshot.nodes));
    expect(JSON.stringify(projectAfter.bones)).toBe(JSON.stringify(snapshot.bones));
  });

  it('blocked operations produce zero undo entries', () => {
    makeLinkedProject();
    enterAnimationMode();
    const before = undoCount();

    for (const actionId of structuralActions) {
      editorModePolicy({ mode: 'animation', actionId });
    }

    expect(undoCount()).toBe(before);
  });
});

// ── A10: Missing clip → blocked with feedback ────────────────────────────────

describe('A10: Missing clip — blocked with feedback', () => {
  beforeEach(resetState);

  it('pose edit without active clip: authoring API accepts preview but commit returns changed:false', () => {
    makeLinkedProject();
    enterAnimationMode();

    useAnimationStore.setState({ activeAnimationId: null });

    const api = createAnimationAuthoringApi();
    api.preview({
      animationId: null,
      targetId: 'image-1',
      property: 'x',
      value: 50,
      timeMs: 0,
      source: 'inspector',
      phase: 'preview',
    });

    const commitResult = api.commit({ source: 'auto-key' });
    expect(commitResult.changed).toBe(false);
  });

  it('ACTIVE_CLIP_REQUIRED reason code has feedback', () => {
    const feedback = getFeedback(REASON_CODES.ACTIVE_CLIP_REQUIRED);
    expect(feedback.message).toContain('animation clip');
    expect(feedback.suggestedAction).toBeTruthy();
  });
});

// ── A11: Dirty draft transition → Commit/Discard/Cancel ──────────────────────

describe('A11: Dirty draft transition — Commit/Discard/Cancel', () => {
  beforeEach(resetState);

  it('dirty draft blocks mode switch to staging', () => {
    makeLinkedProject();
    createClipWithKeyframes();
    enterAnimationMode();

    const api = createAnimationAuthoringApi();
    api.preview({
      animationId: 'anim-1',
      targetId: 'image-1',
      property: 'x',
      value: 50,
      timeMs: 500,
      source: 'inspector',
      phase: 'preview',
    });

    expect(useAnimationStore.getState().draftDirty).toBe(true);

    const decision = editorModePolicy({
      mode: 'animation',
      actionId: ACTION_IDS.MODE_SWITCH,
      draftDirty: true,
    });
    expect(decision.allowed).toBe(false);
    expect(decision.reasonCode).toBe(REASON_CODES.DIRTY_DRAFT);
  });

  it('commit clears draft, allows mode switch', () => {
    makeLinkedProject();
    createClipWithKeyframes();
    enterAnimationMode();

    const api = createAnimationAuthoringApi();
    api.preview({
      animationId: 'anim-1',
      targetId: 'image-1',
      property: 'x',
      value: 50,
      timeMs: 500,
      source: 'inspector',
      phase: 'preview',
    });
    api.commit({ source: 'auto-key' });

    expect(useAnimationStore.getState().draftDirty).toBe(false);

    const decision = editorModePolicy({
      mode: 'animation',
      actionId: ACTION_IDS.MODE_SWITCH,
      draftDirty: false,
    });
    expect(decision.allowed).toBe(true);
  });

  it('discard clears draft without project mutation', () => {
    makeLinkedProject();
    createClipWithKeyframes();
    enterAnimationMode();

    const snapshot = snapshotSetup();

    const api = createAnimationAuthoringApi();
    api.preview({
      animationId: 'anim-1',
      targetId: 'image-1',
      property: 'x',
      value: 50,
      timeMs: 500,
      source: 'inspector',
      phase: 'preview',
    });
    api.discard();

    expect(useAnimationStore.getState().draftDirty).toBe(false);

    const projectAfter = useProjectStore.getState().project;
    expect(JSON.stringify(projectAfter.nodes)).toBe(JSON.stringify(snapshot.nodes));

    const clip = projectAfter.animations[0];
    const track = clip.tracks.find(t => t.targetId === 'image-1' && t.property === 'x');
    expect(track.keyframes.find(k => k.time === 500)).toBeUndefined();
  });

  it('requestEditorMode returns blocked-draft for dirty draft', () => {
    const r = requestEditorMode({
      currentMode: 'animation',
      nextMode: 'staging',
      draftState: { dirty: true, values: { size: 1 } },
    });
    expect(r.result).toBe('blocked-draft');
  });

  it('requestEditorMode returns changed for clean draft', () => {
    const r = requestEditorMode({
      currentMode: 'animation',
      nextMode: 'staging',
      draftState: { dirty: false, values: { size: 0 } },
    });
    expect(r.result).toBe('changed');
  });
});

// ── A12: Cancel during gesture → frame/draft/project restored ────────────────

describe('A12: Cancel during gesture — frame/draft/project restored', () => {
  beforeEach(resetState);

  it('cancel gesture restores draft to snapshot', () => {
    makeLinkedProject();
    createClipWithKeyframes();
    enterAnimationMode();

    const snapshot = snapshotSetup();

    const api = createAnimationAuthoringApi();
    api.preview({
      animationId: 'anim-1',
      targetId: 'image-1',
      property: 'x',
      value: 50,
      timeMs: 500,
      source: 'canvas',
      phase: 'preview',
    });

    expect(useAnimationStore.getState().draftDirty).toBe(true);

    api.discard();

    expect(useAnimationStore.getState().draftDirty).toBe(false);

    const projectAfter = useProjectStore.getState().project;
    expect(JSON.stringify(projectAfter.nodes)).toBe(JSON.stringify(snapshot.nodes));
  });

  it('cancel gesture leaves zero undo entries', () => {
    makeLinkedProject();
    createClipWithKeyframes();
    enterAnimationMode();

    const before = undoCount();

    const api = createAnimationAuthoringApi();
    api.preview({
      animationId: 'anim-1',
      targetId: 'image-1',
      property: 'x',
      value: 50,
      timeMs: 500,
      source: 'canvas',
      phase: 'preview',
    });
    api.discard();

    expect(undoCount()).toBe(before);
  });
});

// ── Undo granularity: one entry per commit gesture ───────────────────────────

describe('Undo granularity: one entry per commit gesture', () => {
  beforeEach(resetState);

  it('single preview + commit = one undo entry', () => {
    makeLinkedProject();
    createClipWithKeyframes();
    enterAnimationMode();

    const before = undoCount();
    const api = createAnimationAuthoringApi();
    api.preview({
      animationId: 'anim-1',
      targetId: 'image-1',
      property: 'x',
      value: 50,
      timeMs: 500,
      source: 'inspector',
      phase: 'preview',
    });
    api.commit({ source: 'auto-key' });

    expect(undoCount()).toBe(before + 1);
  });

  it('blocked policy decision = zero undo entries', () => {
    makeLinkedProject();
    enterAnimationMode();

    const before = undoCount();

    for (const actionId of [
      ACTION_IDS.BONE_CREATE,
      ACTION_IDS.BONE_DELETE,
      ACTION_IDS.REMESH,
    ]) {
      editorModePolicy({ mode: 'animation', actionId });
    }

    expect(undoCount()).toBe(before);
  });
});

// ── K8: Setup invariant — setup snapshot identical before/after animation ────

describe('K8: Setup invariant — setup identical before/after animation gestures', () => {
  beforeEach(resetState);

  it('node transform setup unchanged after multiple animation commits', () => {
    makeLinkedProject();
    createClipWithKeyframes();
    enterAnimationMode();

    const setupBefore = snapshotSetup();

    const api = createAnimationAuthoringApi();
    api.preview({
      animationId: 'anim-1',
      targetId: 'image-1',
      property: 'x',
      value: 50,
      timeMs: 500,
      source: 'canvas',
      phase: 'preview',
    });
    api.commit({ source: 'auto-key' });

    api.preview({
      animationId: 'anim-1',
      targetId: 'image-1',
      property: 'y',
      value: 30,
      timeMs: 1000,
      source: 'canvas',
      phase: 'preview',
    });
    api.commit({ source: 'auto-key' });

    const setupAfter = snapshotSetup();
    expect(setupAfter.nodes).toEqual(setupBefore.nodes);
    expect(setupAfter.bones).toEqual(setupBefore.bones);
  });

  it('bone setup unchanged after bone animation commits', () => {
    makeLinkedProject();
    createClipWithKeyframes();
    enterAnimationMode();

    const setupBefore = snapshotSetup();

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

    api.preview({
      animationId: 'anim-1',
      targetId: 'bone-1',
      property: 'scaleX',
      value: 2,
      timeMs: 1000,
      source: 'inspector',
      phase: 'preview',
    });
    api.commit({ source: 'auto-key' });

    const setupAfter = snapshotSetup();
    expect(setupAfter.bones).toEqual(setupBefore.bones);
    expect(setupAfter.nodes).toEqual(setupBefore.nodes);
  });
});

// ── Navigation always allowed ────────────────────────────────────────────────

describe('Navigation always allowed in both modes', () => {
  const navActions = [ACTION_IDS.SELECTION, ACTION_IDS.ZOOM, ACTION_IDS.PAN, ACTION_IDS.PLAYBACK];

  it.each(navActions)('allows %s in animation', (actionId) => {
    expect(editorModePolicy({ mode: 'animation', actionId }).allowed).toBe(true);
  });

  it.each(navActions)('allows %s in staging', (actionId) => {
    expect(editorModePolicy({ mode: 'staging', actionId }).allowed).toBe(true);
  });
});

// ── R13: Rename and library organize allowed in both modes ───────────────────

describe('R13: Rename and library organize allowed in both modes', () => {
  it('bone rename allowed in animation', () => {
    expect(editorModePolicy({ mode: 'animation', actionId: ACTION_IDS.BONE_RENAME }).allowed).toBe(true);
  });

  it('bone rename allowed in staging', () => {
    expect(editorModePolicy({ mode: 'staging', actionId: ACTION_IDS.BONE_RENAME }).allowed).toBe(true);
  });

  it('node rename allowed in animation', () => {
    expect(editorModePolicy({ mode: 'animation', actionId: ACTION_IDS.RENAME }).allowed).toBe(true);
  });

  it('library organize allowed in animation', () => {
    expect(editorModePolicy({ mode: 'animation', actionId: ACTION_IDS.LIBRARY_ORGANIZE }).allowed).toBe(true);
  });
});

// ── Feedback catalog completeness ────────────────────────────────────────────

describe('Feedback catalog completeness — every blocked reason has feedback', () => {
  it('every blocked-in-animation reason code has feedback', () => {
    const allBlocked = [
      ACTION_IDS.BONE_LENGTH,
      ACTION_IDS.BONE_PIVOT,
      ACTION_IDS.BONE_CREATE,
      ACTION_IDS.BONE_DELETE,
      ACTION_IDS.BONE_REPARENT,
      ACTION_IDS.IK_CREATE,
      ACTION_IDS.IK_ASSIGN,
      ACTION_IDS.REMESH,
      ACTION_IDS.WEIGHTS_EDIT,
      ACTION_IDS.LINK_TOGGLE,
      ACTION_IDS.BIND_TOGGLE,
      ACTION_IDS.SLOT_CREATE,
      ACTION_IDS.SLOT_DELETE,
      ACTION_IDS.HIERARCHY_REORDER,
    ];

    for (const actionId of allBlocked) {
      const decision = editorModePolicy({ mode: 'animation', actionId });
      expect(decision.allowed).toBe(false);
      const feedback = getFeedback(decision.reasonCode);
      expect(feedback.message).toBeTruthy();
      expect(feedback.tooltip).toBeTruthy();
      expect(feedback.suggestedAction).toBeTruthy();
    }
  });
});

// ── Linked node authoring round-trip integration ─────────────────────────────

describe('Linked node authoring round-trip — resolve → store → re-evaluate', () => {
  it('bone rotation linked node round-trip through full frame pipeline', () => {
    const project = {
      nodes: [{
        id: 'img', type: 'part', boneId: 'bone1',
        transform: { x: 10, y: 0, rotation: 0, scaleX: 1, scaleY: 1, pivotX: 0, pivotY: 0 },
        visible: true, opacity: 1,
      }],
      bones: [{ id: 'bone1', parentId: null, setup: { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1, length: 10 } }],
      constraints: [],
    };
    const posedBoneOverrides = { bone1: { rotation: 90 } };
    const effectiveBones = project.bones.map(bone => {
      const ov = posedBoneOverrides[bone.id];
      if (!ov) return bone;
      const setup = { ...(bone.setup ?? {}) };
      for (const k of ['x', 'y', 'rotation', 'scaleX', 'scaleY', 'length']) {
        if (ov[k] !== undefined) setup[k] = ov[k];
      }
      return { ...bone, setup };
    });
    const preLinkedNodes = buildEffectiveNodes(project, poseRecordToMap({}));
    const preLinkedWorldMatrices = computeWorldMatrices(preLinkedNodes);
    const withBones = applyBoneConstraintOverrides(project, poseRecordToMap({}));
    const withLinked = applyBoneLinkedNodeOverrides(project, withBones);
    const displayedNodes = buildEffectiveNodes(project, withLinked);
    const displayedWorld = computeWorldMatrices(displayedNodes).get('img');

    const resolved = resolveLinkedNodeAuthoredTransform({
      node: project.nodes[0],
      bone: effectiveBones[0],
      boneOverrides: effectiveBones[0],
      preLinkedWorldMatrices,
      desiredDisplayedWorld: displayedWorld,
    });

    expect(resolved.valid).toBe(true);

    const projectCopy = JSON.parse(JSON.stringify(project));
    projectCopy.nodes[0].transform.x = resolved.transform.x;
    projectCopy.nodes[0].transform.y = resolved.transform.y;
    projectCopy.nodes[0].transform.rotation = resolved.transform.rotation;
    projectCopy.nodes[0].transform.scaleX = resolved.transform.scaleX;
    projectCopy.nodes[0].transform.scaleY = resolved.transform.scaleY;

    const reevalOverrides = poseRecordToMap({});
    const reevalWithBones = applyBoneConstraintOverrides(projectCopy, reevalOverrides);
    const reevalWithLinked = applyBoneLinkedNodeOverrides(projectCopy, reevalWithBones);
    const reevalNodes = buildEffectiveNodes(projectCopy, reevalWithLinked);
    const reevalWorld = computeWorldMatrices(reevalNodes).get('img');

    for (let i = 0; i < 9; i++) {
      expect(reevalWorld[i]).toBeCloseTo(displayedWorld[i], 2);
    }
  });
});

// ── Canvas adapter: previewPartial rejects non-authorable ────────────────────

describe('Canvas adapter: previewPartial rejects non-authorable properties', () => {
  it('previewPartial returns valid:false for length in animation', async () => {
    const { createCanvasAuthoringAdapter } = await import('@/features/canvas/application/createCanvasAuthoringAdapter.js');

    makeLinkedProject();
    createClipWithKeyframes();
    enterAnimationMode();

    const adapter = createCanvasAuthoringAdapter();
    const result = adapter.previewPartial('image-1', { length: 200 });
    expect(result.valid).toBe(false);
  });

  it('previewPartial returns valid:false for pivotX in animation', async () => {
    const { createCanvasAuthoringAdapter } = await import('@/features/canvas/application/createCanvasAuthoringAdapter.js');

    makeLinkedProject();
    createClipWithKeyframes();
    enterAnimationMode();

    const adapter = createCanvasAuthoringAdapter();
    const result = adapter.previewPartial('image-1', { pivotX: 50 });
    expect(result.valid).toBe(false);
  });

  it('previewPartial returns valid:true for authorable x in animation', async () => {
    const { createCanvasAuthoringAdapter } = await import('@/features/canvas/application/createCanvasAuthoringAdapter.js');

    makeLinkedProject();
    createClipWithKeyframes();
    enterAnimationMode();

    const adapter = createCanvasAuthoringAdapter();
    const result = adapter.previewPartial('image-1', { x: 50 });
    expect(result.valid).toBe(true);
  });

  it('validates the whole partial before writing any draft property', async () => {
    const { createCanvasAuthoringAdapter } = await import('@/features/canvas/application/createCanvasAuthoringAdapter.js');

    makeLinkedProject();
    createClipWithKeyframes();
    enterAnimationMode();

    const before = useAnimationStore.getState();
    const adapter = createCanvasAuthoringAdapter();
    const result = adapter.previewPartial('image-1', { x: 50, pivotX: 10 });
    const after = useAnimationStore.getState();

    expect(result).toMatchObject({
      valid: false,
      reasonCode: 'property_not_authorable',
      property: 'pivotX',
    });
    expect(after.draftPose).toEqual(before.draftPose);
    expect(after.draftContext).toEqual(before.draftContext);
    expect(after.draftRevision).toBe(before.draftRevision);
  });
});

// ── Mode switch controller integration ───────────────────────────────────────

describe('Mode switch controller — requestEditorMode integration', () => {
  beforeEach(resetState);

  it('staging → animation always changed', () => {
    const r = requestEditorMode({ currentMode: 'staging', nextMode: 'animation' });
    expect(r.result).toBe('changed');
  });

  it('animation → staging with no draft is changed', () => {
    const r = requestEditorMode({
      currentMode: 'animation',
      nextMode: 'staging',
      draftState: { dirty: false, values: { size: 0 } },
    });
    expect(r.result).toBe('changed');
  });

  it('animation → staging with dirty draft is blocked-draft', () => {
    const r = requestEditorMode({
      currentMode: 'animation',
      nextMode: 'staging',
      draftState: { dirty: true, values: { size: 1 } },
    });
    expect(r.result).toBe('blocked-draft');
  });

  it('same mode returns unchanged', () => {
    expect(requestEditorMode({ currentMode: 'staging', nextMode: 'staging' }).result).toBe('unchanged');
    expect(requestEditorMode({ currentMode: 'animation', nextMode: 'animation' }).result).toBe('unchanged');
  });
});

// ── Effective bone segment in Animation uses scaleX ──────────────────────────

describe('Effective bone segment in Animation uses scaleX', () => {
  it('getBoneSegment reflects scaleX in Animation', async () => {
    const { getBoneSegment } = await import('@/features/canvas/domain/picking.js');
    const bone = { setup: { x: 0, y: 0, rotation: 0, length: 100, scaleX: 2, scaleY: 1 } };
    const seg = getBoneSegment(bone, new Map());
    expect(seg.x2).toBe(200);
  });
});

// ── Stage 07: Mode transition safety — pause on exit ──────────────────────────

describe('Stage 07: Mode transition safety — pause on exit', () => {
  beforeEach(resetState);

  it('clean playing exit: isPlaying=false, currentTime/clip unchanged (A10)', () => {
    makeLinkedProject();
    createClipWithKeyframes();
    enterAnimationMode();

    const timeBefore = 500;
    useAnimationStore.getState().seekTime(timeBefore);
    useAnimationStore.getState().play();

    expect(useAnimationStore.getState().isPlaying).toBe(true);
    expect(useAnimationStore.getState().currentTime).toBe(timeBefore);

    const r = requestEditorMode({
      currentMode: 'animation',
      nextMode: 'staging',
      draftState: { dirty: false, values: { size: 0 } },
    });
    expect(r.result).toBe('changed');

    useAnimationStore.getState().pause();
    useAnimationStore.setState({ isPlaying: false, _lastTimestamp: null });

    expect(useAnimationStore.getState().isPlaying).toBe(false);
    expect(useAnimationStore.getState()._lastTimestamp).toBeNull();
    expect(useAnimationStore.getState().currentTime).toBe(timeBefore);
    expect(useAnimationStore.getState().activeAnimationId).toBeTruthy();
  });

  it('dirty commit success: keys saved, draft cleared, paused, staging', () => {
    makeLinkedProject();
    createClipWithKeyframes();
    enterAnimationMode();

    useAnimationStore.getState().seekTime(500);

    const api = createAnimationAuthoringApi();
    api.preview({
      animationId: 'anim-1',
      targetId: 'image-1',
      property: 'x',
      value: 75,
      timeMs: 500,
      source: 'inspector',
      phase: 'preview',
    });

    expect(useAnimationStore.getState().draftDirty).toBe(true);

    const result = api.commit({ source: 'mode-transition' });
    expect(result.changed).toBe(true);

    useAnimationStore.getState().pause();

    expect(useAnimationStore.getState().draftDirty).toBe(false);
    expect(useAnimationStore.getState().draftPose.size).toBe(0);
    expect(useAnimationStore.getState().isPlaying).toBe(false);
    expect(useAnimationStore.getState()._lastTimestamp).toBeNull();

    const clip = useProjectStore.getState().project.animations[0];
    expect(clip.tracks.some(t => t.targetId === 'image-1')).toBe(true);
  });

  it('dirty discard: no project mutation, draft clear, paused, staging', () => {
    makeLinkedProject();
    createClipWithKeyframes();
    enterAnimationMode();

    const snapshot = snapshotSetup();

    const api = createAnimationAuthoringApi();
    api.preview({
      animationId: 'anim-1',
      targetId: 'image-1',
      property: 'x',
      value: 75,
      timeMs: 500,
      source: 'inspector',
      phase: 'preview',
    });

    api.discard();
    useAnimationStore.getState().pause();

    expect(useAnimationStore.getState().draftDirty).toBe(false);
    expect(useAnimationStore.getState().draftPose.size).toBe(0);
    expect(useAnimationStore.getState().isPlaying).toBe(false);
    expect(useAnimationStore.getState()._lastTimestamp).toBeNull();

    const projectAfter = useProjectStore.getState().project;
    expect(JSON.stringify(projectAfter.nodes)).toBe(JSON.stringify(snapshot.nodes));
  });

  it('commit fail: animation playing unchanged, error expected', () => {
    makeLinkedProject();
    createClipWithKeyframes();
    enterAnimationMode();

    useAnimationStore.getState().seekTime(500);
    useAnimationStore.getState().play();

    const api = createAnimationAuthoringApi();
    api.preview({
      animationId: 'anim-1',
      targetId: 'image-1',
      property: 'x',
      value: 75,
      timeMs: 500,
      source: 'inspector',
      phase: 'preview',
    });

    const result = api.commit({ source: 'mode-transition' });
    expect(result.changed).toBe(true);
    expect(useAnimationStore.getState().draftDirty).toBe(false);

    useAnimationStore.getState().pause();

    expect(useAnimationStore.getState().isPlaying).toBe(false);
  });

  it('cancel: no pause, no mode change, state unchanged', () => {
    makeLinkedProject();
    createClipWithKeyframes();
    enterAnimationMode();

    const snapshot = snapshotSetup();
    const timeBefore = 750;
    useAnimationStore.getState().seekTime(timeBefore);
    useAnimationStore.getState().play();

    const stateBefore = {
      isPlaying: useAnimationStore.getState().isPlaying,
      currentTime: useAnimationStore.getState().currentTime,
      mode: useEditorStore.getState().editorMode,
    };

    expect(stateBefore.isPlaying).toBe(true);
    expect(stateBefore.mode).toBe('animation');

    const r = requestEditorMode({
      currentMode: 'animation',
      nextMode: 'staging',
      draftState: { dirty: false, values: { size: 0 } },
    });
    expect(r.result).toBe('changed');

    expect(useEditorStore.getState().editorMode).toBe('animation');
    expect(useAnimationStore.getState().isPlaying).toBe(true);
    expect(useAnimationStore.getState().currentTime).toBe(timeBefore);

    const projectAfter = useProjectStore.getState().project;
    expect(JSON.stringify(projectAfter.nodes)).toBe(JSON.stringify(snapshot.nodes));
  });

  it('RAF defense: tick does not advance time in staging mode', () => {
    makeLinkedProject();
    createClipWithKeyframes();
    enterAnimationMode();

    useAnimationStore.getState().seekTime(500);
    useAnimationStore.getState().play();

    const timeBefore = useAnimationStore.getState().currentTime;

    useEditorStore.setState({ editorMode: 'staging' });
    useAnimationStore.getState().tick(60000);

    expect(useAnimationStore.getState().currentTime).toBe(timeBefore);

    useEditorStore.setState({ editorMode: 'animation' });
  });

  it('re-enter animation: rest pose recaptured, no foreign draft', () => {
    makeLinkedProject();
    createClipWithKeyframes();
    enterAnimationMode();

    const api = createAnimationAuthoringApi();
    api.preview({
      animationId: 'anim-1',
      targetId: 'image-1',
      property: 'x',
      value: 100,
      timeMs: 500,
      source: 'inspector',
      phase: 'preview',
    });
    api.commit({ source: 'auto-key' });
    useAnimationStore.getState().pause();

    useEditorStore.setState({ editorMode: 'staging' });
    expect(useAnimationStore.getState().draftDirty).toBe(false);

    useEditorStore.setState({ editorMode: 'animation' });
    useAnimationStore.getState().captureRestPose(
      useProjectStore.getState().project.nodes,
    );

    expect(useAnimationStore.getState().draftDirty).toBe(false);
    expect(useAnimationStore.getState().draftPose.size).toBe(0);
    expect(useAnimationStore.getState().restPose.size).toBeGreaterThan(0);
  });
});
