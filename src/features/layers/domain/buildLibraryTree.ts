import type {
  AssetPlacement,
  LibraryFolder,
  ModularSpriteDocument,
  Node,
  Texture,
} from '@kukla2d/contracts';

import { buildUniqueTextureNameMap } from '@/domain/libraryAssetNames';

export interface LibraryTreeInput {
  libraryFolders?: readonly LibraryFolder[];
  assetPlacements?: readonly AssetPlacement[];
  textures: readonly Texture[];
  nodes: readonly Node[];
  modularSprites?: readonly ModularSpriteDocument[];
}

interface LibraryFolderRow {
  kind: 'folder';
  id: string;
  name: string;
  sourceFileName: string | null;
  origin: LibraryFolder['origin'] | null;
  children: LibraryTreeRow[];
}

interface LibraryAssetRow {
  kind: 'asset';
  id: string;
  name: string;
  sourceFileName: string | null;
  texture: Texture;
  node: Node | undefined;
  isInUse: boolean;
  size: number | null | undefined;
  modularSpriteId: string | null;
  modularKind: 'source' | 'part' | null;
  partKey: string | null;
}

export type LibraryTreeRow = LibraryFolderRow | LibraryAssetRow;

type FolderEntry = { kind: 'folder'; folder: LibraryFolder };

export function buildLibraryTree({
  libraryFolders,
  assetPlacements,
  textures,
  nodes,
  modularSprites,
}: LibraryTreeInput): LibraryTreeRow[] {
  const folders = libraryFolders ?? [];
  const placements = assetPlacements ?? [];
  const texMap = new Map<string, Texture>(textures.map(t => [t.id, t]));
  const nodeMap = new Map<string, Node>(nodes.map(n => [n.id, n]));
  const displayNames = buildUniqueTextureNameMap(textures, nodes);
  const modularByAssetId = new Map<string, { id: string; kind: 'source' | 'part'; partKey: string | null }>();
  for (const modularSprite of modularSprites ?? []) {
    modularByAssetId.set(modularSprite.sourceAssetId, { id: modularSprite.id, kind: 'source', partKey: null });
    for (const part of modularSprite.parts) {
      modularByAssetId.set(part.assetId, { id: modularSprite.id, kind: 'part', partKey: part.partKey });
    }
  }
  const childrenByParent = new Map<string | null, FolderEntry[]>();

  for (const folder of folders) {
    const pid = folder.parentId ?? null;
    const entries = childrenByParent.get(pid) ?? [];
    entries.push({ kind: 'folder', folder });
    childrenByParent.set(pid, entries);
  }

  const assetsByFolder = new Map<string | null, string[]>();
  for (const placement of placements) {
    const fid = placement.folderId ?? null;
    const assetIds = assetsByFolder.get(fid) ?? [];
    assetIds.push(placement.assetId);
    assetsByFolder.set(fid, assetIds);
  }

  const assetIdsInFolder = new Set(placements.map(p => p.assetId));

  function buildChildren(parentId: string | null): LibraryTreeRow[] {
    const result: LibraryTreeRow[] = [];
    const foldersHere = childrenByParent.get(parentId) ?? [];
    for (const { folder } of foldersHere) {
      result.push({
        kind: 'folder',
        id: folder.id,
        name: folder.name,
        sourceFileName: folder.sourceFileName ?? null,
        origin: folder.origin ?? null,
        children: buildChildren(folder.id),
      });
    }
    const assetsHere = assetsByFolder.get(parentId) ?? [];
    for (const assetId of assetsHere) {
      const tex = texMap.get(assetId);
      const node = nodeMap.get(assetId);
      if (!tex) continue;
      const localName = displayNames.get(assetId) ?? assetId;
      const sourceName = tex.fileName ?? null;
      const modular = modularByAssetId.get(assetId);
      result.push({
        kind: 'asset',
        id: assetId,
        name: localName,
        sourceFileName: sourceName,
        texture: tex,
        node,
        isInUse: nodes.some(candidate => candidate.type === 'part'
          && (String(candidate.id) === assetId || candidate.textureId === assetId)),
        size: tex.fileSize,
        modularSpriteId: modular?.id ?? null,
        modularKind: modular?.kind ?? null,
        partKey: modular?.partKey ?? null,
      });
    }
    return result;
  }

  const rootFolders = buildChildren(null);

  const looseAssets: LibraryAssetRow[] = [];
  for (const tex of textures) {
    if (assetIdsInFolder.has(tex.id)) continue;
    const node = nodeMap.get(tex.id);
    const localName = displayNames.get(tex.id) ?? tex.id;
    const sourceName = tex.fileName ?? null;
    const modular = modularByAssetId.get(tex.id);
    looseAssets.push({
      kind: 'asset',
      id: tex.id,
      name: localName,
      sourceFileName: sourceName,
      texture: tex,
      node,
      isInUse: nodes.some(candidate => candidate.type === 'part'
          && (String(candidate.id) === String(tex.id) || candidate.textureId === tex.id)),
      size: tex.fileSize,
      modularSpriteId: modular?.id ?? null,
      modularKind: modular?.kind ?? null,
      partKey: modular?.partKey ?? null,
    });
  }

  return [...rootFolders, ...looseAssets];
}

export function flattenLibraryTree(rows: readonly LibraryTreeRow[]): LibraryTreeRow[] {
  const result: LibraryTreeRow[] = [];
  for (const row of rows) {
    result.push(row);
    if (row.kind === 'folder') {
      result.push(...flattenLibraryTree(row.children));
    }
  }
  return result;
}
