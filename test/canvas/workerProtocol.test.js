import { describe, it, expect } from 'vitest';
import { handleMeshTask } from '@/features/canvas/infrastructure/mesh-worker/workerProtocol.js';

function mockGenerateMesh(_data, _width, _height, _opts) {
  return {
    vertices: [{ x: 0, y: 0, restX: 0, restY: 0 }, { x: 10, y: 0, restX: 10, restY: 0 }],
    uvs: new Float32Array([0, 0, 1, 0]),
    triangles: [[0, 1, 2]],
    edgeIndices: new Set([0, 1]),
  };
}

const mockImageData = { data: new Uint8ClampedArray(16), width: 2, height: 2 };

describe('handleMeshTask — task envelope protocol', () => {
  it('processes task request and returns envelope response', () => {
    const { response, transferables } = handleMeshTask({
      requestId: 'r1',
      kind: 'mesh.generate',
      projectRevision: 5,
      payload: { imageData: mockImageData, opts: { gridSpacing: 30 } },
    }, { generateMesh: mockGenerateMesh });

    expect(response).toEqual({
      type: 'result',
      data: expect.objectContaining({
        requestId: 'r1',
        projectRevision: 5,
        data: expect.objectContaining({
          ok: true,
          vertices: expect.any(Array),
          uvs: expect.any(Float32Array),
        }),
      }),
    });
    expect(transferables).toHaveLength(1);
    expect(transferables[0]).toBeInstanceOf(ArrayBuffer);
  });

  it('returns error envelope on failure', () => {
    const failingFn = () => { throw new Error('mesh failed'); };
    const { response } = handleMeshTask({
      requestId: 'r2',
      kind: 'mesh.generate',
      projectRevision: 5,
      payload: { imageData: mockImageData, opts: {} },
    }, { generateMesh: failingFn });

    expect(response).toEqual({
      type: 'error',
      data: {
        requestId: 'r2',
        code: 'MESH_GENERATION_FAILED',
        message: 'mesh failed',
        retryable: false,
      },
    });
  });

  it('preserves requestId and projectRevision in error response', () => {
    const failingFn = () => { throw new Error('timeout'); };
    const { response } = handleMeshTask({
      requestId: 'req-42',
      kind: 'mesh.generate',
      projectRevision: 99,
      payload: { imageData: mockImageData, opts: {} },
    }, { generateMesh: failingFn });

    expect(response.data.requestId).toBe('req-42');
    expect(response.data.projectRevision).toBeUndefined();
  });

  it('handles missing optional fields gracefully', () => {
    const { response } = handleMeshTask({
      requestId: 'r3',
      payload: { imageData: mockImageData },
    }, { generateMesh: mockGenerateMesh });

    expect(response.type).toBe('result');
    expect(response.data.requestId).toBe('r3');
  });
});

describe('handleMeshTask — legacy protocol (meshWorkerClient compat)', () => {
  it('processes legacy request (no envelope) and returns raw response', () => {
    const { response, transferables } = handleMeshTask({
      partId: 'p1',
      imageData: mockImageData,
      opts: { gridSpacing: 30 },
    }, { generateMesh: mockGenerateMesh });

    expect(response).toEqual({
      ok: true,
      vertices: expect.any(Array),
      uvs: expect.any(Float32Array),
      triangles: [[0, 1, 2]],
      edgeIndices: expect.any(Array),
    });
    expect(transferables).toHaveLength(1);
  });

  it('returns legacy error format on failure', () => {
    const failingFn = () => { throw new Error('legacy boom'); };
    const { response } = handleMeshTask({
      partId: 'p1',
      imageData: mockImageData,
      opts: {},
    }, { generateMesh: failingFn });

    expect(response).toEqual({
      ok: false,
      error: 'legacy boom',
    });
  });

  it('legacy response does not contain envelope fields', () => {
    const { response } = handleMeshTask({
      imageData: mockImageData,
      opts: {},
    }, { generateMesh: mockGenerateMesh });

    expect(response.type).toBeUndefined();
    expect(response.requestId).toBeUndefined();
    expect(response.projectRevision).toBeUndefined();
  });
});

describe('handleMeshTask — concurrency and isolation', () => {
  it('two task requests produce separate responses with correct requestIds', () => {
    const first = handleMeshTask({
      requestId: 'alpha',
      projectRevision: 1,
      payload: { imageData: mockImageData, opts: {} },
    }, { generateMesh: mockGenerateMesh });

    const second = handleMeshTask({
      requestId: 'beta',
      projectRevision: 2,
      payload: { imageData: mockImageData, opts: {} },
    }, { generateMesh: mockGenerateMesh });

    expect(first.response.data.requestId).toBe('alpha');
    expect(first.response.data.projectRevision).toBe(1);
    expect(second.response.data.requestId).toBe('beta');
    expect(second.response.data.projectRevision).toBe(2);
  });
});

describe('handleMeshTask — edge cases', () => {
  it('handles null event data', () => {
    const failingFn = () => { throw new Error('no data'); };
    const { response } = handleMeshTask(null, { generateMesh: failingFn });
    expect(response).toEqual({ ok: false, error: 'no data' });
  });

  it('handles undefined event data', () => {
    const failingFn = () => { throw new Error('no data'); };
    const { response } = handleMeshTask(undefined, { generateMesh: failingFn });
    expect(response).toEqual({ ok: false, error: 'no data' });
  });

  it('handles missing generateMesh dependency gracefully', () => {
    const { response } = handleMeshTask({ imageData: mockImageData }, {});
    expect(response.ok).toBe(false);
    expect(response.error).toBeTruthy();
  });
});
