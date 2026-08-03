import { describe, it, expect } from 'vitest';
import {
  assignNodeToBone,
  clearNodeBoneAssignment,
  assignProjectNodeToBone,
  clearProjectNodeBoneAssignment,
  isNodeAssignedToBone,
  isBoneLinkLocked,
  setBoneLinkLocked,
  getAssignedBoneForNode,
  getLinkedNodesForBone,
  isLinkedNodeAssignedToBone,
  getNodeMeshInfluenceBoneIds,
  setNodeMeshInfluenceBone,
  assignOrAddProjectNodeBoneInfluence,
} from '@/features/rigging/domain/boneAssignment.js';

function makeMeshPart(id, vertexCount = 4) {
  const vertices = Array.from({ length: vertexCount }, (_, i) => ({ x: i, y: i }));
  return {
    id,
    type: 'part',
    name: id,
    mesh: { vertices, edges: [], triangles: [] },
  };
}

function makeNonMeshPart(id) {
  return { id, type: 'part', name: id };
}

function makeBone(id, name = id) {
  return {
    id,
    name,
    parentId: null,
    nodeId: null,
    inherit: 'normal',
    setup: { x: 0, y: 0, rotation: 0, length: 80 },
  };
}

describe('assignNodeToBone', () => {
  it('sets node.boneId for non-mesh parts', () => {
    const node = makeNonMeshPart('p1');
    assignNodeToBone(node, 'b1');
    expect(node.boneId).toBe('b1');
    expect(node.boneLinkLocked).toBe(false);
  });

  it('sets boneId, influences, jointBoneId, boneWeights for mesh parts', () => {
    const node = makeMeshPart('p1', 3);
    assignNodeToBone(node, 'b1');
    expect(node.boneId).toBe('b1');
    expect(node.mesh.jointBoneId).toBe('b1');
    expect(node.mesh.influences).toHaveLength(3);
    expect(node.mesh.influences[0]).toEqual([{ boneId: 'b1', weight: 1 }]);
    expect(node.mesh.boneWeights).toEqual([1, 1, 1]);
    expect(node.meshInfluenceBoneIds).toEqual(['b1']);
  });

  it('writes boneLinkLocked = false (OFF by default)', () => {
    const node = makeMeshPart('p1', 2);
    assignNodeToBone(node, 'b1');
    expect(node.boneLinkLocked).toBe(false);
  });

  it('is a no-op when node is missing or boneId is missing', () => {
    expect(() => assignNodeToBone(null, 'b1')).not.toThrow();
    const node = makeMeshPart('p1', 2);
    assignNodeToBone(node, null);
    expect(node.boneId).toBeUndefined();
    expect(node.mesh.influences).toBeUndefined();
  });
});

describe('clearNodeBoneAssignment', () => {
  it('clears ownership without destroying deformation weights', () => {
    const node = makeMeshPart('p1', 2);
    assignNodeToBone(node, 'b1');
    clearNodeBoneAssignment(node);
    expect(node.boneId).toBeNull();
    expect(node.mesh.jointBoneId).toBeNull();
    expect(node.mesh.influences[0]).toEqual([{ boneId: 'b1', weight: 1 }]);
    expect(node.mesh.boneWeights).toEqual([1, 1]);
  });

  it('removes explicit boneLinkLocked flag', () => {
    const node = makeMeshPart('p1', 2);
    assignNodeToBone(node, 'b1');
    setBoneLinkLocked(node, false);
    expect(node.boneLinkLocked).toBe(false);
    clearNodeBoneAssignment(node);
    expect(Object.prototype.hasOwnProperty.call(node, 'boneLinkLocked')).toBe(false);
  });

  it('handles nodes without mesh', () => {
    const node = makeNonMeshPart('p1');
    assignNodeToBone(node, 'b1');
    clearNodeBoneAssignment(node);
    expect(node.boneId).toBeNull();
  });
});

describe('project-level bone assignment', () => {
  it('reassigns mesh ownership without leaving a legacy bone.nodeId conflict', () => {
    const node = makeMeshPart('p1', 2);
    const oldBone = { ...makeBone('old'), nodeId: 'p1' };
    const newBone = makeBone('new');
    const project = { nodes: [node], bones: [oldBone, newBone] };

    assignProjectNodeToBone(project, 'p1', 'new');

    expect(node.boneId).toBe('new');
    expect(node.mesh.influences[0]).toEqual([{ boneId: 'new', weight: 1 }]);
    expect(oldBone.nodeId).toBeNull();
  });

  it('unassigns owner fields and reverse refs while preserving mesh weights', () => {
    const node = makeMeshPart('p1', 2);
    const bone = { ...makeBone('b1'), nodeId: 'p1' };
    const project = { nodes: [node], bones: [bone] };
    assignNodeToBone(node, 'b1');

    clearProjectNodeBoneAssignment(project, 'p1');

    expect(node.boneId).toBeNull();
    expect(node.mesh.influences[0]).toEqual([{ boneId: 'b1', weight: 1 }]);
    expect(node.mesh.jointBoneId).toBeNull();
    expect(bone.nodeId).toBeNull();
  });
});

describe('mesh influence palette', () => {
  it('exposes legacy weighted bones as visible fallback', () => {
    const node = makeMeshPart('p1', 1);
    node.boneId = 'owner';
    node.mesh.influences = [[{ boneId: 'weighted', weight: 1 }]];
    expect(getNodeMeshInfluenceBoneIds(node)).toEqual(['weighted', 'owner']);
  });

  it('adds a later auto-assigned bone without replacing owner or weights', () => {
    const node = makeMeshPart('p1', 2);
    const project = { nodes: [node], bones: [makeBone('b1'), makeBone('b2')] };
    assignOrAddProjectNodeBoneInfluence(project, 'p1', 'b1');
    const before = structuredClone(node.mesh.influences);

    const result = assignOrAddProjectNodeBoneInfluence(project, 'p1', 'b2');

    expect(result.action).toBe('influence');
    expect(node.boneId).toBe('b1');
    expect(node.mesh.influences).toEqual(before);
    expect(node.meshInfluenceBoneIds).toEqual(['b1', 'b2']);
  });

  it('stores candidates before a mesh exists', () => {
    const node = makeNonMeshPart('p1');
    const project = { nodes: [node], bones: [makeBone('b1'), makeBone('b2')] };
    assignOrAddProjectNodeBoneInfluence(project, 'p1', 'b1');
    assignOrAddProjectNodeBoneInfluence(project, 'p1', 'b2');
    setNodeMeshInfluenceBone(node, 'b1', false);
    expect(node.boneId).toBe('b1');
    expect(node.meshInfluenceBoneIds).toEqual(['b2']);
  });
});

describe('isBoneLinkLocked', () => {
  it('treats missing field as ON (backward compatible)', () => {
    expect(isBoneLinkLocked({})).toBe(true);
    expect(isBoneLinkLocked({ boneId: 'b' })).toBe(true);
  });

  it('treats explicit false as OFF', () => {
    expect(isBoneLinkLocked({ boneLinkLocked: false })).toBe(false);
  });

  it('treats explicit true as ON', () => {
    expect(isBoneLinkLocked({ boneLinkLocked: true })).toBe(true);
  });

  it('returns false for nullish node', () => {
    expect(isBoneLinkLocked(null)).toBe(false);
    expect(isBoneLinkLocked(undefined)).toBe(false);
  });
});

describe('setBoneLinkLocked', () => {
  it('removes the field when locked=true (default ON representation)', () => {
    const node = { boneId: 'b' };
    setBoneLinkLocked(node, true);
    expect(Object.prototype.hasOwnProperty.call(node, 'boneLinkLocked')).toBe(false);
  });

  it('writes explicit false when locked=false', () => {
    const node = { boneId: 'b' };
    setBoneLinkLocked(node, false);
    expect(node.boneLinkLocked).toBe(false);
  });

  it('toggles back to ON by removing the field', () => {
    const node = { boneId: 'b', boneLinkLocked: false };
    setBoneLinkLocked(node, true);
    expect(Object.prototype.hasOwnProperty.call(node, 'boneLinkLocked')).toBe(false);
    expect(isBoneLinkLocked(node)).toBe(true);
  });
});

describe('isNodeAssignedToBone', () => {
  it('matches via direct boneId', () => {
    const node = { boneId: 'b1' };
    expect(isNodeAssignedToBone(node, { id: 'b1' })).toBe(true);
  });

  it('matches via nodeId reference', () => {
    const node = { id: 'n1' };
    const bone = { id: 'b1', nodeId: 'n1' };
    expect(isNodeAssignedToBone(node, bone)).toBe(true);
  });

  it('matches via mesh jointBoneId', () => {
    const node = { mesh: { jointBoneId: 'b1' } };
    expect(isNodeAssignedToBone(node, { id: 'b1' })).toBe(true);
  });

  it('returns false for unrelated bone', () => {
    const node = { id: 'p1', boneId: 'b1' };
    const bone = { id: 'b2', nodeId: 'b2-src' };
    expect(isNodeAssignedToBone(node, bone)).toBe(false);
  });

  it('does not match absent optional legacy references', () => {
    const node = { id: 'part-without-mesh', boneId: 'actual-bone' };
    const unrelated = { id: 'unrelated-bone' };

    expect(isNodeAssignedToBone(node, unrelated)).toBe(false);
  });
});

describe('getAssignedBoneForNode', () => {
  it('returns the bone assigned to the node', () => {
    const project = {
      nodes: [{ id: 'p1', boneId: 'b1' }],
      bones: [makeBone('b1')],
    };
    expect(getAssignedBoneForNode(project, 'p1')?.id).toBe('b1');
  });

  it('does not let a bone without legacy nodeId shadow the direct owner', () => {
    const project = {
      nodes: [{ id: 'p1', boneId: 'b2' }],
      bones: [makeBone('b1'), makeBone('b2')],
    };
    expect(getAssignedBoneForNode(project, 'p1')?.id).toBe('b2');
  });

  it('returns null when node has no assignment', () => {
    const project = {
      nodes: [{ id: 'p1' }],
      bones: [makeBone('b1')],
    };
    expect(getAssignedBoneForNode(project, 'p1')).toBeNull();
  });

  it('returns null for missing project or nodeId', () => {
    expect(getAssignedBoneForNode(null, 'p1')).toBeNull();
    expect(getAssignedBoneForNode({ nodes: [], bones: [] }, 'missing')).toBeNull();
  });
});

describe('isLinkedNodeAssignedToBone', () => {
  it('true when assigned and link is ON', () => {
    const node = { id: 'p1', boneId: 'b1' };
    const bone = { id: 'b1' };
    expect(isLinkedNodeAssignedToBone(node, bone)).toBe(true);
  });

  it('false when link is explicitly OFF', () => {
    const node = { id: 'p1', boneId: 'b1', boneLinkLocked: false };
    const bone = { id: 'b1' };
    expect(isLinkedNodeAssignedToBone(node, bone)).toBe(false);
  });

  it('false when not assigned', () => {
    const node = { id: 'p1' };
    const bone = { id: 'b1', nodeId: 'b1-src' };
    expect(isLinkedNodeAssignedToBone(node, bone)).toBe(false);
  });
});

describe('getLinkedNodesForBone', () => {
  it('returns only linked nodes for the bone', () => {
    const project = {
      nodes: [
        { id: 'a', boneId: 'b1' },
        { id: 'b', boneId: 'b1', boneLinkLocked: false },
        { id: 'c', boneId: 'b2' },
      ],
      bones: [makeBone('b1'), makeBone('b2')],
    };
    const linked = getLinkedNodesForBone(project, 'b1').map(n => n.id);
    expect(linked).toEqual(['a']);
  });

  it('returns empty list for missing bone', () => {
    const project = { nodes: [{ id: 'a', boneId: 'b1' }], bones: [makeBone('b1')] };
    expect(getLinkedNodesForBone(project, 'missing')).toEqual([]);
  });

  it('returns empty list for missing project or boneId', () => {
    expect(getLinkedNodesForBone(null, 'b1')).toEqual([]);
    expect(getLinkedNodesForBone({ nodes: [], bones: [] }, null)).toEqual([]);
  });
});
