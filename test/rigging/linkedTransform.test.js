import { describe, it, expect } from 'vitest';
import {
  translateLinkedBoneGroup,
  translateLinkedBoneSelection,
  rotateLinkedBone,
  rotateLinkedBoneSelection,
  setBoneLength,
  scaleBoneSelectionLengths,
  translateLinkedNodeGroup,
  rotateLinkedNodeGroup,
  scaleLinkedNodeGroup,
  applyLinkedTranslation,
} from '@/features/rigging/domain/linkedTransform.js';
import { assignNodeToBone, setBoneLinkLocked } from '@/features/rigging/domain/boneAssignment.js';

function makeProject() {
  return {
    nodes: [
      {
        id: 'armature',
        type: 'group',
        transform: { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1, pivotX: 0, pivotY: 0 },
      },
      {
        id: 'part-1',
        type: 'part',
        transform: { x: 100, y: 100, rotation: 0, scaleX: 1, scaleY: 1, pivotX: 0, pivotY: 0 },
      },
      {
        id: 'part-2',
        type: 'part',
        transform: { x: 200, y: 50, rotation: 0, scaleX: 1, scaleY: 1, pivotX: 0, pivotY: 0 },
      },
      {
        id: 'unrelated',
        type: 'part',
        transform: { x: 500, y: 500, rotation: 0, scaleX: 1, scaleY: 1, pivotX: 0, pivotY: 0 },
      },
    ],
    bones: [
      { id: 'root', nodeId: 'armature', setup: { x: 0, y: 0, rotation: 0, length: 100 } },
      { id: 'child', parentId: 'root', setup: { x: 0, y: 0, rotation: 0, length: 80 } },
    ],
  };
}

describe('translateLinkedBoneGroup', () => {
  it('moves the root bone and its branch by dx/dy when link is ON', () => {
    const project = makeProject();
    assignNodeToBone(project.nodes[1], 'root');
    setBoneLinkLocked(project.nodes[1], true);

    translateLinkedBoneGroup(project, 'root', 10, 20);

    expect(project.bones[0].setup.x).toBe(10);
    expect(project.bones[0].setup.y).toBe(20);
    expect(project.bones[1].setup.x).toBe(10);
    expect(project.bones[1].setup.y).toBe(20);
    expect(project.nodes[1].transform.x).toBe(110);
    expect(project.nodes[1].transform.y).toBe(120);
  });

  it('does not move assigned nodes when link is OFF', () => {
    const project = makeProject();
    assignNodeToBone(project.nodes[1], 'root');
    setBoneLinkLocked(project.nodes[1], false);

    translateLinkedBoneGroup(project, 'root', 10, 20);

    expect(project.bones[0].setup.x).toBe(10);
    expect(project.bones[0].setup.y).toBe(20);
    expect(project.nodes[1].transform.x).toBe(100);
    expect(project.nodes[1].transform.y).toBe(100);
  });

  it('does not move unrelated nodes', () => {
    const project = makeProject();
    assignNodeToBone(project.nodes[1], 'root');
    setBoneLinkLocked(project.nodes[1], true);

    translateLinkedBoneGroup(project, 'root', 5, 5);

    expect(project.nodes[3].transform.x).toBe(500);
    expect(project.nodes[3].transform.y).toBe(500);
  });

  it('does nothing for unknown boneId', () => {
    const project = makeProject();
    translateLinkedBoneGroup(project, 'missing', 1, 1);
    expect(project.bones[0].setup.x).toBe(0);
  });

  it('skips non-part nodes even when they appear assigned', () => {
    const project = makeProject();
    assignNodeToBone(project.nodes[0], 'root');
    setBoneLinkLocked(project.nodes[0], true);
    translateLinkedBoneGroup(project, 'root', 1, 1);
    expect(project.nodes[0].transform.x).toBe(0);
  });
});

describe('multi-bone transforms', () => {
  it('moves overlapping selected branches only once', () => {
    const project = makeProject();
    assignNodeToBone(project.nodes[1], 'child');
    setBoneLinkLocked(project.nodes[1], true);

    translateLinkedBoneSelection(project, ['root', 'child'], 10, 20);

    expect(project.bones[0].setup.x).toBe(10);
    expect(project.bones[1].setup.x).toBe(10);
    expect(project.nodes[1].transform.x).toBe(110);
  });

  it('scales every selected bone length by the same percentage', () => {
    const project = makeProject();

    scaleBoneSelectionLengths(project, { root: 100, child: 80 }, 1.5);

    expect(project.bones[0].setup.length).toBe(150);
    expect(project.bones[1].setup.length).toBe(120);
  });

  it('rotates selected bones around their shared center', () => {
    const project = makeProject();
    project.bones[0].setup.x = 0;
    project.bones[1].setup.x = 100;

    rotateLinkedBoneSelection(project, ['root', 'child'], 180);

    expect(project.bones[0].setup.x).toBeCloseTo(100);
    expect(project.bones[1].setup.x).toBeCloseTo(0);
    expect(project.bones[0].setup.rotation).toBe(180);
    expect(project.bones[1].setup.rotation).toBe(180);
  });
});

describe('rotateLinkedBone', () => {
  it('rotates the bone.setup.rotation by deltaDegrees', () => {
    const project = makeProject();
    rotateLinkedBone(project, 'root', 30);
    expect(project.bones[0].setup.rotation).toBe(30);
  });

  it('rotates linked nodes around the bone pivot', () => {
    const project = makeProject();
    assignNodeToBone(project.nodes[1], 'root');
    setBoneLinkLocked(project.nodes[1], true);
    project.bones[0].setup.x = 0;
    project.bones[0].setup.y = 0;
    project.nodes[1].transform.x = 100;
    project.nodes[1].transform.y = 0;

    rotateLinkedBone(project, 'root', 90);

    expect(project.nodes[1].transform.rotation).toBe(90);
    expect(project.nodes[1].transform.x).toBeCloseTo(0, 5);
    expect(project.nodes[1].transform.y).toBeCloseTo(100, 5);
  });

  it('uses rendered x+pivot position and does not drift', () => {
    const project = makeProject();
    assignNodeToBone(project.nodes[1], 'root');
    setBoneLinkLocked(project.nodes[1], true);
    project.nodes[1].transform = {
      x: 90, y: -10, rotation: 0, scaleX: 1, scaleY: 1, pivotX: 10, pivotY: 10,
    };

    rotateLinkedBone(project, 'root', 45);
    rotateLinkedBone(project, 'root', 45);

    expect(project.nodes[1].transform.x).toBeCloseTo(-10, 5);
    expect(project.nodes[1].transform.y).toBeCloseTo(90, 5);
  });

  it('skips linked nodes when link is OFF', () => {
    const project = makeProject();
    assignNodeToBone(project.nodes[1], 'root');
    setBoneLinkLocked(project.nodes[1], false);
    project.nodes[1].transform.x = 100;
    project.nodes[1].transform.y = 0;

    rotateLinkedBone(project, 'root', 90);

    expect(project.bones[0].setup.rotation).toBe(90);
    expect(project.nodes[1].transform.x).toBe(100);
    expect(project.nodes[1].transform.y).toBe(0);
  });
});

describe('setBoneLength', () => {
  it('updates bone.setup.length and clamps to minimum 10', () => {
    const project = makeProject();
    setBoneLength(project, 'root', 5);
    expect(project.bones[0].setup.length).toBe(10);

    setBoneLength(project, 'root', 200);
    expect(project.bones[0].setup.length).toBe(200);
  });

  it('uniformly scales linked nodes on both axes', () => {
    const project = makeProject();
    assignNodeToBone(project.nodes[1], 'root');
    setBoneLinkLocked(project.nodes[1], true);
    project.bones[0].setup.x = 0;
    project.bones[0].setup.y = 0;
    project.bones[0].setup.rotation = 0;
    project.bones[0].setup.length = 100;
    project.nodes[1].transform.x = 80;
    project.nodes[1].transform.y = 0;

    setBoneLength(project, 'root', 150);

    expect(project.bones[0].setup.length).toBe(150);
    expect(project.nodes[1].transform.x).toBe(120);
    expect(project.nodes[1].transform.y).toBe(0);
    expect(project.nodes[1].transform.scaleX).toBe(1.5);
    expect(project.nodes[1].transform.scaleY).toBe(1.5);
  });

  it('keeps image endpoints aligned by scaling around the bone start', () => {
    const project = makeProject();
    assignNodeToBone(project.nodes[1], 'root');
    setBoneLinkLocked(project.nodes[1], true);
    project.bones[0].setup.x = 10;
    project.bones[0].setup.y = 20;
    project.bones[0].setup.length = 100;
    project.nodes[1].transform = {
      x: 30, y: 50, rotation: 25, scaleX: 1, scaleY: 1, pivotX: 10, pivotY: 15,
    };

    setBoneLength(project, 'root', 200);

    // Whole image matrix scales around (10,20): its attachment offset doubles.
    expect(project.nodes[1].transform.x).toBeCloseTo(60);
    expect(project.nodes[1].transform.y).toBeCloseTo(95);
    expect(project.nodes[1].transform.scaleX).toBeCloseTo(2);
    expect(project.nodes[1].transform.scaleY).toBeCloseTo(2);
    expect(project.nodes[1].transform.rotation).toBeCloseTo(25);
  });

  it('does not move linked nodes when link is OFF', () => {
    const project = makeProject();
    assignNodeToBone(project.nodes[1], 'root');
    setBoneLinkLocked(project.nodes[1], false);
    project.bones[0].setup.length = 100;
    project.nodes[1].transform.x = 50;
    project.nodes[1].transform.y = 0;

    setBoneLength(project, 'root', 200);

    expect(project.bones[0].setup.length).toBe(200);
    expect(project.nodes[1].transform.x).toBe(50);
  });
});

describe('linked node rotation and scale', () => {
  it('does not scale unrelated mesh-less parts when modern bones omit nodeId', () => {
    const project = {
      nodes: [
        { id: 'a', type: 'part', boneId: 'b1', transform: { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1, pivotX: 0, pivotY: 0 } },
        { id: 'b', type: 'part', boneId: 'b2', transform: { x: 100, y: 0, rotation: 0, scaleX: 1, scaleY: 1, pivotX: 0, pivotY: 0 } },
      ],
      bones: [
        { id: 'b1', setup: { x: 0, y: 0, rotation: 0, length: 100 } },
        { id: 'b2', setup: { x: 100, y: 0, rotation: 0, length: 100 } },
      ],
    };

    scaleLinkedNodeGroup(project, 'b', 2, 2);

    expect(project.nodes[0].transform).toEqual({ x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1, pivotX: 0, pivotY: 0 });
    expect(project.nodes[1].transform.scaleX).toBeCloseTo(2);
    expect(project.bones[0].setup.length).toBe(100);
    expect(project.bones[1].setup.length).toBeCloseTo(200);
  });

  it('scales a linked group around an explicit world pivot', () => {
    const project = makeProject();
    assignNodeToBone(project.nodes[1], 'root');
    setBoneLinkLocked(project.nodes[1], true);
    project.nodes[1].transform = { x: 100, y: 100, rotation: 0, scaleX: 1, scaleY: 1, pivotX: 0, pivotY: 0 };
    project.bones[0].setup.x = 100;
    project.bones[0].setup.y = 100;

    scaleLinkedNodeGroup(project, 'part-1', 2, 2, { pivotWorld: { x: 200, y: 200 } });

    expect(project.nodes[1].transform.x).toBeCloseTo(0);
    expect(project.nodes[1].transform.y).toBeCloseTo(0);
    expect(project.nodes[1].transform.scaleX).toBeCloseTo(2);
    expect(project.nodes[1].transform.scaleY).toBeCloseTo(2);
  });

  it('rotates image in place and its assigned bone by same delta', () => {
    const project = makeProject();
    assignNodeToBone(project.nodes[1], 'root');
    setBoneLinkLocked(project.nodes[1], true);
    project.nodes[1].transform.pivotX = 25;
    project.nodes[1].transform.pivotY = 15;

    rotateLinkedNodeGroup(project, 'part-1', 30);

    expect(project.nodes[1].transform.x).toBeCloseTo(100);
    expect(project.nodes[1].transform.y).toBeCloseTo(100);
    expect(project.nodes[1].transform.rotation).toBeCloseTo(30);
    expect(project.bones[0].setup.rotation).toBeCloseTo(30);
  });

  it('rotates sibling and full bone geometry around source image pivot', () => {
    const project = makeProject();
    assignNodeToBone(project.nodes[1], 'root');
    setBoneLinkLocked(project.nodes[1], true);
    assignNodeToBone(project.nodes[2], 'root');
    setBoneLinkLocked(project.nodes[2], true);

    rotateLinkedNodeGroup(project, 'part-1', 90);

    expect(project.nodes[1].transform.x).toBeCloseTo(100);
    expect(project.nodes[1].transform.y).toBeCloseTo(100);
    expect(project.nodes[2].transform.x).toBeCloseTo(150);
    expect(project.nodes[2].transform.y).toBeCloseTo(200);
    expect(project.nodes[2].transform.rotation).toBeCloseTo(90);
    expect(project.bones[0].setup.x).toBeCloseTo(200);
    expect(project.bones[0].setup.y).toBeCloseTo(0);
    expect(project.bones[0].setup.rotation).toBeCloseTo(90);
    expect(project.bones[0].setup.length).toBeCloseTo(100);
  });

  it('scales linked images and bone length', () => {
    const project = makeProject();
    assignNodeToBone(project.nodes[1], 'root');
    setBoneLinkLocked(project.nodes[1], true);
    assignNodeToBone(project.nodes[2], 'root');
    setBoneLinkLocked(project.nodes[2], true);

    scaleLinkedNodeGroup(project, 'part-1', 1.5, 2);

    expect(project.bones[0].setup.length).toBe(150);
    expect(project.nodes[1].transform.scaleX).toBe(1.5);
    expect(project.nodes[1].transform.scaleY).toBe(2);
    expect(project.nodes[2].transform.scaleX).toBe(1.5);
    expect(project.nodes[2].transform.scaleY).toBe(2);
  });

  it('scales sibling position and full bone geometry around source image pivot', () => {
    const project = makeProject();
    assignNodeToBone(project.nodes[1], 'root');
    setBoneLinkLocked(project.nodes[1], true);
    assignNodeToBone(project.nodes[2], 'root');
    setBoneLinkLocked(project.nodes[2], true);

    scaleLinkedNodeGroup(project, 'part-1', 1.5, 2);

    expect(project.nodes[1].transform.x).toBeCloseTo(100);
    expect(project.nodes[1].transform.y).toBeCloseTo(100);
    expect(project.nodes[2].transform.x).toBeCloseTo(250);
    expect(project.nodes[2].transform.y).toBeCloseTo(0);
    expect(project.bones[0].setup.x).toBeCloseTo(-50);
    expect(project.bones[0].setup.y).toBeCloseTo(-100);
    expect(project.bones[0].setup.rotation).toBeCloseTo(0);
    expect(project.bones[0].setup.length).toBeCloseTo(150);
  });

  it('updates bone angle when non-uniform image scaling changes its direction', () => {
    const project = makeProject();
    assignNodeToBone(project.nodes[1], 'root');
    setBoneLinkLocked(project.nodes[1], true);
    project.bones[0].setup.rotation = 45;

    scaleLinkedNodeGroup(project, 'part-1', 2, 1);

    expect(project.bones[0].setup.rotation).toBeCloseTo(26.565, 3);
    expect(project.bones[0].setup.length).toBeCloseTo(Math.sqrt(25000), 5);
  });
});

describe('translateLinkedNodeGroup', () => {
  it('moves the node by dx/dy', () => {
    const project = makeProject();
    translateLinkedNodeGroup(project, 'part-1', 5, -5);
    expect(project.nodes[1].transform.x).toBe(105);
    expect(project.nodes[1].transform.y).toBe(95);
  });

  it('moves the assigned bone and its branch when link is ON', () => {
    const project = makeProject();
    assignNodeToBone(project.nodes[1], 'root');
    setBoneLinkLocked(project.nodes[1], true);

    translateLinkedNodeGroup(project, 'part-1', 10, 0);

    expect(project.nodes[1].transform.x).toBe(110);
    expect(project.bones[0].setup.x).toBe(10);
    expect(project.bones[1].setup.x).toBe(10);
  });

  it('does not move the bone when link is OFF', () => {
    const project = makeProject();
    assignNodeToBone(project.nodes[1], 'root');
    setBoneLinkLocked(project.nodes[1], false);

    translateLinkedNodeGroup(project, 'part-1', 10, 0);

    expect(project.nodes[1].transform.x).toBe(110);
    expect(project.bones[0].setup.x).toBe(0);
  });
});

describe('applyLinkedTranslation', () => {
  it('routes to bone translate when boneId is given', () => {
    const project = makeProject();
    assignNodeToBone(project.nodes[1], 'root');
    setBoneLinkLocked(project.nodes[1], true);
    applyLinkedTranslation(project, { boneId: 'root', dx: 7, dy: 0 });
    expect(project.bones[0].setup.x).toBe(7);
    expect(project.nodes[1].transform.x).toBe(107);
  });

  it('routes to node translate when nodeId is given', () => {
    const project = makeProject();
    assignNodeToBone(project.nodes[1], 'root');
    setBoneLinkLocked(project.nodes[1], true);
    applyLinkedTranslation(project, { nodeId: 'part-1', dx: 0, dy: 4 });
    expect(project.nodes[1].transform.y).toBe(104);
    expect(project.bones[0].setup.y).toBe(4);
  });

  it('does nothing when neither boneId nor nodeId is given', () => {
    const project = makeProject();
    applyLinkedTranslation(project, { dx: 99, dy: 99 });
    expect(project.bones[0].setup.x).toBe(0);
  });
});
