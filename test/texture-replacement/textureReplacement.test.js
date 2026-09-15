import { describe, expect, it } from 'vitest';

import {
  applyTextureReplacements,
  autoPairTextures,
  collectTextureReplacementCandidates,
  collectTextureReplacementSources,
} from '@/features/texture-replacement/domain/textureReplacement.js';

function projectFixture() {
  return {
    version: 1,
    author: 'test',
    lastActiveAnimationId: null,
    canvas: { width: 1000, height: 1000 },
    textures: [
      { id: 'old-face', source: 'old', fileName: 'face.png' },
      { id: 'new-face', source: 'new', fileName: 'face HD.png' },
      { id: 'new-body', source: 'new', fileName: 'body.png' },
    ],
    nodes: [{
      id: 'face-node',
      type: 'part',
      name: 'face',
      parent: null,
      draw_order: 1,
      transform: { x: 12, y: 24, rotation: 0, scaleX: 1, scaleY: 1, pivotX: 50, pivotY: 50 },
      opacity: 1,
      visible: true,
      textureId: 'old-face',
      imageWidth: 100,
      imageHeight: 100,
      imageBounds: { minX: 0, minY: 0, maxX: 100, maxY: 100 },
      alphaContours: [[[0, 0], [1, 1]]],
      mesh: {
        vertices: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 0, y: 100 }],
        uvs: [0, 0, 1, 0, 0, 1],
        triangles: [[0, 1, 2]],
        edgeIndices: [0, 1, 2],
        influences: [[{ boneId: 'bone-1', weight: 1 }], [], []],
      },
      blendShapes: [{ id: 'smile', name: 'Smile', deltas: [{ dx: 1, dy: 0 }, { dx: 0, dy: 0 }, { dx: 0, dy: 0 }] }],
      blendShapeValues: { smile: 0 },
    }],
    bones: [{ id: 'bone-1', name: 'Bone', parentId: null, setup: { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1, shearX: 0, shearY: 0, length: 100 } }],
    slots: [],
    attachments: [],
    skins: [],
    constraints: [],
    defaultPose: { 'face-node': { mesh_verts: [{ x: 0, y: 0 }] } },
    animations: [{
      id: 'animation-1',
      name: 'Idle',
      duration: 1000,
      fps: 30,
      tracks: [{ id: 'track-1', targetId: 'face-node', property: 'mesh_verts', keyframes: [] }],
    }],
    physics_groups: [],
    physicsRules: [],
    libraryFolders: [],
    assetPlacements: [],
    controlHandles: [],
    animationModifiers: [],
  };
}

describe('texture replacement pairing', () => {
  it('matches one-to-one by exact name, then similar name, then size', () => {
    const pairs = autoPairTextures(
      [
        { nodeId: 'face', textureId: 'old-face', name: 'face' },
        { nodeId: 'arm', textureId: 'old-arm', name: 'left arm', width: 32, height: 64 },
        { nodeId: 'unknown', textureId: 'old-unknown', name: 'mystery', width: 10, height: 20 },
      ],
      [
        { textureId: 'size', name: 'different', width: 10, height: 20 },
        { textureId: 'arm', name: 'arm left v2', width: 100, height: 100 },
        { textureId: 'face', name: 'face.png' },
      ],
    );
    expect(pairs).toEqual([
      { nodeId: 'face', textureId: 'face', enabled: true, reason: 'exact-name' },
      { nodeId: 'arm', textureId: 'arm', enabled: true, reason: 'similar-name' },
      { nodeId: 'unknown', textureId: 'size', enabled: true, reason: 'same-size' },
    ]);
  });

  it('separates used canvas sources from unused candidates', () => {
    const project = projectFixture();
    expect(collectTextureReplacementSources(project).map(source => source.textureId)).toEqual(['old-face']);
    expect(collectTextureReplacementCandidates(project).map(candidate => candidate.textureId)).toEqual(['new-face', 'new-body']);
  });
});

describe('applyTextureReplacements', () => {
  it('keeps mesh, weights, transforms, dimensions, and bones when safe options are enabled', () => {
    const project = projectFixture();
    const originalNode = structuredClone(project.nodes[0]);
    const originalBones = structuredClone(project.bones);
    const result = applyTextureReplacements(
      project,
      [{ nodeId: 'face-node', textureId: 'new-face', enabled: true }],
      new Map([['new-face', { width: 200, height: 300 }]]),
      { preserveDeformation: true, autoFit: true },
    );
    const node = project.nodes[0];
    expect(result.replacedNodeIds).toEqual(['face-node']);
    expect(node.type === 'part' && node.textureId).toBe('new-face');
    expect(node.type === 'part' && node.mesh).toEqual(originalNode.type === 'part' ? originalNode.mesh : null);
    expect(node.transform).toEqual(originalNode.transform);
    expect(node.type === 'part' && [node.imageWidth, node.imageHeight]).toEqual([100, 100]);
    expect(project.bones).toEqual(originalBones);
  });

  it('clears topology-dependent data and uses native dimensions when requested', () => {
    const project = projectFixture();
    applyTextureReplacements(
      project,
      [{ nodeId: 'face-node', textureId: 'new-face', enabled: true }],
      new Map([['new-face', { width: 200, height: 300 }]]),
      { preserveDeformation: false, autoFit: false },
    );
    const node = project.nodes[0];
    expect(node.type === 'part' && node.mesh).toBeNull();
    expect(node.type === 'part' && node.blendShapes).toEqual([]);
    expect(node.type === 'part' && [node.imageWidth, node.imageHeight]).toEqual([200, 300]);
    expect(project.defaultPose['face-node']?.mesh_verts).toBeUndefined();
    expect(project.animations[0].tracks).toHaveLength(0);
    expect(project.bones[0].setup.length).toBe(100);
  });

  it('skips stale nodes, missing textures, and unloaded images', () => {
    const project = projectFixture();
    const result = applyTextureReplacements(
      project,
      [
        { nodeId: 'missing-node', textureId: 'new-face', enabled: true },
        { nodeId: 'face-node', textureId: 'missing-texture', enabled: true },
      ],
      new Map([['new-face', { width: 200, height: 300 }]]),
      { preserveDeformation: true, autoFit: true },
    );
    expect(result.replacedNodeIds).toEqual([]);
    expect(result.skippedNodeIds).toEqual(['missing-node', 'face-node']);
  });
});
