import { describe, it, expect } from 'vitest';
import { validateProject, parseProject, CURRENT_PROJECT_VERSION } from '../src/schema/projectSchema';

function makeBaseProject(overrides: Record<string, unknown> = {}) {
  return {
    version: CURRENT_PROJECT_VERSION,
    canvas: { width: 800, height: 600, x: 0, y: 0, bgEnabled: false, bgColor: '#ffffff' },
    textures: [],
    nodes: [],
    animations: [],
    controlHandles: [],
    animationModifiers: [],
    ...overrides,
  };
}

function makePart(id: string, name: string, extra: Record<string, unknown> = {}) {
  return {
    id,
    type: 'part',
    name,
    parent: null,
    draw_order: 0,
    opacity: 1,
    visible: true,
    transform: { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1, pivotX: 0, pivotY: 0 },
    ...extra,
  };
}

function makeGroup(id: string, name: string, extra: Record<string, unknown> = {}) {
  return {
    id,
    type: 'group',
    name,
    parent: null,
    opacity: 1,
    visible: true,
    transform: { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1, pivotX: 0, pivotY: 0 },
    ...extra,
  };
}

describe('projectSchema', () => {
  it('validates a minimal valid project', () => {
    const project = makeBaseProject();
    const result = validateProject(project);
    expect(result.success).toBe(true);
  });

  it('rejects project with missing canvas', () => {
    const project = { version: 1, textures: [], nodes: [], animations: [] };
    const result = validateProject(project);
    expect(result.success).toBe(false);
  });

  it('rejects canvas with zero width', () => {
    const project = makeBaseProject({
      canvas: { width: 0, height: 600, x: 0, y: 0, bgEnabled: false, bgColor: '#ffffff' },
    });
    const result = validateProject(project);
    expect(result.success).toBe(false);
  });

  it('validates project with part nodes', () => {
    const project = makeBaseProject({
      nodes: [makePart('n1', 'Test')],
    });
    const result = validateProject(project);
    expect(result.success).toBe(true);
  });

  it('accepts runtime alphaContours point tuples', () => {
    const result = validateProject(makeBaseProject({
      nodes: [makePart('n1', 'Test', {
        alphaContours: [
          [[0, 0], [100, 0], [100, 100], [0, 100]],
        ],
      })],
    }));

    expect(result.success).toBe(true);
  });

  it('normalizes legacy alphaContours object points to runtime tuples', () => {
    const parsed = parseProject(makeBaseProject({
      nodes: [makePart('n1', 'Test', {
        alphaContours: [
          [{ x: 0, y: 0 }, { x: 100, y: 0 }],
        ],
      })],
    }));

    expect(parsed.nodes[0]!.alphaContours).toEqual([[[0, 0], [100, 0]]]);
  });

  it('validates project with group nodes', () => {
    const project = makeBaseProject({
      nodes: [makeGroup('g1', 'Group')],
    });
    const result = validateProject(project);
    expect(result.success).toBe(true);
  });

  it('preserves rig node assignment fields through parse', () => {
    const parsed = parseProject(makeBaseProject({
      nodes: [
        makeGroup('g1', 'Head Group', { boneRole: 'head' }),
        makePart('p1', 'Head', {
          parent: 'g1',
          boneId: 'b1',
          boneLinkLocked: false,
          mesh: {
            vertices: [{ x: 0, y: 0 }],
            uvs: [0, 0],
            triangles: [],
            edgeIndices: [],
            jointBoneId: null,
            influences: [[{ boneId: 'b1', weight: 1 }]],
            boneWeights: [1],
          },
        }),
      ],
      bones: [{
        id: 'b1',
        name: 'Head Bone',
        parentId: null,
        nodeId: 'p1',
        setup: { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1, shearX: 0, shearY: 0, length: 80 },
      }],
    }));

    expect(parsed.nodes[0]!.boneRole).toBe('head');
    expect(parsed.nodes[1]!.boneId).toBe('b1');
    expect(parsed.nodes[1]!.boneLinkLocked).toBe(false);
    const firstNode = parsed.nodes[1]!;
    expect(firstNode.type).toBe('part');
    if (firstNode.type !== 'part') throw new Error('Expected part node');
    expect(firstNode.mesh!.jointBoneId).toBeNull();
    expect(parsed.bones![0]!.nodeId).toBe('p1');
  });

  it('CURRENT_PROJECT_VERSION is 10', () => {
    expect(CURRENT_PROJECT_VERSION).toBe(10);
  });

  it('parseProject throws on invalid data', () => {
    expect(() => parseProject({})).toThrow();
  });

  it('rejects self-referential clipToPartId', () => {
    const result = validateProject(makeBaseProject({
      nodes: [makePart('iris', 'irides', { clipToPartId: 'iris' })],
    }));

    expect(result.success).toBe(false);
    expect(result.error!.issues[0]!.path).toEqual(['nodes', 0, 'clipToPartId']);
  });

  it('rejects missing clip target', () => {
    const result = validateProject(makeBaseProject({
      nodes: [makePart('iris', 'irides', { clipToPartId: 'missing' })],
    }));

    expect(result.success).toBe(false);
    expect(result.error!.issues[0]!.message).toContain('missing');
  });

  it('rejects non-part clip target', () => {
    const result = validateProject(makeBaseProject({
      nodes: [
        makeGroup('group-target', 'eyes'),
        makePart('iris', 'irides', { clipToPartId: 'group-target' }),
      ],
    }));

    expect(result.success).toBe(false);
    expect(result.error!.issues[0]!.message).toContain('part node');
  });

  it('accepts valid clipping and preserves it through parse', () => {
    const parsed = parseProject(makeBaseProject({
      nodes: [
        makePart('white', 'eyewhite'),
        makePart('iris', 'irides', { clipToPartId: 'white' }),
      ],
    }));

    const iris = parsed.nodes.find((node) => node.id === 'iris');
    expect(iris).toBeDefined();
    expect(iris!.clipToPartId).toBe('white');
  });

  it('accepts keyframe with valid authoring metadata', () => {
    const result = validateProject(makeBaseProject({
      animations: [{
        id: 'a1', name: 'Test', duration: 1000, fps: 24,
        tracks: [{
          targetId: 'n1', property: 'x',
          keyframes: [
            { time: 0, value: 0, authoring: { gestureId: 'g1', role: 'authored', source: 'pose' } },
          ],
        }],
      }],
    }));
    expect(result.success).toBe(true);
  });

  it('rejects keyframe with invalid authoring role', () => {
    const result = validateProject(makeBaseProject({
      animations: [{
        id: 'a1', name: 'Test', duration: 1000, fps: 24,
        tracks: [{
          targetId: 'n1', property: 'x',
          keyframes: [
            { time: 0, value: 0, authoring: { gestureId: 'g1', role: 'invalid', source: 'pose' } },
          ],
        }],
      }],
    }));
    expect(result.success).toBe(false);
  });

  it('rejects keyframe with empty gestureId in authoring', () => {
    const result = validateProject(makeBaseProject({
      animations: [{
        id: 'a1', name: 'Test', duration: 1000, fps: 24,
        tracks: [{
          targetId: 'n1', property: 'x',
          keyframes: [
            { time: 0, value: 0, authoring: { gestureId: '', role: 'authored', source: 'pose' } },
          ],
        }],
      }],
    }));
    expect(result.success).toBe(false);
  });

  it('rejects legacy nodeId tracks', () => {
    const result = validateProject(makeBaseProject({
      animations: [{
        id: 'a1',
        name: 'Test',
        duration: 1000,
        fps: 24,
        tracks: [{ nodeId: 'n1', property: 'x', keyframes: [] }],
      }],
    }));

    expect(result.success).toBe(false);
    expect(result.error!.issues[0]!.path).toContain('targetId');
  });

  it('accepts audio track fields used by the timeline', () => {
    const result = validateProject(makeBaseProject({
      animations: [{
        id: 'a1',
        name: 'Test',
        duration: 1000,
        fps: 24,
        tracks: [],
        audioTracks: [{
          id: 'audio-1',
          name: 'Voice',
          source: 'audios/audio-1.wav',
          sourceUrl: 'blob:audio-1',
          mimeType: 'audio/wav',
          audioDurationMs: 2400,
          audioStartMs: 100,
          audioEndMs: 1200,
          timelineStartMs: 0,
        }],
      }],
    }));

    expect(result.success).toBe(true);
  });

  it('preserves markers through parseProject', () => {
    const parsed = parseProject(makeBaseProject({
      animations: [{
        id: 'a1',
        name: 'Test',
        duration: 1000,
        fps: 24,
        tracks: [],
        markers: [
          { id: 'marker-1', time: 250, label: 'Beat' },
          { id: 'marker-2', time: 100, label: 'Intro' },
        ],
        audioTracks: [],
      }],
    }));

    expect(parsed.animations[0]!.markers).toEqual([
      { id: 'marker-1', time: 250, label: 'Beat' },
      { id: 'marker-2', time: 100, label: 'Intro' },
    ]);
  });

  it('accepts duration 0 in animation clip', () => {
    const result = validateProject(makeBaseProject({
      animations: [{
        id: 'a1',
        name: 'Zero',
        duration: 0,
        fps: 24,
        tracks: [],
      }],
    }));
    expect(result.success).toBe(true);
  });

  it('accepts cubic easing tuple in keyframe', () => {
    const result = validateProject(makeBaseProject({
      animations: [{
        id: 'a1',
        name: 'Test',
        duration: 1000,
        fps: 24,
        tracks: [{
          targetId: 'n1',
          property: 'x',
          keyframes: [
            { time: 0, value: 0, easing: [0.42, 0, 0.58, 1] },
            { time: 500, value: 50 },
          ],
        }],
      }],
    }));
    expect(result.success).toBe(true);
  });

  it('accepts string easing in keyframe', () => {
    const result = validateProject(makeBaseProject({
      animations: [{
        id: 'a1',
        name: 'Test',
        duration: 1000,
        fps: 24,
        tracks: [{
          targetId: 'n1',
          property: 'x',
          keyframes: [
            { time: 0, value: 0, easing: 'ease-in' },
          ],
        }],
      }],
    }));
    expect(result.success).toBe(true);
  });

  it('accepts libraryFolders and assetPlacements', () => {
    const result = validateProject(makeBaseProject({
      libraryFolders: [
        { id: 'f1', name: 'Character', parentId: null, sourceFileName: 'char.psd', origin: 'import' },
      ],
      assetPlacements: [
        { assetId: 'n1', folderId: 'f1' },
        { assetId: 'n2', folderId: null },
      ],
    }));
    expect(result.success).toBe(true);
  });

  it('accepts project without libraryFolders and assetPlacements (backwards compat)', () => {
    const result = validateProject(makeBaseProject());
    expect(result.success).toBe(true);
  });

  it('rejects libraryFolder with invalid origin', () => {
    const result = validateProject(makeBaseProject({
      libraryFolders: [
        { id: 'f1', name: 'Test', origin: 'invalid' },
      ],
    }));
    expect(result.success).toBe(false);
  });

  it('accepts event track as read-compatible', () => {
    const result = validateProject(makeBaseProject({
      animations: [{
        id: 'a1',
        name: 'Test',
        duration: 1000,
        fps: 24,
        tracks: [{
          targetId: 'n1',
          property: 'event',
          keyframes: [
            { time: 100, value: 'click' },
            { time: 200, value: { type: 'custom', data: 'test' } },
          ],
        }],
      }],
    }));
    expect(result.success).toBe(true);
  });

  it('preserves authoring metadata through parseProject', () => {
    const parsed = parseProject(makeBaseProject({
      animations: [{
        id: 'a1', name: 'Test', duration: 1000, fps: 24,
        tracks: [{
          targetId: 'n1', property: 'x',
          keyframes: [
            { time: 0, value: 0, authoring: { gestureId: 'g1', role: 'authored', source: 'pose' } },
            { time: 500, value: 50 },
          ],
        }],
      }],
    }));
    expect(parsed.animations[0]!.tracks[0]!.keyframes[0]!.authoring).toEqual({
      gestureId: 'g1', role: 'authored', source: 'pose',
    });
    expect(parsed.animations[0]!.tracks[0]!.keyframes[1]!.authoring).toBeUndefined();
  });

  it('round-trips v4 and v5 animation data', () => {
    const project = makeBaseProject({
      animations: [{
        id: 'a1',
        name: 'Test',
        duration: 1000,
        fps: 24,
        tracks: [
          { targetId: 'n1', property: 'x', keyframes: [
            { time: 0, value: 0, easing: 'linear' },
            { time: 500, value: 50, easing: 'ease-in' },
            { time: 1000, value: 100 },
          ]},
          { targetId: 'n1', property: 'visible', keyframes: [
            { time: 0, value: true },
            { time: 500, value: false },
          ]},
        ],
      }],
    });
    const parsed = parseProject(project);
    expect(parsed.animations[0]!.tracks[0]!.keyframes).toHaveLength(3);
    expect(parsed.animations[0]!.tracks[1]!.keyframes).toHaveLength(2);
    expect(parsed.animations[0]!.tracks[1]!.keyframes[0]!.value).toBe(true);
  });
});
