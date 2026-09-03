import { describe, expect, it } from 'vitest';
import { buildLibraryTree, flattenLibraryTree } from '@/features/layers/domain/buildLibraryTree';
import type { LibraryTreeRow } from '@/features/layers/domain/buildLibraryTree';

const texture = (id: string, overrides = {}) => ({
  id, fileName: `${id}.png`, fileSize: 1024, ...overrides,
});

const node = (id: string, overrides = {}) => ({
  id, type: 'part', name: id, ...overrides,
});

describe('buildLibraryTree', () => {
  it('returns empty for empty input', () => {
    const rows = buildLibraryTree({ textures: [], nodes: [] });
    expect(rows).toEqual([]);
  });

  it('lists loose textures as asset rows', () => {
    const rows = buildLibraryTree({
      textures: [texture('t1')],
      nodes: [node('t1')],
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].kind).toBe('asset');
    expect(rows[0].id).toBe('t1');
    expect(rows[0].name).toBe('t1');
  });

  it('uses node name over fileName', () => {
    const rows = buildLibraryTree({
      textures: [texture('t1', { fileName: 'file.png' })],
      nodes: [node('t1', { name: 'MyPart' })],
    });
    expect(rows[0].name).toBe('MyPart');
  });

  it('builds folder hierarchy', () => {
    const rows = buildLibraryTree({
      libraryFolders: [
        { id: 'f1', name: 'Characters' },
        { id: 'f2', name: 'Hero', parentId: 'f1' },
      ],
      assetPlacements: [
        { assetId: 't1', folderId: 'f2' },
        { assetId: 't2', folderId: 'f1' },
      ],
      textures: [texture('t1'), texture('t2')],
      nodes: [node('t1'), node('t2')],
    });
    expect(rows).toHaveLength(1);
    const rootFolder = rows[0];
    expect(rootFolder.kind).toBe('folder');
    expect(rootFolder.name).toBe('Characters');
    if (rootFolder.kind === 'folder') {
      expect(rootFolder.children).toHaveLength(2);
    }
  });

  it('marks assets in use when referenced by a part node', () => {
    const rows = buildLibraryTree({
      textures: [texture('t1')],
      nodes: [node('n1', { textureId: 't1' })],
    });
    expect(rows[0].isInUse).toBe(true);
  });

  it('annotates protected modular sources and ordinary part assets', () => {
    const rows = buildLibraryTree({
      textures: [texture('source'), texture('head')],
      nodes: [],
      modularSprites: [{
        id: 'set-1',
        schemaVersion: 1,
        name: 'Hero',
        sourceAssetId: 'source',
        source: { width: 16, height: 16 },
        processorVersion: 1,
        recipe: {
          background: { mode: 'alpha', color: { r: 0, g: 0, b: 0 }, tolerance: 0, softness: 0.1, despill: 0 },
          detection: { alphaThreshold: 1, minimumRegionAreaRatio: 0, openingRadius: 0, closingRadius: 0, connectivity: 8 },
          strokes: [],
        },
        parts: [{
          partKey: 'head', assetId: 'head', name: 'Head', role: 'head', side: 'center', required: true, order: 0,
          extractionFrame: { x: 0, y: 0, width: 1, height: 1 },
          contentBounds: { x: 0, y: 0, width: 1, height: 1 },
          componentSeeds: [{ x: 0.5, y: 0.5 }],
        }],
      }],
    });
    expect(rows.find(row => row.id === 'source')).toMatchObject({ modularKind: 'source', modularSpriteId: 'set-1' });
    expect(rows.find(row => row.id === 'head')).toMatchObject({ modularKind: 'part', partKey: 'head' });
  });

  it('falls back to texture id for name', () => {
    const rows = buildLibraryTree({
      textures: [texture('t1', { fileName: null })],
      nodes: [],
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe('t1');
  });

  it('uses extension-free unique display names for legacy duplicate textures', () => {
    const rows = buildLibraryTree({
      textures: [
        texture('t1', { fileName: 'Right Arm.png' }),
        texture('t2', { fileName: 'Right Arm.png' }),
        texture('t3', { fileName: 'Right Arm.png' }),
      ],
      nodes: [],
    });
    expect(rows.map(row => row.name)).toEqual(['Right Arm', 'Right Arm (1)', 'Right Arm (2)']);
    expect(rows.map(row => row.sourceFileName)).toEqual(['Right Arm.png', 'Right Arm.png', 'Right Arm.png']);
  });

  it('prefers persistent texture display name over fileName', () => {
    const rows = buildLibraryTree({
      textures: [texture('t1', { name: 'Custom Name', fileName: 'source.png' })],
      nodes: [],
    });
    expect(rows[0].name).toBe('Custom Name');
    expect(rows[0].sourceFileName).toBe('source.png');
  });
});

describe('flattenLibraryTree', () => {
  it('flattens nested folders into a flat list', () => {
    const tree: LibraryTreeRow[] = [
      {
        kind: 'folder',
        id: 'f1',
        name: 'Root',
        sourceFileName: null,
        origin: null,
        children: [
          {
            kind: 'asset' as const,
            id: 'a1',
            name: 'Asset 1',
            sourceFileName: null,
            texture: texture('a1'),
            node: undefined,
            isInUse: false,
            size: null,
          },
        ],
      },
      {
        kind: 'asset' as const,
        id: 'a2',
        name: 'Asset 2',
        sourceFileName: null,
        texture: texture('a2'),
        node: undefined,
        isInUse: false,
        size: null,
      },
    ];

    const flat = flattenLibraryTree(tree);
    expect(flat).toHaveLength(3);
    expect(flat[0].kind).toBe('folder');
    expect(flat[1].kind).toBe('asset');
    expect(flat[2].kind).toBe('asset');
  });
});
