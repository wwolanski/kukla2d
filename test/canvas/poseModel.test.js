import { describe, expect, it } from 'vitest';
import { buildFramePose } from '@/features/canvas/domain/framePose.js';
import { bakeDefaultPoseIntoSetup } from '@/features/canvas/domain/poseBake.js';
import { translateLinkedBoneSelection } from '@/features/rigging';
import { makeLocalMatrix, mat3Inverse, mat3Mul } from '@/domain/transforms.js';
import {
  clearDefaultPoseTarget,
  mergeDraftIntoDefaultPose,
  mergePoseLayers,
} from '@/features/canvas/domain/poseModel.js';

function projectFixture() {
  return {
    nodes: [{
      id: 'image',
      type: 'part',
      parent: null,
      boneId: 'arm',
      transform: {
        x: 10, y: 0, rotation: 0, scaleX: 1, scaleY: 1, pivotX: 0, pivotY: 0,
      },
      visible: true,
      opacity: 1,
    }],
    bones: [{
      id: 'arm',
      parentId: null,
      setup: {
        x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1, shearX: 0, shearY: 0, length: 10,
      },
    }],
    constraints: [],
    animations: [],
    defaultPose: { arm: { rotation: 90 } },
  };
}

describe('pose model', () => {
  it('applies default bone pose and moves a linked image without mutating setup', () => {
    const project = projectFixture();
    const result = buildFramePose({
      project,
      editorState: { editorMode: 'staging' },
      animationState: { draftPose: new Map() },
    });

    expect(result.effectiveBones[0].setup.rotation).toBe(90);
    expect(result.effectiveNodes[0].transform.x).toBeCloseTo(0);
    expect(result.effectiveNodes[0].transform.y).toBeCloseTo(10);
    expect(result.effectiveNodes[0].transform.rotation).toBe(90);
    expect(project.bones[0].setup.rotation).toBe(0);
    expect(project.nodes[0].transform.x).toBe(10);
  });

  it('keeps draft above default pose', () => {
    const result = buildFramePose({
      project: projectFixture(),
      editorState: { editorMode: 'staging' },
      animationState: { draftPose: new Map([['arm', { rotation: 180 }]]) },
    });

    expect(result.effectiveBones[0].setup.rotation).toBe(180);
    expect(result.effectiveNodes[0].transform.x).toBeCloseTo(-10);
    expect(result.effectiveNodes[0].transform.y).toBeCloseTo(0);
  });

  it('serializes draft values into persistent default pose', () => {
    const result = mergeDraftIntoDefaultPose(
      { arm: { rotation: 10 } },
      new Map([['arm', { rotation: 30, x: 4 }]]),
    );

    expect(result).toEqual({ arm: { rotation: 30, x: 4 } });
  });

  it('clears only the transformed target from default pose', () => {
    const project = {
      defaultPose: {
        arm: { rotation: 30 },
        hand: { rotation: 10 },
      },
    };

    expect(clearDefaultPoseTarget(project, 'arm')).toBe(true);
    expect(project.defaultPose).toEqual({ hand: { rotation: 10 } });
    expect(clearDefaultPoseTarget(project, 'missing')).toBe(false);
  });

  it('bakes a saved pose into bone and linked-node setup without a visual jump', () => {
    const project = projectFixture();
    const before = buildFramePose({
      project,
      editorState: { editorMode: 'staging' },
      animationState: { draftPose: new Map() },
    });

    expect(bakeDefaultPoseIntoSetup(project, new Map())).toBe(true);

    const after = buildFramePose({
      project,
      editorState: { editorMode: 'staging' },
      animationState: { draftPose: new Map() },
    });
    expect(project.defaultPose).toEqual({});
    expect(project.bones[0].setup.rotation).toBe(90);
    expect(project.nodes[0].transform.x).toBeCloseTo(before.effectiveNodes[0].transform.x);
    expect(project.nodes[0].transform.y).toBeCloseTo(before.effectiveNodes[0].transform.y);
    expect(project.nodes[0].transform.rotation).toBeCloseTo(before.effectiveNodes[0].transform.rotation);
    expect(after.effectiveNodes[0].transform).toEqual(project.nodes[0].transform);
  });

  it('rebinds weighted mesh vertices when saving pose as setup', () => {
    const project = projectFixture();
    project.defaultPose = {};
    project.nodes[0].transform.x = 100;
    project.bones[0].setup.x = 100;
    project.nodes[0].mesh = {
      vertices: [{ x: 10, y: 0 }],
      influences: [[{ boneId: 'arm', weight: 1 }]],
    };
    const draft = new Map([['arm', { rotation: 90 }]]);
    const before = buildFramePose({
      project,
      editorState: { editorMode: 'staging' },
      animationState: { draftPose: draft },
    });

    bakeDefaultPoseIntoSetup(project, draft);

    expect(project.bones[0].setup.rotation).toBe(90);
    expect(project.nodes[0].mesh.vertices[0].x)
      .toBeCloseTo(before.effectiveMeshes.get('image').vertices[0].x);
    expect(project.nodes[0].mesh.vertices[0].y)
      .toBeCloseTo(before.effectiveMeshes.get('image').vertices[0].y);
  });

  it('preserves child bones when baking a parent pose', () => {
    const project = projectFixture();
    project.bones.push({
      id: 'hand',
      parentId: 'arm',
      setup: { x: 10, y: 0, rotation: 0, scaleX: 1, scaleY: 1, length: 5 },
    });
    const before = buildFramePose({
      project,
      editorState: { editorMode: 'staging' },
      animationState: { draftPose: new Map() },
    });

    bakeDefaultPoseIntoSetup(project, new Map());
    const after = buildFramePose({
      project,
      editorState: { editorMode: 'staging' },
      animationState: { draftPose: new Map() },
    });

    expect(after.effectiveBones.find(bone => bone.id === 'hand').setup)
      .toEqual(before.effectiveBones.find(bone => bone.id === 'hand').setup);
  });

  it('keeps an IK result stable after baking its target into setup', () => {
    const project = projectFixture();
    project.defaultPose = {};
    project.constraints = [{
      id: 'ik',
      type: 'ik',
      enabled: true,
      affectedBoneIds: ['arm'],
      targetX: 10,
      targetY: 0,
      mix: 1,
      fkIk: 1,
    }];
    const draft = new Map([['ik', { targetX: 0, targetY: 10 }]]);
    const before = buildFramePose({
      project,
      editorState: { editorMode: 'staging' },
      animationState: { draftPose: draft },
    });

    bakeDefaultPoseIntoSetup(project, draft);
    const after = buildFramePose({
      project,
      editorState: { editorMode: 'staging' },
      animationState: { draftPose: new Map() },
    });

    expect(project.constraints[0]).toMatchObject({ targetX: 0, targetY: 10 });
    expect(after.effectiveBones[0].setup.rotation)
      .toBeCloseTo(before.effectiveBones[0].setup.rotation);
  });

  it('deforms weighted mesh vertices around the bind bone', () => {
    const project = projectFixture();
    project.nodes[0].transform.x = 100;
    project.bones[0].setup.x = 100;
    project.nodes[0].mesh = {
      vertices: [{ x: 10, y: 0 }],
      influences: [[{ boneId: 'arm', weight: 1 }]],
    };

    const result = buildFramePose({
      project,
      editorState: { editorMode: 'staging' },
      animationState: { draftPose: new Map() },
    });

    expect(result.effectiveMeshes.get('image').vertices[0].x).toBeCloseTo(0);
    expect(result.effectiveMeshes.get('image').vertices[0].y).toBeCloseTo(10);
    expect(result.effectiveNodes[0].transform.x).toBe(100);
  });

  it('keeps a rigid image attachment stable while moving an IK bone setup', () => {
    const project = {
      nodes: [{
        id: 'head',
        type: 'part',
        parent: null,
        boneId: 'bone',
        transform: {
          x: 333.0411545333204,
          y: -115.64510312296365,
          rotation: -49.27997807262831,
          scaleX: 1,
          scaleY: 1,
          pivotX: 240,
          pivotY: 240,
        },
        visible: true,
        opacity: 1,
      }],
      bones: [{
        id: 'bone',
        parentId: null,
        nodeId: null,
        setup: {
          x: 771.3862733791194,
          y: 244.63114922555553,
          rotation: -90.43405063213943,
          scaleX: 1,
          scaleY: 1,
          length: 394.5323944281239,
        },
      }],
      constraints: [{
        id: 'ik',
        type: 'ik',
        enabled: true,
        affectedBoneIds: ['bone'],
        targetX: 239.3805834999431,
        targetY: -158.85631219966234,
        mix: 1,
        fkIk: 1,
      }],
      animations: [],
    };
    const evaluate = () => buildFramePose({
      project,
      editorState: { editorMode: 'staging' },
      animationState: { draftPose: new Map() },
    });
    const attachmentMatrix = frame => mat3Mul(
      mat3Inverse(makeLocalMatrix(frame.effectiveBones[0].setup)),
      makeLocalMatrix(frame.effectiveNodes[0].transform),
    );

    const before = attachmentMatrix(evaluate());
    translateLinkedBoneSelection(project, ['bone'], -350, 280);
    const after = attachmentMatrix(evaluate());

    for (let index = 0; index < before.length; index++) {
      expect(after[index]).toBeCloseTo(before[index], 4);
    }
  });

  it('propagates a parent pose through child bones and their images', () => {
    const project = projectFixture();
    project.bones.push({
      id: 'hand',
      parentId: 'arm',
      setup: {
        x: 10, y: 0, rotation: 0, scaleX: 1, scaleY: 1, shearX: 0, shearY: 0, length: 5,
      },
    });
    project.nodes.push({
      id: 'hand-image',
      type: 'part',
      parent: null,
      boneId: 'hand',
      transform: {
        x: 12, y: 0, rotation: 0, scaleX: 1, scaleY: 1, pivotX: 0, pivotY: 0,
      },
      visible: true,
      opacity: 1,
    });
    project.nodes.push({
      id: 'weighted-hand-image',
      type: 'part',
      parent: null,
      boneId: 'hand',
      transform: {
        x: 40, y: 0, rotation: 0, scaleX: 1, scaleY: 1, pivotX: 0, pivotY: 0,
      },
      mesh: {
        vertices: [{ x: 10, y: 0 }],
        influences: [[{ boneId: 'hand', weight: 1 }]],
      },
      visible: true,
      opacity: 1,
    });

    const result = buildFramePose({
      project,
      editorState: { editorMode: 'staging' },
      animationState: { draftPose: new Map() },
    });
    const hand = result.effectiveBones.find(bone => bone.id === 'hand');
    const handImage = result.effectiveNodes.find(node => node.id === 'hand-image');
    const weightedFrame = result.effectiveMeshes.get('weighted-hand-image');

    expect(hand.setup.x).toBeCloseTo(0);
    expect(hand.setup.y).toBeCloseTo(10);
    expect(hand.setup.rotation).toBe(90);
    expect(handImage.transform.x).toBeCloseTo(0);
    expect(handImage.transform.y).toBeCloseTo(12);
    expect(handImage.transform.rotation).toBe(90);
    expect(weightedFrame.vertices[0].x + 40).toBeCloseTo(0);
    expect(weightedFrame.vertices[0].y).toBeCloseTo(50);
    expect(Number.isFinite(weightedFrame.vertices[0].x)).toBe(true);
  });

  it('keeps linked parts in node-local space when their parent is transformed', () => {
    const project = projectFixture();
    project.nodes.unshift({
      id: 'group',
      type: 'group',
      parent: null,
      transform: {
        x: 100, y: 0, rotation: 0, scaleX: 1, scaleY: 1, pivotX: 0, pivotY: 0,
      },
      visible: true,
      opacity: 1,
    });
    project.nodes[1].parent = 'group';
    project.nodes[1].transform.x = 20;
    project.bones[0].setup.x = 110;

    const result = buildFramePose({
      project,
      editorState: { editorMode: 'staging' },
      animationState: { draftPose: new Map() },
    });
    const image = result.effectiveNodes.find(node => node.id === 'image');

    expect(image.transform.x).toBeCloseTo(10);
    expect(image.transform.y).toBeCloseTo(10);
  });

  it('re-evaluates descendants after an IK constraint rotates their parent', () => {
    const project = projectFixture();
    project.defaultPose = {};
    project.bones.push(
      {
        id: 'hand',
        parentId: 'arm',
        setup: { x: 10, y: 0, rotation: 0, scaleX: 1, scaleY: 1, length: 5 },
      },
      {
        id: 'finger',
        parentId: 'hand',
        setup: { x: 15, y: 0, rotation: 0, scaleX: 1, scaleY: 1, length: 2 },
      },
    );
    project.constraints = [{
      id: 'ik',
      type: 'ik',
      order: 0,
      enabled: true,
      affectedBoneIds: ['arm'],
      targetX: 0,
      targetY: 20,
      mix: 1,
    }];

    const result = buildFramePose({
      project,
      editorState: { editorMode: 'staging' },
      animationState: { draftPose: new Map() },
    });
    const hand = result.effectiveBones.find(bone => bone.id === 'hand');
    const finger = result.effectiveBones.find(bone => bone.id === 'finger');

    expect(hand.setup.x).toBeCloseTo(0);
    expect(hand.setup.y).toBeCloseTo(10);
    expect(finger.setup.x).toBeCloseTo(0);
    expect(finger.setup.y).toBeCloseTo(15);
  });
});

describe('pose model precedence characterization', () => {
  function boneSetup(id, setupOverrides = {}, parentId = null) {
    return {
      id,
      parentId,
      setup: { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1, shearX: 0, shearY: 0, length: 10, ...setupOverrides },
    };
  }

  function partNode(id, boneId) {
    return {
      id,
      type: 'part',
      boneId,
      parent: null,
      transform: { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1, pivotX: 0, pivotY: 0 },
      visible: true,
      opacity: 1,
    };
  }

  describe('1. bone hierarchy inherits parent draft', () => {
    it('child bone inherits parent rotation from draft', () => {
      const project = {
        nodes: [partNode('child', 'childBone')],
        bones: [boneSetup('parentBone'), boneSetup('childBone', { x: 10 }, 'parentBone')],
        constraints: [],
        animations: [],
        defaultPose: {},
      };
      const result = buildFramePose({
        project,
        editorState: { editorMode: 'staging' },
        animationState: { draftPose: new Map([['parentBone', { rotation: 90 }]]) },
      });
      const childBone = result.effectiveBones.find(b => b.id === 'childBone');
      expect(childBone.setup.rotation).toBe(90);
    });
  });

  describe('2. bone hierarchy after defaultPose', () => {
    it('defaultPose rotation propagates through hierarchy', () => {
      const project = {
        nodes: [partNode('child', 'childBone')],
        bones: [boneSetup('parentBone'), boneSetup('childBone', { x: 10 }, 'parentBone')],
        constraints: [],
        animations: [],
        defaultPose: { parentBone: { rotation: 45 } },
      };
      const result = buildFramePose({
        project,
        editorState: { editorMode: 'staging' },
        animationState: { draftPose: new Map() },
      });
      const childBone = result.effectiveBones.find(b => b.id === 'childBone');
      expect(childBone.setup.rotation).toBe(45);
    });
  });

  describe('3. IK overrides bone hierarchy', () => {
    it('IK constraint overrides draft on affected bone', () => {
      const project = {
        nodes: [partNode('tip', 'childBone')],
        bones: [
          boneSetup('parentBone'),
          boneSetup('childBone', { x: 10 }, 'parentBone'),
        ],
        constraints: [{
          id: 'ik1',
          type: 'ik',
          order: 0,
          enabled: true,
          affectedBoneIds: ['parentBone'],
          targetX: 0,
          targetY: 20,
          mix: 1,
        }],
        animations: [],
        defaultPose: {},
      };
      const result = buildFramePose({
        project,
        editorState: { editorMode: 'staging' },
        animationState: { draftPose: new Map([['parentBone', { rotation: 10 }]]) },
      });
      const parentBone = result.effectiveBones.find(b => b.id === 'parentBone');
      expect(parentBone.setup.rotation).not.toBe(10);
    });
  });

  describe('4. linked nodes follow bone after all overrides', () => {
    it('node receives bone-constrained transform', () => {
      const project = {
        nodes: [{
          id: 'img',
          type: 'part',
          boneId: 'b1',
          parent: null,
          transform: { x: 10, y: 0, rotation: 0, scaleX: 1, scaleY: 1, pivotX: 0, pivotY: 0 },
          visible: true,
          opacity: 1,
        }],
        bones: [boneSetup('b1')],
        constraints: [],
        animations: [],
        defaultPose: { b1: { rotation: 90 } },
      };
      const result = buildFramePose({
        project,
        editorState: { editorMode: 'staging' },
        animationState: { draftPose: new Map() },
      });
      expect(result.effectiveNodes[0].transform.rotation).toBe(90);
      expect(result.effectiveNodes[0].transform.x).toBeCloseTo(0);
      expect(result.effectiveNodes[0].transform.y).toBeCloseTo(10);
    });
  });

  describe('5. mergePoseLayers applies overlay on top of base', () => {
    it('overlay values override base values', () => {
      const base = new Map([['a', { x: 1, rotation: 10 }]]);
      const overlay = new Map([['a', { rotation: 45 }]]);
      const merged = mergePoseLayers(base, overlay);
      expect(merged.get('a')).toEqual({ x: 1, rotation: 45 });
    });

    it('base values preserved when no overlay', () => {
      const base = new Map([['a', { x: 1 }]]);
      const merged = mergePoseLayers(base, null);
      expect(merged.get('a')).toEqual({ x: 1 });
    });
  });

  describe('6. mergeDraftIntoDefaultPose serializes draft', () => {
    it('draft overrides default pose values', () => {
      const result = mergeDraftIntoDefaultPose(
        { b1: { rotation: 0, x: 5 } },
        new Map([['b1', { rotation: 45 }]]),
      );
      expect(result.b1.rotation).toBe(45);
      expect(result.b1.x).toBe(5);
    });
  });

  describe('7. mesh skinning follows bone after constraint', () => {
    it('weighted mesh vertices follow posed bone', () => {
      const project = {
        nodes: [{
          id: 'meshNode',
          type: 'part',
          boneId: 'b1',
          parent: null,
          transform: { x: 100, y: 0, rotation: 0, scaleX: 1, scaleY: 1, pivotX: 0, pivotY: 0 },
          visible: true,
          opacity: 1,
          mesh: {
            vertices: [{ x: 10, y: 0 }],
            influences: [[{ boneId: 'b1', weight: 1 }]],
          },
        }],
        bones: [{ ...boneSetup('b1'), setup: { ...boneSetup('b1').setup, x: 100 } }],
        constraints: [],
        animations: [],
        defaultPose: { b1: { rotation: 90 } },
      };
      const result = buildFramePose({
        project,
        editorState: { editorMode: 'staging' },
        animationState: { draftPose: new Map() },
      });
      expect(result.effectiveMeshes.get('meshNode').vertices[0].x).toBeCloseTo(0);
      expect(result.effectiveMeshes.get('meshNode').vertices[0].y).toBeCloseTo(10);
    });
  });
});
