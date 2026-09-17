import { describe, it, expect } from 'vitest';
import {
  computeSmartMeshOpts,
  SMART_MESH_DEFAULTS,
  SMART_MESH_LIMITS,
  paintMeshWeights,
  buildAddVertexMesh,
  buildRemoveVertexMesh,
  buildBrushVertices,
} from '@/features/canvas/domain/meshEditing.js';
import {
  brushWeight,
  normalizeVertexInfluences,
} from '@/features/canvas/domain/meshWeighting.js';

describe('computeSmartMeshOpts', () => {
  it('returns defaults when imageBounds is null', () => {
    expect(computeSmartMeshOpts(null)).toEqual(SMART_MESH_DEFAULTS);
  });

  it('returns expected limits from constants', () => {
    expect(SMART_MESH_LIMITS.alphaThreshold).toBe(5);
    expect(SMART_MESH_LIMITS.smoothPasses).toBe(0);
    expect(SMART_MESH_LIMITS.gridSpacing).toEqual({ min: 6, max: 80, multiplier: 0.08 });
    expect(SMART_MESH_LIMITS.edgePadding).toBe(8);
    expect(SMART_MESH_LIMITS.numEdgePoints).toEqual({ min: 12, max: 300, multiplier: 0.4 });
  });

  it('clamps gridSpacing to [6, 80] for huge bounds', () => {
    const opts = computeSmartMeshOpts({ minX: 0, minY: 0, maxX: 10000, maxY: 10000 });
    expect(opts.gridSpacing).toBe(80);
  });

  it('clamps numEdgePoints to [12, 300] for tiny bounds', () => {
    const opts = computeSmartMeshOpts({ minX: 0, minY: 0, maxX: 1, maxY: 1 });
    expect(opts.numEdgePoints).toBe(12);
  });
});

describe('brushWeight', () => {
  it('returns 0 at edge or beyond', () => {
    expect(brushWeight(10, 10, 1)).toBe(0);
    expect(brushWeight(20, 10, 1)).toBe(0);
  });

  it('returns 1 at center with hardness 1', () => {
    expect(brushWeight(0, 10, 1)).toBe(1);
  });

  it('produces smooth falloff with hardness 0', () => {
    const w = brushWeight(5, 10, 0);
    expect(w).toBeGreaterThan(0);
    expect(w).toBeLessThan(1);
  });
});

describe('normalizeVertexInfluences', () => {
  it('returns empty for all-zero influences', () => {
    expect(normalizeVertexInfluences([{ boneId: 'a', weight: 0 }])).toEqual([]);
  });

  it('drops near-zero weights', () => {
    const r = normalizeVertexInfluences([{ boneId: 'a', weight: 0.5 }, { boneId: 'b', weight: 0.0001 }]);
    expect(r).toHaveLength(1);
    expect(r[0].boneId).toBe('a');
  });

  it('keeps top-4 by weight after normalization', () => {
    const infs = [
      { boneId: 'a', weight: 0.1 },
      { boneId: 'b', weight: 0.2 },
      { boneId: 'c', weight: 0.3 },
      { boneId: 'd', weight: 0.4 },
      { boneId: 'e', weight: 0.5 },
    ];
    const r = normalizeVertexInfluences(infs);
    expect(r).toHaveLength(4);
    expect(r[0].boneId).toBe('e');
  });
});

describe('paintMeshWeights', () => {
  it('initialises influences array and paints', () => {
    const project = { nodes: [{ id: 'p1', mesh: { vertices: [{ x: 0, y: 0 }, { x: 100, y: 0 }] } }] };
    paintMeshWeights(project, 'p1', 'b1', 0, 0, 50, 1, 0.5);
    expect(project.nodes[0].mesh.influences).toBeTruthy();
    expect(project.nodes[0].mesh.influences[0]).toHaveLength(1);
    expect(project.nodes[0].mesh.influences[0][0].boneId).toBe('b1');
  });

  it('no-op when part not found or no mesh', () => {
    const project = { nodes: [] };
    paintMeshWeights(project, 'missing', 'b1', 0, 0, 50, 1, 0.5);
    // Should not throw
  });
});

describe('mesh editing helpers', () => {
  it('buildAddVertexMesh adds a vertex (delegates to retriangulate)', () => {
    const mesh = { vertices: [{ x: 0, y: 0 }, { x: 10, y: 0 }], uvs: new Float32Array([0, 0, 1, 0]), triangles: [0, 1], edgeIndices: [0, 1] };
    const result = buildAddVertexMesh({ mesh, localX: 5, localY: 5, imageWidth: 100, imageHeight: 100 });
    expect(result.vertices.length).toBe(3);
  });

  it('buildRemoveVertexMesh removes a vertex at index', () => {
    const mesh = { vertices: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 5, y: 5 }], uvs: new Float32Array([0, 0, 1, 0, 0.5, 0.5]), triangles: [0, 1, 2], edgeIndices: [0, 1, 2, 0] };
    const result = buildRemoveVertexMesh({ mesh, vertexIndex: 1, imageWidth: 100, imageHeight: 100 });
    expect(result.vertices.length).toBe(2);
    expect(result.vertices[0]).toEqual({ x: 0, y: 0 });
    expect(result.vertices[1]).toEqual({ x: 5, y: 5 });
  });

  it('buildBrushVertices translates affected vertices only', () => {
    const verts = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 20, y: 0 }];
    const affected = [true, false, true];
    const result = buildBrushVertices({ verticesSnap: verts, affected, localDx: 1, localDy: 2 });
    expect(result[0]).toEqual({ x: 1, y: 2 });
    expect(result[1]).toEqual({ x: 10, y: 0 });
    expect(result[2]).toEqual({ x: 21, y: 2 });
  });
});
