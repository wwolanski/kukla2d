import { afterEach, describe, expect, it, vi } from 'vitest';
import JSZip from 'jszip';
import { saveProject, loadProject, AssetResolveError } from '../src/io/projectFile';
import {
  PROJECT_ARCHIVE_FORMAT_ID,
  PROJECT_ARCHIVE_VERSION,
  PROJECT_MANIFEST_PATH,
} from '../src/io/projectFormat';
import { CURRENT_PROJECT_VERSION, validateProject } from '../src/schema/projectSchema';
import { createPortableProjectSnapshot, assertJsonSafe } from '../src/schema/projectSnapshot';
import { applyWeightBrush } from '../src/features/canvas/domain/meshWeighting.js';
import { createGoldenProject } from './fixtures/goldenProject';

function makePart(id, name, extra = {}) {
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

function okFetchMock() {
  return vi.fn(async () => ({
    ok: true,
    blob: async () => new Uint8Array([1, 2, 3, 4]),
  }));
}

function makeMinimalProject() {
  return {
    version: CURRENT_PROJECT_VERSION,
    canvas: { width: 800, height: 600, x: 0, y: 0 },
    textures: [],
    nodes: [],
    animations: [],
    bones: [],
    slots: [],
    attachments: [],
    skins: [],
    constraints: [],
    defaultPose: {},
    physics_groups: [],
    physicsRules: [],
    libraryFolders: [],
    assetPlacements: [],
    controlHandles: [],
    animationModifiers: [],
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('saveProject', () => {
  it('round-trips author and last active animation metadata', async () => {
    const project = {
      ...makeMinimalProject(),
      author: 'Ada Example',
      lastActiveAnimationId: 'idle',
      animations: [{ id: 'idle', name: 'Idle', duration: 1000, fps: 24, tracks: [] }],
    };

    const blob = await saveProject(project);
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    const projectJson = JSON.parse(await zip.file('project.json').async('string'));
    expect(projectJson.author).toBe('Ada Example');
    expect(projectJson.lastActiveAnimationId).toBe('idle');

    const loaded = await loadProject(await blob.arrayBuffer());
    try {
      expect(loaded.project.author).toBe('Ada Example');
      expect(loaded.project.lastActiveAnimationId).toBe('idle');
    } finally {
      loaded.resources.dispose();
    }
  });

  it('round-trips the canonical Library texture name separately from the source filename', async () => {
    vi.stubGlobal('fetch', okFetchMock());
    vi.stubGlobal('Image', class {
      constructor() {
        setTimeout(() => this.onload?.(), 0);
      }
      set src(_) {}
    });
    vi.spyOn(globalThis.URL, 'createObjectURL').mockReturnValue('blob://mock');
    vi.spyOn(globalThis.URL, 'revokeObjectURL').mockImplementation(() => {});
    const project = makeMinimalProject();
    project.textures = [{
      id: 'right-arm',
      source: 'memory://right-arm.png',
      name: 'Right Arm (1)',
      fileName: 'Right Arm.png',
      fileSize: 7,
    }];

    const blob = await saveProject(project);
    const loaded = await loadProject(await blob.arrayBuffer());
    try {
      expect(loaded.project.textures[0].name).toBe('Right Arm (1)');
      expect(loaded.project.textures[0].fileName).toBe('Right Arm.png');
    } finally {
      loaded.resources.dispose();
    }
  });

  it('round-trips a modular sprite source, parts, and processing recipe', async () => {
    vi.stubGlobal('fetch', okFetchMock());
    vi.stubGlobal('Image', class {
      constructor() { setTimeout(() => this.onload?.(), 0); }
      set src(_) {}
    });
    vi.spyOn(globalThis.URL, 'createObjectURL').mockReturnValue('blob://modular');
    vi.spyOn(globalThis.URL, 'revokeObjectURL').mockImplementation(() => {});
    const project = makeMinimalProject();
    project.textures = [
      { id: 'sheet-source', source: 'memory://source.png', name: 'Hero Source', fileName: 'hero.png' },
      { id: 'head-part', source: 'memory://head.png', name: 'Head', fileName: 'head.png' },
    ];
    project.modularSprites = [{
      id: 'hero-set', schemaVersion: 1, name: 'Hero', sourceAssetId: 'sheet-source',
      source: { width: 16, height: 16 }, processorVersion: 1,
      recipe: {
        background: { mode: 'alpha', color: { r: 0, g: 0, b: 0 }, tolerance: 0, softness: 0.1, despill: 0 },
        detection: { alphaThreshold: 1, minimumRegionAreaRatio: 0, openingRadius: 0, closingRadius: 0, connectivity: 8 },
        strokes: [{ kind: 'foreground', radius: 0.01, points: [{ x: 0.5, y: 0.5 }] }],
      },
      parts: [{
        partKey: 'head', assetId: 'head-part', name: 'Head', role: 'head', side: 'center', required: true, order: 0,
        extractionFrame: { x: 0, y: 0, width: 1, height: 1 },
        contentBounds: { x: 0.1, y: 0.1, width: 0.8, height: 0.8 },
        componentSeeds: [{ x: 0.5, y: 0.5 }],
      }],
    }];

    const blob = await saveProject(project);
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    expect(zip.file('textures/sheet-source.png')).not.toBeNull();
    expect(zip.file('textures/head-part.png')).not.toBeNull();
    const loaded = await loadProject(await blob.arrayBuffer());
    try {
      expect(loaded.project.modularSprites).toEqual(project.modularSprites);
    } finally {
      loaded.resources.dispose();
    }
  });

  it('preserves clipToPartId in serialized project.json', async () => {
    vi.stubGlobal('fetch', okFetchMock());

    const project = {
      version: CURRENT_PROJECT_VERSION,
      canvas: { width: 800, height: 600, x: 0, y: 0, bgEnabled: false, bgColor: '#ffffff' },
      textures: [
        { id: 'white', source: 'memory://white.png', fileName: 'white.png', fileSize: 7 },
        { id: 'iris', source: 'memory://iris.png', fileName: 'iris.png', fileSize: 7 },
      ],
      nodes: [
        makePart('white', 'eyewhite'),
        makePart('iris', 'irides', { draw_order: 1, clipToPartId: 'white' }),
      ],
      animations: [],
      bones: [],
      slots: [],
      attachments: [],
      skins: [],
      constraints: [],
      physics_groups: [],
      physicsRules: [],
      libraryFolders: [],
      assetPlacements: [],
      controlHandles: [],
      animationModifiers: [],
    };

    const blob = await saveProject(project);
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    const projectJson = JSON.parse(await zip.file('project.json').async('string'));

    expect(projectJson.version).toBe(CURRENT_PROJECT_VERSION);
    expect(projectJson.nodes.find((node) => node.id === 'iris')?.clipToPartId).toBe('white');
    expect(validateProject(projectJson).success).toBe(true);
  });

  it('preserves tuple alphaContours in serialized project.json', async () => {
    vi.stubGlobal('fetch', okFetchMock());

    const project = {
      version: CURRENT_PROJECT_VERSION,
      canvas: { width: 800, height: 600, x: 0, y: 0, bgEnabled: false, bgColor: '#ffffff' },
      textures: [
        { id: 'body', source: 'memory://body.png', fileName: 'body.png', fileSize: 7 },
      ],
      nodes: [
        makePart('body', 'Body', {
          alphaContours: [
            [[0, 0], [32, 0], [32, 48], [0, 48]],
          ],
        }),
      ],
      animations: [],
      bones: [],
      slots: [],
      attachments: [],
      skins: [],
      constraints: [],
      physics_groups: [],
      physicsRules: [],
      libraryFolders: [],
      assetPlacements: [],
      controlHandles: [],
      animationModifiers: [],
    };

    const blob = await saveProject(project);
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    const projectJson = JSON.parse(await zip.file('project.json').async('string'));

    expect(projectJson.nodes[0].alphaContours).toEqual([
      [[0, 0], [32, 0], [32, 48], [0, 48]],
    ]);
    expect(validateProject(projectJson).success).toBe(true);
  });

  it('normalizes legacy object alphaContours before writing project.json', async () => {
    vi.stubGlobal('fetch', okFetchMock());

    const project = {
      ...makeMinimalProject(),
      textures: [
        { id: 'body', source: 'memory://body.png', fileName: 'body.png', fileSize: 7 },
      ],
      nodes: [
        makePart('body', 'Body', {
          alphaContours: [
            [{ x: 0, y: 0 }, { x: 32, y: 0 }],
          ],
        }),
      ],
    };

    const blob = await saveProject(project);
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    const projectJson = JSON.parse(await zip.file('project.json').async('string'));

    expect(projectJson.nodes[0].alphaContours).toEqual([[[0, 0], [32, 0]]]);
  });

  it('writes archive-safe texture paths for ids with path traversal characters', async () => {
    vi.stubGlobal('fetch', okFetchMock());

    const project = {
      ...makeMinimalProject(),
      textures: [
        { id: 'folder/../body', source: 'memory://body.png', fileName: 'body.png', fileSize: 7 },
      ],
      nodes: [
        makePart('folder/../body', 'Body'),
      ],
    };

    const blob = await saveProject(project);
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    const projectJson = JSON.parse(await zip.file('project.json').async('string'));

    expect(projectJson.textures[0].source).toBe('textures/folder%2F%2E%2E%2Fbody.png');
    expect(zip.file('textures/folder%2F%2E%2E%2Fbody.png')).toBeTruthy();

    globalThis.Image = class {
      constructor() {
        setTimeout(() => this.onload?.(), 0);
      }
      set src(_) {}
    };
    const origCreateObjectURL = globalThis.URL.createObjectURL;
    const origRevokeObjectURL = globalThis.URL.revokeObjectURL;
    globalThis.URL.createObjectURL = () => 'blob://mock';
    globalThis.URL.revokeObjectURL = () => {};

    try {
      const { project: loaded, resources } = await loadProject(await blob.arrayBuffer());
      expect(loaded.textures[0].id).toBe('folder/../body');
      expect(loaded.nodes[0].id).toBe('folder/../body');
      resources.dispose();
    } finally {
      globalThis.URL.createObjectURL = origCreateObjectURL;
      globalThis.URL.revokeObjectURL = origRevokeObjectURL;
    }
  });

  it('preserves bone hierarchy and assigned images in save-load round-trip', async () => {
    vi.stubGlobal('fetch', okFetchMock());

    const project = {
      ...makeMinimalProject(),
      textures: [
        { id: 'head', source: 'memory://head.png', fileName: 'head.png', fileSize: 7 },
      ],
      nodes: [
        makePart('head', 'Head', {
          boneId: 'bone-child',
          boneLinkLocked: false,
          textureId: 'head',
          mesh: {
            vertices: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 0, y: 10 }],
            uvs: [0, 0, 1, 0, 0, 1],
            triangles: [[0, 1, 2]],
            edgeIndices: [0, 1, 2],
            jointBoneId: 'bone-child',
            influences: [
              [{ boneId: 'bone-child', weight: 1 }],
              [{ boneId: 'bone-child', weight: 1 }],
              [{ boneId: 'bone-child', weight: 1 }],
            ],
            boneWeights: [1, 1, 1],
          },
        }),
      ],
      bones: [
        {
          id: 'bone-root',
          name: 'Root Bone',
          parentId: null,
          nodeId: null,
          inherit: 'normal',
          setup: { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1, shearX: 0, shearY: 0, length: 80 },
        },
        {
          id: 'bone-child',
          name: 'Child Bone',
          parentId: 'bone-root',
          nodeId: 'head',
          inherit: 'normal',
          setup: { x: 10, y: 0, rotation: 0, scaleX: 1, scaleY: 1, shearX: 0, shearY: 0, length: 60 },
        },
      ],
    };

    globalThis.Image = class {
      constructor() {
        setTimeout(() => this.onload?.(), 0);
      }
      set src(_) {}
    };
    const origCreateObjectURL = globalThis.URL.createObjectURL;
    const origRevokeObjectURL = globalThis.URL.revokeObjectURL;
    globalThis.URL.createObjectURL = () => 'blob://mock';
    globalThis.URL.revokeObjectURL = () => {};

    try {
      const blob = await saveProject(project);
      const zip = await JSZip.loadAsync(await blob.arrayBuffer());
      const projectJson = JSON.parse(await zip.file('project.json').async('string'));

      expect(projectJson.nodes[0]).toMatchObject({
        id: 'head',
        boneId: 'bone-child',
        boneLinkLocked: false,
      });
      expect(projectJson.nodes[0].mesh.jointBoneId).toBe('bone-child');
      expect(projectJson.bones[1]).toMatchObject({
        id: 'bone-child',
        parentId: 'bone-root',
        nodeId: 'head',
      });

      const { project: loaded, resources } = await loadProject(await blob.arrayBuffer());
      expect(loaded.nodes[0].boneId).toBe('bone-child');
      expect(loaded.nodes[0].boneLinkLocked).toBe(false);
      expect(loaded.nodes[0].mesh.jointBoneId).toBe('bone-child');
      expect(loaded.nodes[0].mesh.influences[0]).toEqual([{ boneId: 'bone-child', weight: 1 }]);
      expect(loaded.bones[1].parentId).toBe('bone-root');
      expect(loaded.bones[1].nodeId).toBe('head');
      resources.dispose();
    } finally {
      globalThis.URL.createObjectURL = origCreateObjectURL;
      globalThis.URL.revokeObjectURL = origRevokeObjectURL;
    }
  });

  it('preserves libraryFolders and assetPlacements in round-trip', async () => {
    vi.stubGlobal('fetch', okFetchMock());

    const project = {
      version: CURRENT_PROJECT_VERSION,
      canvas: { width: 800, height: 600, x: 0, y: 0, bgEnabled: false, bgColor: '#ffffff' },
      textures: [
        { id: 'tex1', source: 'memory://a.png', fileName: 'a.png', fileSize: 10 },
        { id: 'tex2', source: 'memory://b.png', fileName: 'b.png', fileSize: 20 },
      ],
      nodes: [
        makePart('tex1', 'Layer A'),
        makePart('tex2', 'Layer B'),
      ],
      animations: [],
      bones: [],
      slots: [],
      attachments: [],
      skins: [],
      constraints: [],
      physics_groups: [],
      physicsRules: [],
      libraryFolders: [
        { id: 'folder1', name: 'My Folder', origin: 'import', sourceFileName: 'character.psd', parentId: null },
      ],
      assetPlacements: [
        { assetId: 'tex1', folderId: 'folder1' },
        { assetId: 'tex2', folderId: null },
      ],
      controlHandles: [],
      animationModifiers: [],
    };

    const blob = await saveProject(project);
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    const projectJson = JSON.parse(await zip.file('project.json').async('string'));

    expect(projectJson.libraryFolders).toHaveLength(1);
    expect(projectJson.libraryFolders[0]).toEqual({
      id: 'folder1',
      name: 'My Folder',
      origin: 'import',
      sourceFileName: 'character.psd',
      parentId: null,
    });
    expect(projectJson.assetPlacements).toHaveLength(2);
    expect(projectJson.assetPlacements[0]).toEqual({
      assetId: 'tex1',
      folderId: 'folder1',
    });
    expect(projectJson.assetPlacements[1]).toEqual({
      assetId: 'tex2',
      folderId: null,
    });
    expect(validateProject(projectJson).success).toBe(true);
  });

  it('writes manifest.json with archive metadata', async () => {
    const blob = await saveProject(makeMinimalProject());
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    const manifest = JSON.parse(await zip.file(PROJECT_MANIFEST_PATH).async('string'));

    expect(manifest).toEqual({
      formatId: PROJECT_ARCHIVE_FORMAT_ID,
      formatVersion: PROJECT_ARCHIVE_VERSION,
      documentVersion: CURRENT_PROJECT_VERSION,
    });
  });

  it('throws AssetResolveError when texture source is missing', async () => {
    const project = {
      version: CURRENT_PROJECT_VERSION,
      canvas: { width: 800, height: 600, x: 0, y: 0, bgEnabled: false, bgColor: '#ffffff' },
      textures: [
        { id: 'broken', source: '', fileName: 'broken.png', fileSize: null },
      ],
      nodes: [],
      animations: [],
      bones: [],
      slots: [],
      attachments: [],
      skins: [],
      constraints: [],
      physics_groups: [],
      physicsRules: [],
      libraryFolders: [],
      assetPlacements: [],
      controlHandles: [],
      animationModifiers: [],
    };

    await expect(saveProject(project)).rejects.toThrow(/asset error/i);
  });

  it('throws when fetch returns non-ok response for texture', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: false,
      status: 404,
    })));

    const project = {
      version: CURRENT_PROJECT_VERSION,
      canvas: { width: 800, height: 600, x: 0, y: 0, bgEnabled: false, bgColor: '#ffffff' },
      textures: [
        { id: 'missing', source: 'blob://gone', fileName: 'missing.png', fileSize: 10 },
      ],
      nodes: [],
      animations: [],
      bones: [],
      slots: [],
      attachments: [],
      skins: [],
      constraints: [],
      physics_groups: [],
      physicsRules: [],
      libraryFolders: [],
      assetPlacements: [],
      controlHandles: [],
      animationModifiers: [],
    };

    await expect(saveProject(project)).rejects.toThrow(AssetResolveError);
  });

  it('fails closed on invalid schema before any fetch', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);

    const project = {
      version: CURRENT_PROJECT_VERSION,
      canvas: { width: '800', height: 600, x: 0, y: 0, bgEnabled: false, bgColor: '#ffffff' },
      textures: [
        { id: 'tex1', source: 'memory://tex1.png', fileName: 'tex1.png', fileSize: 10 },
      ],
      nodes: [],
      animations: [],
      bones: [],
      slots: [],
      attachments: [],
      skins: [],
      constraints: [],
      physics_groups: [],
      physicsRules: [],
      libraryFolders: [],
      assetPlacements: [],
      controlHandles: [],
      animationModifiers: [],
    };

    await expect(saveProject(project)).rejects.toThrow(/Project validation failed:/i);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('fails closed for portable audio source without runtime sourceUrl before ZIP generation', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    const project = {
      version: CURRENT_PROJECT_VERSION,
      canvas: { width: 800, height: 600, x: 0, y: 0, bgEnabled: false, bgColor: '#ffffff' },
      textures: [],
      nodes: [],
      animations: [{
        id: 'anim',
        name: 'Anim',
        duration: 1000,
        fps: 24,
        tracks: [],
        audioTracks: [{
          id: 'audio-1',
          name: 'Voice',
          source: 'audios/audio-1.wav',
          mimeType: 'audio/wav',
        }],
      }],
      bones: [],
      slots: [],
      attachments: [],
      skins: [],
      constraints: [],
      physics_groups: [],
      physicsRules: [],
      libraryFolders: [],
      assetPlacements: [],
      controlHandles: [],
      animationModifiers: [],
    };

    await expect(saveProject(project)).rejects.toMatchObject({
      name: 'AssetResolveError',
      errors: [
        expect.objectContaining({
          name: 'AssetResolveError',
          assetId: 'audio-1',
          assetType: 'audio',
        }),
      ],
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('loads legacy ZIP without manifest when project.json is valid', async () => {
    const blob = await saveProject(makeMinimalProject());
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    zip.remove(PROJECT_MANIFEST_PATH);

    const legacyBlob = await zip.generateAsync({ type: 'blob' });
    const { project: loaded } = await loadProject(await legacyBlob.arrayBuffer());

    expect(loaded.version).toBe(CURRENT_PROJECT_VERSION);
    expect(loaded.canvas).toEqual({
      ...makeMinimalProject().canvas,
      presetId: 'classic-4-3',
      fitSource: null,
    });
    expect(loaded.defaultPose).toEqual({});
  });

  it('normalizes validated project JSON through the runtime document adapter', async () => {
    const blob = await saveProject(makeMinimalProject());
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    const projectJson = JSON.parse(await zip.file('project.json').async('string'));
    projectJson.nodes = [makePart('part-1', 'Part')];
    zip.file('project.json', JSON.stringify(projectJson));

    const normalizedBlob = await zip.generateAsync({ type: 'blob' });
    const { project: loaded } = await loadProject(await normalizedBlob.arrayBuffer());

    expect(loaded.canvas.presetId).toBe('classic-4-3');
    expect(loaded.nodes[0].blendShapes).toEqual([]);
    expect(loaded.nodes[0].blendShapeValues).toEqual({});
  });

  it('rejects manifest with invalid formatId', async () => {
    const blob = await saveProject(makeMinimalProject());
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    zip.file(PROJECT_MANIFEST_PATH, JSON.stringify({
      formatId: 'wrong.format/id',
      formatVersion: PROJECT_ARCHIVE_VERSION,
      documentVersion: CURRENT_PROJECT_VERSION,
    }));

    const tamperedBlob = await zip.generateAsync({ type: 'blob' });
    await expect(loadProject(await tamperedBlob.arrayBuffer())).rejects.toThrow(/unexpected formatId/i);
  });

  it('rejects malformed manifest before reading its fields', async () => {
    const blob = await saveProject(makeMinimalProject());
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    zip.file(PROJECT_MANIFEST_PATH, JSON.stringify({ formatId: PROJECT_ARCHIVE_FORMAT_ID }));

    const tamperedBlob = await zip.generateAsync({ type: 'blob' });
    await expect(loadProject(await tamperedBlob.arrayBuffer())).rejects.toThrow(/invalid manifest shape/i);
  });

  it('rejects invalid project.json with a clear error', async () => {
    const zip = new JSZip();
    zip.file('project.json', '{bad json');
    zip.file(PROJECT_MANIFEST_PATH, JSON.stringify({
      formatId: PROJECT_ARCHIVE_FORMAT_ID,
      formatVersion: PROJECT_ARCHIVE_VERSION,
      documentVersion: CURRENT_PROJECT_VERSION,
    }));

    const blob = await zip.generateAsync({ type: 'blob' });

    await expect(loadProject(await blob.arrayBuffer())).rejects.toThrow(/invalid project\.json/i);
  });

  it('rejects missing texture entries with AssetResolveError details', async () => {
    const project = makeMinimalProject();
    project.textures = [{ id: 'missing-texture', source: 'textures/missing-texture.png', fileName: 'missing.png', fileSize: 1 }];

    const zip = new JSZip();
    zip.file('project.json', JSON.stringify(project));
    zip.file(PROJECT_MANIFEST_PATH, JSON.stringify({
      formatId: PROJECT_ARCHIVE_FORMAT_ID,
      formatVersion: PROJECT_ARCHIVE_VERSION,
      documentVersion: CURRENT_PROJECT_VERSION,
    }));

    const blob = await zip.generateAsync({ type: 'blob' });

    await expect(loadProject(await blob.arrayBuffer())).rejects.toMatchObject({
      name: 'AssetResolveError',
      assetId: 'missing-texture',
      assetType: 'texture',
    });
  });

  it('rejects missing audio entries with AssetResolveError details', async () => {
    const project = makeMinimalProject();
    project.animations = [{
      id: 'anim',
      name: 'Anim',
      duration: 1000,
      fps: 24,
      tracks: [],
      audioTracks: [{
        id: 'audio-1',
        name: 'Voice',
        source: 'audios/audio-1.wav',
        mimeType: 'audio/wav',
      }],
    }];

    const zip = new JSZip();
    zip.file('project.json', JSON.stringify(project));
    zip.file(PROJECT_MANIFEST_PATH, JSON.stringify({
      formatId: PROJECT_ARCHIVE_FORMAT_ID,
      formatVersion: PROJECT_ARCHIVE_VERSION,
      documentVersion: CURRENT_PROJECT_VERSION,
    }));

    const blob = await zip.generateAsync({ type: 'blob' });

    await expect(loadProject(await blob.arrayBuffer())).rejects.toMatchObject({
      name: 'AssetResolveError',
      assetId: 'audio-1',
      assetType: 'audio',
    });
  });
});

describe('createPortableProjectSnapshot', () => {
  it('produces JSON-safe output from golden project with runtime containers', () => {
    const golden = createGoldenProject();
    golden.nodes[1].mesh.uvs = new Float32Array(golden.nodes[1].mesh.uvs);
    golden.nodes[1].mesh.edgeIndices = new Set(golden.nodes[1].mesh.edgeIndices);

    const snapshot = createPortableProjectSnapshot(golden);

    assertJsonSafe(snapshot);
    expect(JSON.stringify(snapshot)).toBeTruthy();
  });

  it('preserves defaultPose in snapshot', () => {
    const golden = createGoldenProject();
    const snapshot = createPortableProjectSnapshot(golden);

    expect(snapshot.defaultPose).toEqual(golden.defaultPose);
    expect(snapshot.defaultPose.b1).toEqual({ x: 0, y: 0, rotation: 0 });
    expect(snapshot.defaultPose.b2).toEqual({ x: 0, y: 80, rotation: 0 });
  });

  it('preserves all K2 keys', () => {
    const golden = createGoldenProject();
    const snapshot = createPortableProjectSnapshot(golden);

    const expectedKeys = [
      'version', 'canvas', 'textures', 'nodes', 'bones', 'slots',
      'attachments', 'skins', 'constraints', 'defaultPose', 'animations',
      'physics_groups', 'physicsRules', 'libraryFolders', 'assetPlacements',
      'controlHandles', 'animationModifiers',
    ];
    for (const key of expectedKeys) {
      expect(snapshot).toHaveProperty(key);
    }
  });

  it('validates against project schema', () => {
    const golden = createGoldenProject();
    const snapshot = createPortableProjectSnapshot(golden);
    const result = validateProject(snapshot);
    expect(result.success).toBe(true);
  });
});

describe('golden project ZIP round-trip', () => {
  it('preserves all persisted fields through save -> load', async () => {
    vi.stubGlobal('fetch', okFetchMock());

    const golden = createGoldenProject();
    golden.nodes[1].mesh.uvs = new Float32Array(golden.nodes[1].mesh.uvs);
    golden.nodes[1].mesh.edgeIndices = new Set(golden.nodes[1].mesh.edgeIndices);
    golden.animations[0].audioTracks[0].sourceUrl = 'blob://audio-at1';
    delete golden.animations[0].audioTracks[0].source;

    const savedBlob = await saveProject(golden);
    const savedBuffer = await savedBlob.arrayBuffer();
    const zip = await JSZip.loadAsync(savedBuffer);
    const projectJson = JSON.parse(await zip.file('project.json').async('string'));
    const manifest = JSON.parse(await zip.file(PROJECT_MANIFEST_PATH).async('string'));

    expect(manifest).toEqual({
      formatId: PROJECT_ARCHIVE_FORMAT_ID,
      formatVersion: PROJECT_ARCHIVE_VERSION,
      documentVersion: CURRENT_PROJECT_VERSION,
    });
    expect(projectJson.assetPlacements).toEqual(golden.assetPlacements);
    expect(projectJson.textures).toEqual([
      {
        id: 'tex-face',
        source: 'textures/tex-face.png',
        fileName: 'face.png',
        fileSize: 12345,
      },
    ]);
    expect(zip.file('textures/tex-face.png')).toBeTruthy();
    expect(zip.file('audios/at1.wav')).toBeTruthy();

    globalThis.Image = class {
      constructor() {
        setTimeout(() => this.onload?.(), 0);
      }
      set src(_) {}
    };
    const origCreateObjectURL = globalThis.URL.createObjectURL;
    const origRevokeObjectURL = globalThis.URL.revokeObjectURL;
    globalThis.URL.createObjectURL = () => 'blob://mock';
    globalThis.URL.revokeObjectURL = () => {};

    try {
      const { project: loaded, resources } = await loadProject(savedBuffer);

      expect(loaded.version).toBe(golden.version);
      expect(loaded.canvas).toEqual({
        ...golden.canvas,
        presetId: 'classic-4-3',
        fitSource: null,
      });
      expect(loaded.defaultPose).toEqual(golden.defaultPose);
      expect(loaded.bones).toEqual(golden.bones);
      expect(loaded.slots).toEqual(golden.slots);
      expect(loaded.constraints).toEqual(golden.constraints);
      expect(loaded.physics_groups).toEqual(golden.physics_groups);
      expect(loaded.physicsRules).toEqual(golden.physicsRules);
      expect(loaded.libraryFolders).toEqual(golden.libraryFolders);
      expect(loaded.assetPlacements).toEqual(golden.assetPlacements);
      expect(loaded.textures[0]).toEqual({
        id: 'tex-face',
        source: expect.stringMatching(/^blob:/),
        fileName: 'face.png',
        fileSize: 12345,
      });

      expect(loaded.nodes[1].mesh.vertices).toEqual(golden.nodes[1].mesh.vertices);
      expect(loaded.nodes[1].mesh.triangles).toEqual(golden.nodes[1].mesh.triangles);
      expect(loaded.nodes[1].mesh.uvs).toBeInstanceOf(Float32Array);
      expect(Array.from(loaded.nodes[1].mesh.uvs)).toEqual(Array.from(golden.nodes[1].mesh.uvs));
      expect(loaded.nodes[1].mesh.influences).toEqual(golden.nodes[1].mesh.influences);

      expect(loaded.nodes[1].blendShapes).toEqual(golden.nodes[1].blendShapes);
      expect(loaded.animations[0].tracks.length).toBe(golden.animations[0].tracks.length);
      expect(loaded.animations[0].markers).toEqual(golden.animations[0].markers);
      expect(loaded.animations[0].audioTracks[0]).toMatchObject({
        id: 'at1',
        name: 'Voice',
        sourceUrl: expect.stringMatching(/^blob:/),
        mimeType: 'audio/wav',
        audioDurationMs: 2000,
        audioStartMs: 0,
        audioEndMs: 1000,
        timelineStartMs: 0,
      });
      expect(loaded.animations[0].audioTracks[0]).not.toHaveProperty('source');

      resources.dispose();
    } finally {
      globalThis.URL.createObjectURL = origCreateObjectURL;
      globalThis.URL.revokeObjectURL = origRevokeObjectURL;
    }
  });
});

describe('mesh/weights/warp/mesh_verts round-trip (G6)', () => {
  function setupLoadMocks() {
    globalThis.Image = class {
      constructor() {
        setTimeout(() => this.onload?.(), 0);
      }
      set src(_) {}
    };
    const origCreateObjectURL = globalThis.URL.createObjectURL;
    const origRevokeObjectURL = globalThis.URL.revokeObjectURL;
    globalThis.URL.createObjectURL = () => 'blob://mock';
    globalThis.URL.revokeObjectURL = () => {};
    return { origCreateObjectURL, origRevokeObjectURL };
  }

  function restoreLoadMocks(mocks) {
    globalThis.URL.createObjectURL = mocks.origCreateObjectURL;
    globalThis.URL.revokeObjectURL = mocks.origRevokeObjectURL;
  }

  it('save/load preserves mesh, influences, warp deformer, mesh_verts track and defaultPose.mesh_verts', async () => {
    vi.stubGlobal('fetch', okFetchMock());

    const meshVertsValue = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
    ];

    const project = {
      ...makeMinimalProject(),
      textures: [
        { id: 'skin', source: 'memory://skin.png', fileName: 'skin.png', fileSize: 7 },
      ],
      nodes: [
        {
          id: 'warp-parent',
          type: 'warpDeformer',
          name: 'Warp',
          parent: null,
          opacity: 1,
          visible: true,
          transform: { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1, pivotX: 0, pivotY: 0 },
          col: 2,
          row: 2,
          gridX: 0,
          gridY: 0,
          gridW: 100,
          gridH: 100,
        },
        {
          id: 'body',
          type: 'part',
          name: 'Body',
          parent: 'warp-parent',
          draw_order: 0,
          opacity: 1,
          visible: true,
          transform: { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1, pivotX: 0, pivotY: 0 },
          textureId: 'skin',
          mesh: {
            vertices: [
              { x: 0, y: 0 },
              { x: 10, y: 0 },
              { x: 10, y: 10 },
              { x: 0, y: 10 },
            ],
            uvs: [0, 0, 1, 0, 1, 1, 0, 1],
            triangles: [[0, 1, 2], [0, 2, 3]],
            edgeIndices: [0, 1, 2, 3],
            influences: [
              [{ boneId: 'bone-root', weight: 1 }],
              [{ boneId: 'bone-root', weight: 0.5 }, { boneId: 'bone-child', weight: 0.5 }],
              [{ boneId: 'bone-child', weight: 1 }],
              [{ boneId: 'bone-root', weight: 0.7 }, { boneId: 'bone-child', weight: 0.3 }],
            ],
            boneWeights: [1, 0.5, 0, 0.7],
            jointBoneId: 'bone-root',
          },
        },
      ],
      bones: [
        {
          id: 'bone-root',
          name: 'Root',
          parentId: null,
          nodeId: null,
          inherit: 'normal',
          setup: { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1, shearX: 0, shearY: 0, length: 50 },
        },
        {
          id: 'bone-child',
          name: 'Child',
          parentId: 'bone-root',
          nodeId: 'body',
          inherit: 'normal',
          setup: { x: 0, y: 50, rotation: 0, scaleX: 1, scaleY: 1, shearX: 0, shearY: 0, length: 30 },
        },
      ],
      defaultPose: {
        'bone-root': { x: 0, y: 0, rotation: 0 },
        'bone-child': { x: 0, y: 50, rotation: 0 },
        'warp-parent': { mesh_verts: meshVertsValue },
      },
      animations: [
        {
          id: 'anim-test',
          name: 'Test',
          duration: 1000,
          fps: 24,
          tracks: [
            {
              targetId: 'body',
              property: 'mesh_verts',
              keyframes: [
                { time: 0, value: meshVertsValue },
                {
                  time: 500,
                  value: [
                    { x: 1, y: -1 },
                    { x: 11, y: 1 },
                    { x: 9, y: 9 },
                    { x: 0, y: 10 },
                  ],
                },
              ],
            },
          ],
        },
      ],
    };

    const snapshot = createPortableProjectSnapshot(project);
    assertJsonSafe(snapshot);

    const validation = validateProject(snapshot);
    expect(validation.success).toBe(true);

    const blob = await saveProject(project);
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    const projectJson = JSON.parse(await zip.file('project.json').async('string'));

    expect(projectJson.nodes[1].mesh.influences).toEqual(project.nodes[1].mesh.influences);
    expect(projectJson.nodes[0].col).toBe(2);
    expect(projectJson.nodes[0].row).toBe(2);
    expect(projectJson.defaultPose['warp-parent']).toEqual({ mesh_verts: meshVertsValue });
    expect(projectJson.animations[0].tracks[0].property).toBe('mesh_verts');
    expect(projectJson.animations[0].tracks[0].keyframes[0].value).toEqual(meshVertsValue);

    for (const node of projectJson.nodes) {
      if (node.mesh) {
        expect(Array.isArray(node.mesh.uvs)).toBe(true);
        expect(node.mesh.uvs).not.toBeInstanceOf(Float32Array);
        expect(Array.isArray(node.mesh.edgeIndices)).toBe(true);
      }
    }

    const mocks = setupLoadMocks();
    try {
      const { project: loaded, resources } = await loadProject(await blob.arrayBuffer());

      expect(loaded.nodes[1].mesh.influences).toEqual(project.nodes[1].mesh.influences);
      expect(loaded.nodes[1].mesh.influences).toHaveLength(4);
      expect(loaded.nodes[1].mesh.influences[1]).toEqual([
        { boneId: 'bone-root', weight: 0.5 },
        { boneId: 'bone-child', weight: 0.5 },
      ]);
      expect(loaded.nodes[1].mesh.vertices).toHaveLength(4);
      expect(loaded.nodes[1].mesh.boneWeights).toEqual([1, 0.5, 0, 0.7]);

      expect(loaded.nodes[0].type).toBe('warpDeformer');
      expect(loaded.nodes[0].col).toBe(2);
      expect(loaded.nodes[0].row).toBe(2);
      expect(loaded.nodes[0].gridW).toBe(100);
      expect(loaded.nodes[0].gridH).toBe(100);

      expect(loaded.defaultPose['warp-parent']).toEqual({ mesh_verts: meshVertsValue });

      expect(loaded.animations[0].tracks[0].property).toBe('mesh_verts');
      expect(loaded.animations[0].tracks[0].keyframes[0].value).toEqual(meshVertsValue);
      expect(loaded.animations[0].tracks[0].keyframes[1].value).toEqual([
        { x: 1, y: -1 },
        { x: 11, y: 1 },
        { x: 9, y: 9 },
        { x: 0, y: 10 },
      ]);

      expect(loaded.bones).toHaveLength(2);
      expect(loaded.bones[0].id).toBe('bone-root');
      expect(loaded.bones[1].parentId).toBe('bone-root');

      resources.dispose();
    } finally {
      restoreLoadMocks(mocks);
    }
  });

  it('save/load preserves influences after Add/Subtract/Smooth operations (G5)', async () => {
    vi.stubGlobal('fetch', okFetchMock());

    const project = {
      ...makeMinimalProject(),
      textures: [
        { id: 'skin', source: 'memory://skin.png', fileName: 'skin.png', fileSize: 7 },
      ],
      nodes: [
        {
          id: 'body', type: 'part', name: 'Body', parent: null, draw_order: 0,
          opacity: 1, visible: true,
          transform: { x: 50, y: 50, rotation: 0, scaleX: 1, scaleY: 1, pivotX: 0, pivotY: 0 },
          textureId: 'skin',
          mesh: {
            vertices: [
              { x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 },
              { x: 50, y: 50 },
            ],
            uvs: [0, 0, 1, 0, 1, 1, 0, 1, 0.5, 0.5],
            triangles: [[0, 1, 2], [0, 2, 3]],
            edgeIndices: [0, 1, 2, 3],
            influences: [
              [{ boneId: 'bone-a', weight: 1 }],
              [{ boneId: 'bone-a', weight: 0.5 }, { boneId: 'bone-b', weight: 0.5 }],
              [{ boneId: 'bone-b', weight: 1 }],
              [{ boneId: 'bone-a', weight: 0.7 }, { boneId: 'bone-b', weight: 0.3 }],
              [{ boneId: 'bone-a', weight: 0.2 }, { boneId: 'bone-b', weight: 0.8 }],
            ],
          },
        },
      ],
      bones: [
        { id: 'bone-a', name: 'BoneA', parentId: null, setup: { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1, shearX: 0, shearY: 0, length: 50 } },
        { id: 'bone-b', name: 'BoneB', parentId: null, setup: { x: 100, y: 0, rotation: 0, scaleX: 1, scaleY: 1, shearX: 0, shearY: 0, length: 50 } },
      ],
    };

    applyWeightBrush({
      mesh: project.nodes[0].mesh, boneId: 'bone-a',
      localX: 50, localY: 50, radius: 60, hardness: 0.8,
      settings: { mode: 'add', strength: 0.5, targetWeight: 1 },
    });

    applyWeightBrush({
      mesh: project.nodes[0].mesh, boneId: 'bone-b',
      localX: 10, localY: 10, radius: 30, hardness: 1,
      settings: { mode: 'subtract', strength: 0.3, targetWeight: 0 },
    });

    const snapshot = createPortableProjectSnapshot(project);
    assertJsonSafe(snapshot);

    const validation = validateProject(snapshot);
    expect(validation.success).toBe(true);

    const blob = await saveProject(project);
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    const projectJson = JSON.parse(await zip.file('project.json').async('string'));

    const savedInfluences = projectJson.nodes[0].mesh.influences;
    expect(Array.isArray(savedInfluences)).toBe(true);
    expect(savedInfluences).toHaveLength(5);

    for (const list of savedInfluences) {
      expect(list.length).toBeLessThanOrEqual(4);
      for (const inf of list) {
        expect(inf).toHaveProperty('boneId');
        expect(typeof inf.weight).toBe('number');
        expect(inf.weight).toBeGreaterThanOrEqual(0);
        expect(inf.weight).toBeLessThanOrEqual(1);
      }
      const sum = list.reduce((acc, inf) => acc + inf.weight, 0);
      if (list.length > 0) {
        expect(sum).toBeCloseTo(1, 5);
      }
    }

    const mocks = setupLoadMocks();
    try {
      const { project: loaded, resources } = await loadProject(await blob.arrayBuffer());
      const loadedInfluences = loaded.nodes[0].mesh.influences;
      expect(loadedInfluences).toHaveLength(5);
      for (let i = 0; i < loadedInfluences.length; i++) {
        expect(loadedInfluences[i]).toEqual(savedInfluences[i]);
      }
      resources.dispose();
    } finally {
      restoreLoadMocks(mocks);
    }
  });

  describe('auto-motion modifier roundtrip', () => {
    it('save/load preserves idle breathing modifier with time driver', async () => {
      vi.stubGlobal('fetch', okFetchMock());

      const project = makeMinimalProject();
      project.nodes.push({
        id: 'chest-1', type: 'part', name: 'Chest', parent: null, draw_order: 0,
        opacity: 1, visible: true,
        transform: { x: 400, y: 300, rotation: 0, scaleX: 1, scaleY: 1, pivotX: 50, pivotY: 50 },
        mesh: {
          vertices: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }],
          uvs: [0, 0, 1, 0, 1, 1, 0, 1], triangles: [[0, 1, 2], [0, 2, 3]], edgeIndices: [0, 1, 2, 3],
        },
        blendShapes: [{ id: 'bs1', name: 'Breath In', deltas: [{ dx: 0, dy: 0 }, { dx: 0, dy: 0 }, { dx: 0, dy: 0 }, { dx: 0, dy: 0 }] }],
        blendShapeValues: { bs1: 0 },
      });
      project.controlHandles = [{
        id: 'ch1', name: 'Chest', role: 'chest', space: 'node-local',
        target: { kind: 'part', id: 'chest-1' }, position: { x: 100, y: 200 },
      }];
      project.animationModifiers = [{
        id: 'm1', name: 'Idle Breathing', presetId: 'builtin.idleBreathing',
        presetVersion: 1, enabled: true, order: 0, scope: 'project', category: 'loop',
        driver: { kind: 'time', periodMs: 2400, phase: 0, curve: 'easeInOutSine' },
        bindings: { chest: { role: 'chest', required: true, target: 'handle', weight: 1 } },
        outputs: [{ kind: 'blendShapeValue', targetId: 'chest-1', property: 'bs1', blendMode: 'add' }],
        params: { strength: 0.8, chestExpandPx: 10, verticalLiftPx: 20, phase: 0 },
      }];

      const blob = await saveProject(project);
      const zip = await JSZip.loadAsync(await blob.arrayBuffer());
      const projectJson = JSON.parse(await zip.file('project.json').async('string'));

      expect(projectJson.animationModifiers).toHaveLength(1);
      expect(projectJson.controlHandles).toHaveLength(1);

      const mod = projectJson.animationModifiers[0];
      expect(mod.presetId).toBe('builtin.idleBreathing');
      expect(mod.driver).toEqual({ kind: 'time', periodMs: 2400, phase: 0, curve: 'easeInOutSine' });
      expect(mod.outputs[0]).toEqual({ kind: 'blendShapeValue', targetId: 'chest-1', property: 'bs1', blendMode: 'add' });
      expect(mod.params).toEqual({ strength: 0.8, chestExpandPx: 10, verticalLiftPx: 20, phase: 0 });

      expect(validateProject(projectJson).success).toBe(true);
    });

    it('save/load preserves head cheek jiggle modifier with boneMotion driver', async () => {
      vi.stubGlobal('fetch', okFetchMock());

      const project = makeMinimalProject();
      project.bones.push({
        id: 'head-bone', name: 'Head', parentId: null,
        setup: { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1, length: 50, shearX: 0, shearY: 0 },
      });
      project.nodes.push({
        id: 'face-1', type: 'part', name: 'Face', parent: null, draw_order: 0,
        opacity: 1, visible: true,
        transform: { x: 200, y: 150, rotation: 0, scaleX: 1, scaleY: 1, pivotX: 0, pivotY: 0 },
        mesh: {
          vertices: [{ x: 0, y: 0 }, { x: 60, y: 0 }, { x: 60, y: 60 }, { x: 0, y: 60 }],
          uvs: [0, 0, 1, 0, 1, 1, 0, 1], triangles: [[0, 1, 2], [0, 2, 3]], edgeIndices: [0, 1, 2, 3],
        },
        blendShapes: [{ id: 'cj1', name: 'Cheek Jiggle', deltas: [{ dx: 0, dy: 0 }, { dx: 0, dy: 0 }, { dx: 0, dy: 0 }, { dx: 0, dy: 0 }] }],
        blendShapeValues: { cj1: 0 },
      });
      project.controlHandles = [{
        id: 'ch1', name: 'Source Bone', role: 'sourceBone', space: 'node-local',
        target: { kind: 'bone', id: 'head-bone' }, position: { x: 0, y: 0 },
      }];
      project.animationModifiers = [{
        id: 'm1', name: 'Head Cheek Jiggle', presetId: 'builtin.headCheekJiggle',
        presetVersion: 1, enabled: true, order: 0, scope: 'project', category: 'reaction',
        driver: { kind: 'boneMotion', sourceBoneId: 'head-bone', axes: ['x', 'y'], gain: 0.5, deadZone: 0.01, curve: 'abs' },
        bindings: {
          sourceBone: { role: 'sourceBone', required: true, target: 'handle', weight: 1 },
          facePart: { role: 'facePart', required: true, target: 'handle', weight: 1 },
        },
        outputs: [{ kind: 'blendShapeValue', targetId: 'face-1', property: 'cj1', blendMode: 'add' }],
        params: { strength: 0.5, jiggle: 0.3, softness: 0.5, gain: 0.5, deadZone: 0.01 },
      }];

      const blob = await saveProject(project);
      const zip = await JSZip.loadAsync(await blob.arrayBuffer());
      const projectJson = JSON.parse(await zip.file('project.json').async('string'));

      expect(projectJson.animationModifiers).toHaveLength(1);
      expect(projectJson.controlHandles).toHaveLength(1);

      const mod = projectJson.animationModifiers[0];
      expect(mod.presetId).toBe('builtin.headCheekJiggle');
      expect(mod.category).toBe('reaction');
      expect(mod.driver).toEqual({ kind: 'boneMotion', sourceBoneId: 'head-bone', axes: ['x', 'y'], gain: 0.5, deadZone: 0.01, curve: 'abs' });
      expect(mod.outputs[0]).toEqual({ kind: 'blendShapeValue', targetId: 'face-1', property: 'cj1', blendMode: 'add' });

      // Verify schema acceptance
      const validation = validateProject(projectJson);
      expect(validation.success).toBe(true);
    });

    it('save/load preserves both auto motion modifier types in same project', async () => {
      vi.stubGlobal('fetch', okFetchMock());

      const project = {
        ...makeMinimalProject(),
        bones: [{
          id: 'head-bone', name: 'Head', parentId: null,
          setup: { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1, length: 50, shearX: 0, shearY: 0 },
        }],
        nodes: [
          {
            id: 'chest-1', type: 'part', name: 'Chest', parent: null, draw_order: 0,
            opacity: 1, visible: true,
            transform: { x: 400, y: 300, rotation: 0, scaleX: 1, scaleY: 1, pivotX: 50, pivotY: 50 },
            mesh: {
              vertices: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }],
              uvs: [0, 0, 1, 0, 1, 1, 0, 1], triangles: [[0, 1, 2], [0, 2, 3]], edgeIndices: [0, 1, 2, 3],
            },
            blendShapes: [
              { id: 'bs1', name: 'Breath In', deltas: [{ dx: 0, dy: 0 }, { dx: 0, dy: 0 }, { dx: 0, dy: 0 }, { dx: 0, dy: 0 }] },
              { id: 'cj1', name: 'Cheek Jiggle', deltas: [{ dx: 0, dy: 0 }, { dx: 0, dy: 0 }, { dx: 0, dy: 0 }, { dx: 0, dy: 0 }] },
            ],
            blendShapeValues: { bs1: 0, cj1: 0 },
          },
          {
            id: 'face-1', type: 'part', name: 'Face', parent: null, draw_order: 1,
            opacity: 1, visible: true,
            transform: { x: 200, y: 150, rotation: 0, scaleX: 1, scaleY: 1, pivotX: 0, pivotY: 0 },
            mesh: {
              vertices: [{ x: 0, y: 0 }, { x: 60, y: 0 }, { x: 60, y: 60 }, { x: 0, y: 60 }],
              uvs: [0, 0, 1, 0, 1, 1, 0, 1], triangles: [[0, 1, 2], [0, 2, 3]], edgeIndices: [0, 1, 2, 3],
            },
            blendShapes: [{ id: 'cj2', name: 'Cheek Jiggle', deltas: [{ dx: 0, dy: 0 }, { dx: 0, dy: 0 }, { dx: 0, dy: 0 }, { dx: 0, dy: 0 }] }],
            blendShapeValues: { cj2: 0 },
          },
        ],
        controlHandles: [
          { id: 'ch1', name: 'Chest', role: 'chest', space: 'node-local', target: { kind: 'part', id: 'chest-1' }, position: { x: 100, y: 200 } },
          { id: 'ch2', name: 'Source Bone', role: 'sourceBone', space: 'node-local', target: { kind: 'bone', id: 'head-bone' }, position: { x: 0, y: 0 } },
        ],
        animationModifiers: [
          {
            id: 'm1', name: 'Idle Breathing', presetId: 'builtin.idleBreathing',
            presetVersion: 1, enabled: true, order: 0, scope: 'project', category: 'loop',
            driver: { kind: 'time', periodMs: 2400, phase: 0, curve: 'easeInOutSine' },
            bindings: { chest: { role: 'chest', required: true, target: 'handle', weight: 1 } },
            outputs: [{ kind: 'blendShapeValue', targetId: 'chest-1', property: 'bs1', blendMode: 'add' }],
            params: { strength: 0.8, chestExpandPx: 10, verticalLiftPx: 20, phase: 0 },
          },
          {
            id: 'm2', name: 'Head Cheek Jiggle', presetId: 'builtin.headCheekJiggle',
            presetVersion: 1, enabled: true, order: 1, scope: 'project', category: 'reaction',
            driver: { kind: 'boneMotion', sourceBoneId: 'head-bone', axes: ['x', 'y'], gain: 0.5, deadZone: 0.01, curve: 'abs' },
            bindings: {
              sourceBone: { role: 'sourceBone', required: true, target: 'handle', weight: 1 },
              facePart: { role: 'facePart', required: true, target: 'handle', weight: 1 },
            },
            outputs: [{ kind: 'blendShapeValue', targetId: 'face-1', property: 'cj2', blendMode: 'add' }],
            params: { strength: 0.5, jiggle: 0.3, softness: 0.5, gain: 0.5, deadZone: 0.01 },
          },
        ],
      };

      const blob = await saveProject(project);
      const zip = await JSZip.loadAsync(await blob.arrayBuffer());
      const projectJson = JSON.parse(await zip.file('project.json').async('string'));

      expect(projectJson.animationModifiers).toHaveLength(2);

      const idleMod = projectJson.animationModifiers.find(m => m.presetId === 'builtin.idleBreathing');
      expect(idleMod.driver.kind).toBe('time');
      expect(idleMod.enabled).toBe(true);

      const jiggleMod = projectJson.animationModifiers.find(m => m.presetId === 'builtin.headCheekJiggle');
      expect(jiggleMod.driver.kind).toBe('boneMotion');
      expect(jiggleMod.driver.sourceBoneId).toBe('head-bone');
      expect(jiggleMod.category).toBe('reaction');

      expect(validateProject(projectJson).success).toBe(true);
    });
  });

  it('schema rejects influences with weight > 1', () => {
    const project = {
      ...makeMinimalProject(),
      nodes: [
        makePart('p1', 'Part', {
          mesh: {
            vertices: [{ x: 0, y: 0 }],
            uvs: [0, 0],
            triangles: [[0, 0, 0]],
            edgeIndices: [0],
            influences: [[{ boneId: 'b1', weight: 1.5 }]],
          },
        }),
      ],
    };
    const result = validateProject(project);
    expect(result.success).toBe(false);
  });

  it('schema rejects influences with NaN weight', () => {
    const project = {
      ...makeMinimalProject(),
      nodes: [
        makePart('p1', 'Part', {
          mesh: {
            vertices: [{ x: 0, y: 0 }],
            uvs: [0, 0],
            triangles: [[0, 0, 0]],
            edgeIndices: [0],
            influences: [[{ boneId: 'b1', weight: NaN }]],
          },
        }),
      ],
    };
    const result = validateProject(project);
    expect(result.success).toBe(false);
  });

  it('rejects mesh_verts track with non-finite coordinates', () => {
    const project = {
      ...makeMinimalProject(),
      animations: [
        {
          id: 'anim-bad',
          name: 'Bad',
          duration: 1000,
          fps: 24,
          tracks: [
            {
              targetId: 'some-node',
              property: 'mesh_verts',
              keyframes: [
                { time: 0, value: [{ x: NaN, y: 0 }] },
              ],
            },
          ],
        },
      ],
    };

    const result = validateProject(project);
    expect(result.success).toBe(false);
  });

  it('snapshot normalizes TypedArrays in mesh and preserves influences', () => {
    const project = makeMinimalProject();
    project.nodes = [
      makePart('p1', 'Part', {
        mesh: {
          vertices: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 0, y: 10 }],
          uvs: new Float32Array([0, 0, 1, 0, 0, 1]),
          triangles: [[0, 1, 2]],
          edgeIndices: new Uint16Array([0, 1, 2]),
          influences: [
            [{ boneId: 'b1', weight: 1 }],
            [{ boneId: 'b1', weight: 0.5 }, { boneId: 'b2', weight: 0.5 }],
            [{ boneId: 'b2', weight: 1 }],
          ],
        },
      }),
    ];

    const snapshot = createPortableProjectSnapshot(project);
    assertJsonSafe(snapshot);

    expect(Array.isArray(snapshot.nodes[0].mesh.uvs)).toBe(true);
    expect(snapshot.nodes[0].mesh.uvs).not.toBeInstanceOf(Float32Array);
    expect(Array.isArray(snapshot.nodes[0].mesh.edgeIndices)).toBe(true);
    expect(snapshot.nodes[0].mesh.edgeIndices).not.toBeInstanceOf(Uint16Array);
    expect(snapshot.nodes[0].mesh.influences).toEqual([
      [{ boneId: 'b1', weight: 1 }],
      [{ boneId: 'b1', weight: 0.5 }, { boneId: 'b2', weight: 0.5 }],
      [{ boneId: 'b2', weight: 1 }],
    ]);
  });
});
