// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { createMeshWorkerClient } from '@/features/canvas/infrastructure/meshWorkerClient.js';

class FakeWorker {
  constructor(url, options) {
    this.url = url;
    this.options = options;
    this.terminated = false;
    this.messageHandler = null;
    FakeWorker.instances.push(this);
  }
  postMessage(msg) {
    this.lastMessage = msg;
    FakeWorker.lastPosted = msg;
    if (FakeWorker.respondWith) {
      const cb = this.onmessage;
      if (cb) cb({ data: FakeWorker.respondWith(msg) });
    }
  }
  terminate() {
    this.terminated = true;
  }
  set onmessage(fn) { this.messageHandler = fn; }
  get onmessage() { return this.messageHandler; }
}
FakeWorker.instances = [];
FakeWorker.respondWith = null;
FakeWorker.lastPosted = null;
FakeWorker.reset = function() {
  FakeWorker.instances.length = 0;
  FakeWorker.respondWith = null;
  FakeWorker.lastPosted = null;
};

describe('meshWorkerClient', () => {
  beforeEach(() => {
    FakeWorker.reset();
    globalThis.Worker = FakeWorker;
  });

  it('creates a worker and posts the imageData', async () => {
    const client = createMeshWorkerClient({ workerUrl: 'blob:fake' });
    FakeWorker.respondWith = () => ({
      ok: true,
      vertices: [{ x: 0, y: 0 }],
      uvs: new Float32Array([0, 0]),
      triangles: [0],
      edgeIndices: [0],
    });
    const id = { width: 1, height: 1, data: new Uint8ClampedArray(4) };
    const result = await client.generate('p1', id, { gridSpacing: 30 });
    expect(result.vertices).toHaveLength(1);
    expect(FakeWorker.instances).toHaveLength(1);
    expect(FakeWorker.instances[0].url).toBe('blob:fake');
    expect(FakeWorker.instances[0].options).toEqual({ type: 'module' });
    expect(FakeWorker.instances[0].lastMessage.partId).toBe('p1');
    client.dispose();
  });

  it('uses the Vite-bundled worker URL by default', async () => {
    const client = createMeshWorkerClient();
    FakeWorker.respondWith = () => ({
      ok: true,
      vertices: [{ x: 0, y: 0 }],
      uvs: new Float32Array([0, 0]),
      triangles: [0],
      edgeIndices: [0],
    });

    await client.generate('p1', { width: 1, height: 1, data: new Uint8ClampedArray(4) });

    expect(FakeWorker.instances).toHaveLength(1);
    expect(String(FakeWorker.instances[0].url)).toContain('worker');
    expect(String(FakeWorker.instances[0].url)).not.toContain('data:video/mp2t');
    expect(FakeWorker.instances[0].options).toEqual({ type: 'module' });
    client.dispose();
  });

  it('cancels previous worker for same partId', () => {
    const client = createMeshWorkerClient({ workerUrl: 'blob:fake' });
    client.generate('p1', { width: 1, height: 1, data: new Uint8ClampedArray(4) }, {});
    const first = FakeWorker.instances[0];
    client.generate('p1', { width: 1, height: 1, data: new Uint8ClampedArray(4) }, {});
    expect(first.terminated).toBe(true);
    expect(FakeWorker.instances).toHaveLength(2);
    client.dispose();
  });

  it('cancel removes worker for partId', () => {
    const client = createMeshWorkerClient({ workerUrl: 'blob:fake' });
    client.generate('p1', { width: 1, height: 1, data: new Uint8ClampedArray(4) }, {});
    client.cancel('p1');
    expect(FakeWorker.instances[0].terminated).toBe(true);
    client.dispose();
  });

  it('rejects on error response', async () => {
    const client = createMeshWorkerClient({ workerUrl: 'blob:fake' });
    FakeWorker.respondWith = () => ({ ok: false, error: 'boom' });
    await expect(
      client.generate('p1', { width: 1, height: 1, data: new Uint8ClampedArray(4) }, {}),
    ).rejects.toThrow('boom');
    client.dispose();
  });
});
