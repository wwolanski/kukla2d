import { afterEach, describe, expect, it, vi } from 'vitest';
import JSZip from 'jszip';
import { saveProject, loadProject } from '../src/io/projectFile';
import {
  PROJECT_ARCHIVE_FORMAT_ID,
  PROJECT_ARCHIVE_VERSION,
  PROJECT_MANIFEST_PATH,
} from '../src/io/projectFormat';
import { CURRENT_PROJECT_VERSION, validateProject } from '../src/schema/projectSchema';
import {
  createPortableProjectSnapshot,
  assertJsonSafe,
} from '../src/schema/projectSnapshot';
import { PERSISTED_PROJECT_FIELDS } from '../src/schema/projectDocumentAdapter';

const TEX_A_BYTES = new Uint8Array([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x01]);
const TEX_B_BYTES = new Uint8Array([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x02, 0xFF]);
const AUDIO_A_BYTES = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x08]);
const AUDIO_B_BYTES = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x10, 0xAA, 0xBB]);

function createDeterministicFetch() {
  const cycle1Bytes = [TEX_A_BYTES, TEX_B_BYTES, AUDIO_A_BYTES, AUDIO_B_BYTES];
  const allBytes = [...cycle1Bytes, ...cycle1Bytes];
  let callIndex = 0;

  return vi.fn(async () => {
    const idx = callIndex++;
    const bytes = allBytes[idx] ?? new Uint8Array([1, 2, 3, 4]);
    return { ok: true, blob: async () => new Uint8Array(bytes) };
  });
}

function setupBrowserMocks() {
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

function restoreBrowserMocks(mocks) {
  globalThis.URL.createObjectURL = mocks.origCreateObjectURL;
  globalThis.URL.revokeObjectURL = mocks.origRevokeObjectURL;
}

function createExhaustiveProject() {
  return {
    version: CURRENT_PROJECT_VERSION,
    author: 'Integrity Author',
    lastActiveAnimationId: 'anim-1',
    canvas: {
      width: 640,
      height: 480,
      x: -120,
      y: 40,
      presetId: 'custom',
      fitSource: { kind: 'animation', animationId: 'anim-1', animationName: 'Idle' },
    },
    textures: [
      { id: 'tex-a', source: 'memory://tex-a.png', fileName: 'char_a.png', fileSize: TEX_A_BYTES.length },
      { id: 'tex-b', source: 'memory://tex-b.png', fileName: 'char_b.png', fileSize: TEX_B_BYTES.length },
    ],
    nodes: [
      {
        id: 'root-group',
        type: 'group',
        name: 'Root',
        parent: null,
        opacity: 1,
        visible: true,
        transform: { x: 320, y: 240, rotation: 0, scaleX: 1, scaleY: 1, pivotX: 0, pivotY: 0 },
        boneRole: 'root',
      },
      {
        id: 'body',
        type: 'part',
        name: 'Body',
        parent: 'root-group',
        draw_order: 0,
        opacity: 1,
        visible: true,
        transform: { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1, pivotX: 50, pivotY: 50 },
        textureId: 'tex-a',
        boneId: 'bone-spine',
        boneLinkLocked: true,
        imageWidth: 200,
        imageHeight: 200,
        imageBounds: { minX: 0, minY: 0, maxX: 200, maxY: 200 },
        clipToPartId: undefined,
        alphaContours: [
          [[0, 0], [200, 0], [200, 200], [0, 200]],
        ],
        pivotLocked: true,
        tag: 'character',
        mesh: {
          vertices: [
            { x: 0, y: 0, restX: 0, restY: 0 },
            { x: 200, y: 0, restX: 200, restY: 0 },
            { x: 200, y: 200, restX: 200, restY: 200 },
            { x: 0, y: 200, restX: 0, restY: 200 },
          ],
          uvs: [0, 0, 1, 0, 1, 1, 0, 1],
          triangles: [[0, 1, 2], [0, 2, 3]],
          edgeIndices: [0, 1, 2, 3],
          influences: [
            [{ boneId: 'bone-spine', weight: 1 }],
            [{ boneId: 'bone-spine', weight: 0.7 }, { boneId: 'bone-head', weight: 0.3 }],
            [{ boneId: 'bone-head', weight: 1 }],
            [{ boneId: 'bone-spine', weight: 0.5 }, { boneId: 'bone-head', weight: 0.5 }],
          ],
          boneWeights: [1, 0.7, 0, 0.5],
          jointBoneId: 'bone-spine',
        },
        blendShapes: [
          {
            id: 'blink',
            name: 'Blink',
            deltas: [
              { dx: 0, dy: 0 },
              { dx: 0, dy: -2 },
              { dx: 0, dy: -4 },
              { dx: 0, dy: 0 },
            ],
          },
        ],
        blendShapeValues: { blink: 0 },
      },
      {
        id: 'accessory',
        type: 'part',
        name: 'Accessory',
        parent: 'root-group',
        draw_order: 1,
        opacity: 0.9,
        visible: true,
        transform: { x: 10, y: -10, rotation: 15, scaleX: 1.2, scaleY: 1.2, pivotX: 0, pivotY: 0 },
        textureId: 'tex-b',
        clipToPartId: 'body',
      },
      {
        id: 'warp-body',
        type: 'warpDeformer',
        name: 'WarpBody',
        parent: 'root-group',
        opacity: 1,
        visible: true,
        transform: { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1, pivotX: 0, pivotY: 0 },
        col: 3,
        row: 3,
        gridX: -50,
        gridY: -50,
        gridW: 300,
        gridH: 300,
      },
    ],
    bones: [
      {
        id: 'bone-spine',
        name: 'Spine',
        parentId: null,
        setup: { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1, shearX: 0, shearY: 0, length: 100 },
        inherit: 'normal',
        nodeId: 'body',
      },
      {
        id: 'bone-head',
        name: 'Head',
        parentId: 'bone-spine',
        setup: { x: 0, y: 100, rotation: 0, scaleX: 1, scaleY: 1, shearX: 0, shearY: 0, length: 60 },
        inherit: 'onlyTranslation',
        nodeId: null,
      },
    ],
    slots: [
      {
        id: 'slot-body',
        name: 'BodySlot',
        boneId: 'bone-spine',
        setupAttachmentId: 'att-body',
        color: '#ff8800',
        blendMode: 'additive',
        drawOrder: 0,
      },
      {
        id: 'slot-accessory',
        name: 'AccessorySlot',
        boneId: 'bone-spine',
        setupAttachmentId: 'att-accessory',
        color: 'ffffffff',
        blendMode: 'normal',
        drawOrder: 1,
      },
    ],
    attachments: [
      {
        id: 'att-body',
        type: 'mesh',
        assetId: 'tex-a',
        localTransform: { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1, pivotX: 0, pivotY: 0 },
      },
      {
        id: 'att-accessory',
        type: 'region',
        assetId: 'tex-b',
        localTransform: { x: 10, y: -10, rotation: 0, scaleX: 1, scaleY: 1, pivotX: 0, pivotY: 0 },
      },
    ],
    skins: [
      {
        id: 'skin-default',
        name: 'Default',
        entries: [
          { slotId: 'slot-body', attachmentId: 'att-body' },
          { slotId: 'slot-accessory', attachmentId: 'att-accessory' },
        ],
      },
      {
        id: 'skin-alt',
        name: 'Alternate',
        entries: [
          { slotId: 'slot-body', attachmentId: 'att-body' },
        ],
      },
    ],
    constraints: [
      {
        id: 'ik-head',
        type: 'ik',
        name: 'HeadIK',
        order: 0,
        enabled: true,
        affectedBoneIds: ['bone-head'],
        assignedBoneId: 'bone-head',
        targetBoneId: null,
        targetX: 50,
        targetY: 120,
        color: 0xff0000,
        poleBoneId: null,
        mix: 1,
        fkIk: 0,
        bendPositive: true,
      },
    ],
    defaultPose: {
      'bone-spine': { x: 0, y: 0, rotation: 0 },
      'bone-head': { x: 0, y: 100, rotation: 0 },
      'warp-body': {
        mesh_verts: [
          { x: 0, y: 0 },
          { x: 200, y: 0 },
          { x: 200, y: 200 },
          { x: 0, y: 200 },
        ],
      },
    },
    animations: [
      {
        id: 'anim-idle',
        name: 'Idle',
        duration: 2000,
        fps: 24,
        tracks: [
          {
            targetId: 'body',
            property: 'mesh_verts',
            keyframes: [
              {
                time: 0,
                value: [
                  { x: 0, y: 0 },
                  { x: 200, y: 0 },
                  { x: 200, y: 200 },
                  { x: 0, y: 200 },
                ],
              },
              {
                time: 1000,
                value: [
                  { x: 2, y: -1 },
                  { x: 203, y: 1 },
                  { x: 198, y: 198 },
                  { x: 1, y: 199 },
                ],
                easing: 'ease-both',
              },
            ],
          },
          {
            targetId: 'body',
            property: 'blendShape:blink',
            keyframes: [
              { time: 0, value: 0 },
              { time: 500, value: 1 },
              { time: 600, value: 0 },
              { time: 1500, value: 1 },
              { time: 1600, value: 0 },
            ],
          },
          {
            targetId: 'bone-head',
            property: 'rotation',
            keyframes: [
              { time: 0, value: 0 },
              { time: 500, value: 5, easing: [0.42, 0, 0.58, 1] },
              { time: 1500, value: -5 },
              { time: 2000, value: 0 },
            ],
          },
          {
            targetId: 'body',
            property: 'opacity',
            keyframes: [
              { time: 0, value: 1 },
              { time: 1000, value: 0.8 },
              { time: 2000, value: 1 },
            ],
          },
          {
            targetId: 'ik-head',
            property: 'targetX',
            keyframes: [
              { time: 0, value: 50 },
              { time: 1000, value: 55 },
              { time: 2000, value: 50 },
            ],
          },
          {
            targetId: 'body',
            property: 'drawOrder',
            keyframes: [
              { time: 0, value: 0 },
              { time: 1000, value: 1 },
              { time: 2000, value: 0 },
            ],
          },
        ],
        markers: [
          { id: 'm1', time: 0, label: 'Start' },
          { id: 'm2', time: 1000, label: 'Mid' },
          { id: 'm3', time: 2000, label: 'End' },
        ],
        audioTracks: [
          {
            id: 'audio-voice',
            name: 'Voice',
            mimeType: 'audio/wav',
            audioDurationMs: 3000,
            audioStartMs: 0,
            audioEndMs: 2000,
            timelineStartMs: 0,
            sourceUrl: 'blob://audio-voice',
          },
          {
            id: 'audio-sfx',
            name: 'SFX',
            mimeType: 'audio/mpeg',
            audioDurationMs: 500,
            audioStartMs: 100,
            audioEndMs: 400,
            timelineStartMs: 500,
            sourceUrl: 'blob://audio-sfx',
          },
        ],
      },
      {
        id: 'anim-wave',
        name: 'Wave',
        duration: 1000,
        fps: 12,
        tracks: [
          {
            targetId: 'body',
            property: 'opacity',
            keyframes: [
              { time: 0, value: 1 },
              { time: 500, value: 0.5 },
              { time: 1000, value: 1 },
            ],
          },
        ],
        audioTracks: [],
      },
    ],
    physics_groups: [
      { id: 'pg-hair', name: 'Hair' },
      { id: 'pg-cloth', name: 'Cloth' },
    ],
    physicsRules: [
      { id: 'pr-spring', type: 'spring', groupId: 'pg-hair', stiffness: 0.6, damping: 0.2 },
      { id: 'pr-gravity', type: 'gravity', groupId: 'pg-cloth', gravity: 9.8 },
    ],
    libraryFolders: [
      { id: 'folder-char', name: 'Characters', parentId: null, sourceFileName: 'sheet.psd', origin: 'import' },
      { id: 'folder-parts', name: 'Parts', parentId: 'folder-char', origin: 'user' },
    ],
    assetPlacements: [
      { assetId: 'tex-a', folderId: 'folder-char' },
      { assetId: 'tex-b', folderId: 'folder-parts' },
    ],
    modularSprites: [],
    controlHandles: [
      {
        id: 'ch-chest',
        name: 'Chest',
        role: 'chest',
        space: 'node-local',
        target: { kind: 'part', id: 'body' },
        position: { x: 100, y: 150 },
      },
      {
        id: 'ch-head',
        name: 'Head Bone',
        role: 'sourceBone',
        space: 'bone-local',
        target: { kind: 'bone', id: 'bone-head' },
        position: { x: 0, y: 0 },
        locked: true,
      },
    ],
    animationModifiers: [
      {
        id: 'mod-breathe',
        name: 'Idle Breathing',
        presetId: 'builtin.idleBreathing',
        presetVersion: 1,
        enabled: true,
        order: 0,
        scope: 'project',
        category: 'loop',
        driver: { kind: 'time', periodMs: 3000, phase: 0, curve: 'easeInOutSine' },
        bindings: {
          chest: { role: 'chest', required: true, target: 'handle', weight: 1 },
        },
        outputs: [
          { kind: 'blendShapeValue', targetId: 'body', property: 'blendShape:blink', blendMode: 'add' },
        ],
        params: { strength: 0.8, chestExpandPx: 10, verticalLiftPx: 5, phase: 0 },
      },
    ],
  };
}

function normalizePortableForEquivalence(project) {
  const normalized = {};
  for (const field of PERSISTED_PROJECT_FIELDS) {
    normalized[field] = project[field];
  }

  if (normalized.textures) {
    normalized.textures = normalized.textures.map(tex => ({
      ...tex,
      source: '<normalized>',
    }));
  }

  if (normalized.animations) {
    normalized.animations = normalized.animations.map(anim => {
      const normalizedAnimation = {
        ...anim,
        audioTracks: (anim.audioTracks ?? []).map(track => ({
        ...track,
        source: track.source !== undefined ? '<normalized>' : undefined,
        sourceUrl: track.sourceUrl !== undefined ? '<normalized>' : undefined,
        })),
      };
      if (normalizedAnimation.markers?.length === 0) delete normalizedAnimation.markers;
      return normalizedAnimation;
    });
  }

  if (normalized.nodes) {
    normalized.nodes = normalized.nodes.map(node => {
      const normalizedNode = { ...node };
      if (normalizedNode.blendShapes?.length === 0) delete normalizedNode.blendShapes;
      if (normalizedNode.blendShapeValues
        && Object.keys(normalizedNode.blendShapeValues).length === 0) {
        delete normalizedNode.blendShapeValues;
      }
      if (!normalizedNode.mesh) return normalizedNode;
      const mesh = { ...normalizedNode.mesh };
      if (mesh.uvs instanceof Float32Array) {
        mesh.uvs = Array.from(mesh.uvs);
      }
      if (mesh.edgeIndices instanceof Uint16Array || mesh.edgeIndices instanceof Uint32Array) {
        mesh.edgeIndices = Array.from(mesh.edgeIndices);
      }
      return { ...normalizedNode, mesh };
    });
  }

  return normalized;
}

async function readArchiveProjectJson(blob) {
  const zip = await JSZip.loadAsync(await blob.arrayBuffer());
  const projectJson = JSON.parse(await zip.file('project.json').async('string'));
  const manifest = JSON.parse(await zip.file(PROJECT_MANIFEST_PATH).async('string'));
  return { zip, projectJson, manifest };
}

async function getArchiveAssetBytes(zip, path) {
  const entry = zip.file(path);
  if (!entry) return null;
  return new Uint8Array(await entry.async('arraybuffer'));
}

function expectNoRuntimeArtifacts(value, path = '$') {
  if (value === null || value === undefined) return;
  if (typeof value === 'number' || typeof value === 'string' || typeof value === 'boolean') return;
  if (value instanceof Float32Array || value instanceof Uint16Array || value instanceof Uint32Array) {
    throw new Error(`TypedArray at ${path} should not be in portable snapshot`);
  }
  if (value instanceof Set || value instanceof Map) {
    throw new Error(`${value.constructor.name} at ${path} should not be in portable snapshot`);
  }
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      expectNoRuntimeArtifacts(value[i], `${path}[${i}]`);
    }
    return;
  }
  if (typeof value === 'object' && value.constructor === Object) {
    for (const key of Object.keys(value)) {
      expectNoRuntimeArtifacts(value[key], `${path}.${key}`);
    }
  }
}

describe('kk2d integrity (Stage 01)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('1A: exhaustive fixture and equivalence', () => {
    it('exhaustive project validates against schema', () => {
      const project = createExhaustiveProject();
      const result = validateProject(project);
      expect(result.success).toBe(true);
    });

    it('snapshot keys exactly match PERSISTED_PROJECT_FIELDS', () => {
      const project = createExhaustiveProject();
      const snapshot = createPortableProjectSnapshot(project);
      expect(Object.keys(snapshot).sort()).toEqual([...PERSISTED_PROJECT_FIELDS].sort());
    });

    it('snapshot contains no TypedArray, Set, Map, or undefined', () => {
      const project = createExhaustiveProject();
      project.nodes[1].mesh.uvs = new Float32Array(project.nodes[1].mesh.uvs);
      project.nodes[1].mesh.edgeIndices = new Set(project.nodes[1].mesh.edgeIndices);

      const snapshot = createPortableProjectSnapshot(project);
      assertJsonSafe(snapshot);
      expectNoRuntimeArtifacts(snapshot);
      expect(JSON.stringify(snapshot)).toBeTruthy();
    });

    it('snapshot is JSON round-trippable without data loss', () => {
      const project = createExhaustiveProject();
      const snapshot = createPortableProjectSnapshot(project);
      const reparsed = JSON.parse(JSON.stringify(snapshot));
      expect(reparsed).toEqual(snapshot);
    });

    it('snapshot retains all exhaustive nested data', () => {
      const project = createExhaustiveProject();
      const snapshot = createPortableProjectSnapshot(project);

      expect(snapshot.version).toBe(CURRENT_PROJECT_VERSION);
      expect(snapshot.canvas).toEqual(project.canvas);

      expect(snapshot.textures).toHaveLength(2);
      expect(snapshot.textures[0].id).toBe('tex-a');
      expect(snapshot.textures[0].fileName).toBe('char_a.png');
      expect(snapshot.textures[0].fileSize).toBe(TEX_A_BYTES.length);
      expect(snapshot.textures[1].id).toBe('tex-b');

      expect(snapshot.nodes).toHaveLength(4);
      expect(snapshot.nodes[0].type).toBe('group');
      expect(snapshot.nodes[0].boneRole).toBe('root');
      expect(snapshot.nodes[1].type).toBe('part');
      expect(snapshot.nodes[1].mesh.influences).toHaveLength(4);
      expect(snapshot.nodes[1].blendShapes).toHaveLength(1);
      expect(snapshot.nodes[1].imageBounds).toEqual({ minX: 0, minY: 0, maxX: 200, maxY: 200 });
      expect(snapshot.nodes[1].alphaContours).toEqual([[[0, 0], [200, 0], [200, 200], [0, 200]]]);
      expect(snapshot.nodes[2].clipToPartId).toBe('body');
      expect(snapshot.nodes[3].type).toBe('warpDeformer');
      expect(snapshot.nodes[3].col).toBe(3);

      expect(snapshot.bones).toHaveLength(2);
      expect(snapshot.bones[0].inherit).toBe('normal');
      expect(snapshot.bones[1].inherit).toBe('onlyTranslation');

      expect(snapshot.slots).toHaveLength(2);
      expect(snapshot.slots[0].blendMode).toBe('additive');
      expect(snapshot.attachments).toHaveLength(2);
      expect(snapshot.skins).toHaveLength(2);

      expect(snapshot.constraints).toHaveLength(1);
      expect(snapshot.constraints[0].type).toBe('ik');

      expect(snapshot.defaultPose['warp-body'].mesh_verts).toHaveLength(4);

      expect(snapshot.animations).toHaveLength(2);
      expect(snapshot.animations[0].tracks).toHaveLength(6);
      expect(snapshot.animations[0].markers).toHaveLength(3);
      expect(snapshot.animations[0].audioTracks).toHaveLength(2);
      expect(snapshot.animations[0].audioTracks[0].id).toBe('audio-voice');
      expect(snapshot.animations[0].audioTracks[1].id).toBe('audio-sfx');
      expect(snapshot.animations[1].audioTracks).toHaveLength(0);

      expect(snapshot.physics_groups).toHaveLength(2);
      expect(snapshot.physicsRules).toHaveLength(2);

      expect(snapshot.libraryFolders).toHaveLength(2);
      expect(snapshot.libraryFolders[1].parentId).toBe('folder-char');
      expect(snapshot.assetPlacements).toHaveLength(2);

      expect(snapshot.controlHandles).toHaveLength(2);
      expect(snapshot.controlHandles[0].role).toBe('chest');
      expect(snapshot.controlHandles[1].locked).toBe(true);

      expect(snapshot.animationModifiers).toHaveLength(1);
      expect(snapshot.animationModifiers[0].driver.kind).toBe('time');
      expect(snapshot.animationModifiers[0].driver.periodMs).toBe(3000);
      expect(snapshot.animationModifiers[0].outputs).toHaveLength(1);
    });

    it('portable snapshot is identical for two independent calls', () => {
      const project = createExhaustiveProject();
      const snap1 = createPortableProjectSnapshot(project);
      const snap2 = createPortableProjectSnapshot(project);
      expect(snap1).toEqual(snap2);
    });
  });

  describe('1B: two-cycle save→load→save→load with byte proof', () => {
    it('two full cycles preserve semantic equivalence and asset bytes', async () => {
      vi.stubGlobal('fetch', createDeterministicFetch());
      const mocks = setupBrowserMocks();

      try {
        const project = createExhaustiveProject();

        const snapshotBefore = createPortableProjectSnapshot(project);
        const normalizedBefore = normalizePortableForEquivalence(snapshotBefore);

        const blob1 = await saveProject(project);

        const { zip: zip1, projectJson: pj1, manifest: manifest1 } = await readArchiveProjectJson(blob1);

        expect(manifest1).toEqual({
          formatId: PROJECT_ARCHIVE_FORMAT_ID,
          formatVersion: PROJECT_ARCHIVE_VERSION,
          documentVersion: CURRENT_PROJECT_VERSION,
        });

        const tex1BytesA = await getArchiveAssetBytes(zip1, 'textures/tex-a.png');
        const tex1BytesB = await getArchiveAssetBytes(zip1, 'textures/tex-b.png');
        const audio1Voice = await getArchiveAssetBytes(zip1, 'audios/audio-voice.wav');
        const audio1Sfx = await getArchiveAssetBytes(zip1, 'audios/audio-sfx.mp3');

        expect(tex1BytesA).toBeTruthy();
        expect(tex1BytesB).toBeTruthy();
        expect(audio1Voice).toBeTruthy();
        expect(audio1Sfx).toBeTruthy();

        expect(new Uint8Array(tex1BytesA)).toEqual(TEX_A_BYTES);
        expect(new Uint8Array(tex1BytesB)).toEqual(TEX_B_BYTES);
        expect(new Uint8Array(audio1Voice)).toEqual(AUDIO_A_BYTES);
        expect(new Uint8Array(audio1Sfx)).toEqual(AUDIO_B_BYTES);

        const archiveEntries = Object.keys(zip1.files).filter(name => !zip1.files[name].dir);
        const allowedPrefixes = ['textures/', 'audios/'];
        for (const name of archiveEntries) {
          if (name === 'project.json' || name === PROJECT_MANIFEST_PATH) continue;
          expect(allowedPrefixes.some(p => name.startsWith(p))).toBe(true);
        }

        expect(pj1.textures).toHaveLength(2);
        expect(pj1.textures[0].id).toBe('tex-a');
        expect(pj1.textures[0].source).toMatch(/^textures\//);
        expect(pj1.textures[0].fileName).toBe('char_a.png');
        expect(pj1.textures[0].fileSize).toBe(TEX_A_BYTES.length);
        expect(pj1.textures[1].id).toBe('tex-b');
        expect(pj1.textures[1].source).toMatch(/^textures\//);
        expect(pj1.textures[1].fileName).toBe('char_b.png');

        expect(pj1.animations[0].audioTracks[0].source).toMatch(/^audios\//);
        expect(pj1.animations[0].audioTracks[0].id).toBe('audio-voice');
        expect(pj1.animations[0].audioTracks[1].source).toMatch(/^audios\//);
        expect(pj1.animations[0].audioTracks[1].id).toBe('audio-sfx');

        const { project: loaded1, resources: res1 } = await loadProject(await blob1.arrayBuffer());

        expect(loaded1.version).toBe(CURRENT_PROJECT_VERSION);
        expect(loaded1.canvas).toEqual(project.canvas);
        expect(loaded1.textures).toHaveLength(2);
        expect(loaded1.textures[0].source).toMatch(/^blob:/);
        expect(loaded1.textures[0].fileName).toBe('char_a.png');
        expect(loaded1.textures[0].fileSize).toBe(TEX_A_BYTES.length);
        expect(loaded1.nodes).toHaveLength(4);
        expect(loaded1.nodes[1].mesh.uvs).toBeInstanceOf(Float32Array);
        expect(loaded1.animations[0].audioTracks[0].sourceUrl).toMatch(/^blob:/);
        expect(loaded1.animations[0].audioTracks[0]).not.toHaveProperty('source');

        const snapshotAfterLoad1 = createPortableProjectSnapshot(loaded1);
        const normalizedAfterLoad1 = normalizePortableForEquivalence(snapshotAfterLoad1);
        expect(normalizedAfterLoad1).toEqual(normalizedBefore);

        const blob2 = await saveProject(loaded1);

        const { zip: zip2, projectJson: pj2, manifest: manifest2 } = await readArchiveProjectJson(blob2);

        expect(manifest2).toEqual(manifest1);

        const tex2BytesA = await getArchiveAssetBytes(zip2, 'textures/tex-a.png');
        const tex2BytesB = await getArchiveAssetBytes(zip2, 'textures/tex-b.png');
        const audio2Voice = await getArchiveAssetBytes(zip2, 'audios/audio-voice.wav');
        const audio2Sfx = await getArchiveAssetBytes(zip2, 'audios/audio-sfx.mp3');

        expect(new Uint8Array(tex2BytesA)).toEqual(TEX_A_BYTES);
        expect(new Uint8Array(tex2BytesB)).toEqual(TEX_B_BYTES);
        expect(new Uint8Array(audio2Voice)).toEqual(AUDIO_A_BYTES);
        expect(new Uint8Array(audio2Sfx)).toEqual(AUDIO_B_BYTES);

        const normalizedPj1 = normalizePortableForEquivalence(pj1);
        const normalizedPj2 = normalizePortableForEquivalence(pj2);
        expect(normalizedPj2).toEqual(normalizedPj1);

        expect(pj2.textures[0].source).toBe(pj1.textures[0].source);
        expect(pj2.textures[1].source).toBe(pj1.textures[1].source);
        expect(pj2.textures[0].fileName).toBe(pj1.textures[0].fileName);
        expect(pj2.textures[1].fileName).toBe(pj1.textures[1].fileName);
        expect(pj2.textures[0].fileSize).toBe(pj1.textures[0].fileSize);
        expect(pj2.textures[1].fileSize).toBe(pj1.textures[1].fileSize);

        const { project: loaded2, resources: res2 } = await loadProject(await blob2.arrayBuffer());

        expect(loaded2.version).toBe(CURRENT_PROJECT_VERSION);
        expect(loaded2.canvas).toEqual(project.canvas);
        expect(loaded2.bones).toEqual(project.bones);
        expect(loaded2.slots).toEqual(project.slots);
        expect(loaded2.attachments).toEqual(project.attachments);
        expect(loaded2.skins).toEqual(project.skins);
        expect(loaded2.constraints).toEqual(project.constraints);
        expect(loaded2.defaultPose).toEqual(project.defaultPose);
        expect(loaded2.physics_groups).toEqual(project.physics_groups);
        expect(loaded2.physicsRules).toEqual(project.physicsRules);
        expect(loaded2.libraryFolders).toEqual(project.libraryFolders);
        expect(loaded2.assetPlacements).toEqual(project.assetPlacements);
        expect(loaded2.controlHandles).toEqual(project.controlHandles);
        expect(loaded2.animationModifiers).toEqual(project.animationModifiers);

        expect(loaded2.nodes[0].type).toBe('group');
        expect(loaded2.nodes[0].boneRole).toBe('root');
        expect(loaded2.nodes[1].type).toBe('part');
        expect(loaded2.nodes[1].mesh.vertices).toEqual(project.nodes[1].mesh.vertices);
        expect(loaded2.nodes[1].mesh.triangles).toEqual(project.nodes[1].mesh.triangles);
        expect(loaded2.nodes[1].mesh.influences).toEqual(project.nodes[1].mesh.influences);
        expect(loaded2.nodes[1].mesh.boneWeights).toEqual(project.nodes[1].mesh.boneWeights);
        expect(loaded2.nodes[1].mesh.jointBoneId).toBe('bone-spine');
        expect(loaded2.nodes[1].blendShapes).toEqual(project.nodes[1].blendShapes);
        expect(loaded2.nodes[1].imageBounds).toEqual(project.nodes[1].imageBounds);
        expect(loaded2.nodes[1].alphaContours).toEqual(project.nodes[1].alphaContours);
        expect(loaded2.nodes[2].clipToPartId).toBe('body');
        expect(loaded2.nodes[3].type).toBe('warpDeformer');
        expect(loaded2.nodes[3].col).toBe(3);

        expect(loaded2.animations).toHaveLength(2);
        expect(loaded2.animations[0].tracks).toHaveLength(6);
        expect(loaded2.animations[0].markers).toHaveLength(3);
        expect(loaded2.animations[0].audioTracks).toHaveLength(2);
        expect(loaded2.animations[0].audioTracks[0].id).toBe('audio-voice');
        expect(loaded2.animations[0].audioTracks[0].sourceUrl).toMatch(/^blob:/);
        expect(loaded2.animations[0].audioTracks[0].mimeType).toBe('audio/wav');
        expect(loaded2.animations[0].audioTracks[1].id).toBe('audio-sfx');
        expect(loaded2.animations[0].audioTracks[1].sourceUrl).toMatch(/^blob:/);
        expect(loaded2.animations[0].audioTracks[1].mimeType).toBe('audio/mpeg');
        expect(loaded2.animations[1].tracks).toHaveLength(1);

        const snapshotAfterLoad2 = createPortableProjectSnapshot(loaded2);
        const normalizedAfterLoad2 = normalizePortableForEquivalence(snapshotAfterLoad2);
        expect(normalizedAfterLoad2).toEqual(normalizedBefore);

        res1.dispose();
        res2.dispose();
      } finally {
        restoreBrowserMocks(mocks);
      }
    });

    it('archive contains no unexpected entries', async () => {
      vi.stubGlobal('fetch', createDeterministicFetch());

      const project = createExhaustiveProject();
      const blob = await saveProject(project);
      const zip = await JSZip.loadAsync(await blob.arrayBuffer());
      const entries = Object.keys(zip.files).filter(name => !zip.files[name].dir);

      expect(entries).toContain('project.json');
      expect(entries).toContain(PROJECT_MANIFEST_PATH);
      expect(entries).toContain('textures/tex-a.png');
      expect(entries).toContain('textures/tex-b.png');
      expect(entries).toContain('audios/audio-voice.wav');
      expect(entries).toContain('audios/audio-sfx.mp3');
      expect(entries).toHaveLength(6);
    });

    it('manifest metadata is stable across both cycles', async () => {
      vi.stubGlobal('fetch', createDeterministicFetch());
      const mocks = setupBrowserMocks();

      try {
        const project = createExhaustiveProject();
        const blob1 = await saveProject(project);
        const { projectJson: pj1, manifest: m1 } = await readArchiveProjectJson(blob1);

        const { project: loaded1, resources: res1 } = await loadProject(await blob1.arrayBuffer());
        const blob2 = await saveProject(loaded1);
        const { projectJson: pj2, manifest: m2 } = await readArchiveProjectJson(blob2);

        expect(m1).toEqual(m2);
        expect(pj1.version).toBe(pj2.version);
        expect(pj1.textures.map(t => ({ id: t.id, source: t.source, fileName: t.fileName, fileSize: t.fileSize })))
          .toEqual(pj2.textures.map(t => ({ id: t.id, source: t.source, fileName: t.fileName, fileSize: t.fileSize })));

        res1.dispose();
      } finally {
        restoreBrowserMocks(mocks);
      }
    });

    it('two textures and two audio tracks have byte-equal content across both cycles', async () => {
      vi.stubGlobal('fetch', createDeterministicFetch());
      const mocks = setupBrowserMocks();

      try {
        const project = createExhaustiveProject();
        const blob1 = await saveProject(project);
        const { zip: zip1 } = await readArchiveProjectJson(blob1);
        const bytes1TexA = await getArchiveAssetBytes(zip1, 'textures/tex-a.png');
        const bytes1TexB = await getArchiveAssetBytes(zip1, 'textures/tex-b.png');
        const bytes1AudV = await getArchiveAssetBytes(zip1, 'audios/audio-voice.wav');
        const bytes1AudS = await getArchiveAssetBytes(zip1, 'audios/audio-sfx.mp3');

        const { project: loaded1, resources: res1 } = await loadProject(await blob1.arrayBuffer());
        const blob2 = await saveProject(loaded1);
        const { zip: zip2 } = await readArchiveProjectJson(blob2);
        const bytes2TexA = await getArchiveAssetBytes(zip2, 'textures/tex-a.png');
        const bytes2TexB = await getArchiveAssetBytes(zip2, 'textures/tex-b.png');
        const bytes2AudV = await getArchiveAssetBytes(zip2, 'audios/audio-voice.wav');
        const bytes2AudS = await getArchiveAssetBytes(zip2, 'audios/audio-sfx.mp3');

        expect(new Uint8Array(bytes2TexA)).toEqual(new Uint8Array(bytes1TexA));
        expect(new Uint8Array(bytes2TexB)).toEqual(new Uint8Array(bytes1TexB));
        expect(new Uint8Array(bytes2AudV)).toEqual(new Uint8Array(bytes1AudV));
        expect(new Uint8Array(bytes2AudS)).toEqual(new Uint8Array(bytes1AudS));

        res1.dispose();
      } finally {
        restoreBrowserMocks(mocks);
      }
    });
  });
});
