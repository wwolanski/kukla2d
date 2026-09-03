import type { ProjectDocument } from '@kukla2d/contracts';

import { deletePartNodes } from '@/domain/deleteCommands.js';

export function removeLibraryAssets(projectDraft: ProjectDocument, assetIds: ReadonlySet<string>): void {
  if (assetIds.size === 0) return;
  const expandedAssetIds = new Set(assetIds);
  projectDraft.modularSprites = projectDraft.modularSprites.flatMap(modularSprite => {
    if (expandedAssetIds.has(modularSprite.sourceAssetId)) {
      expandedAssetIds.add(modularSprite.sourceAssetId);
      for (const part of modularSprite.parts) expandedAssetIds.add(part.assetId);
      return [];
    }
    return [{
      ...modularSprite,
      parts: modularSprite.parts.filter(part => !expandedAssetIds.has(part.assetId)),
    }];
  });

  const nodeIds = projectDraft.nodes
    .filter(node => expandedAssetIds.has(node.id)
      || (node.type === 'part' && node.textureId && expandedAssetIds.has(node.textureId)))
    .map(node => node.id);
  deletePartNodes(projectDraft, nodeIds);

  projectDraft.textures = projectDraft.textures.filter(texture => !expandedAssetIds.has(texture.id));
  projectDraft.assetPlacements = (projectDraft.assetPlacements ?? [])
    .filter(placement => !expandedAssetIds.has(placement.assetId));

  const attachmentIds = new Set(
    (projectDraft.attachments ?? [])
      .filter(attachment => attachment.assetId && expandedAssetIds.has(attachment.assetId))
      .map(attachment => attachment.id),
  );
  projectDraft.attachments = (projectDraft.attachments ?? [])
    .filter(attachment => !attachmentIds.has(attachment.id));
  projectDraft.skins = (projectDraft.skins ?? []).map(skin => ({
    ...skin,
    entries: skin.entries.filter(entry => !attachmentIds.has(entry.attachmentId)),
  }));
  for (const slot of projectDraft.slots ?? []) {
    if (slot.setupAttachmentId && attachmentIds.has(slot.setupAttachmentId)) slot.setupAttachmentId = null;
  }
}

