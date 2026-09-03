import { useCallback } from 'react';

import {
  toAssetId,
  toModularSpriteId,
  toNodeId,
} from '@kukla2d/contracts';
import type { ProjectDocument, ProjectResourceOwner } from '@kukla2d/contracts';

import { createProjectResourceOwner } from '@/platform/projectResourceOwner';

import { useEditorStore } from '@/store/editorStore';
import type { ProjectStore } from '@/store/project/projectStoreTypes';
import { useProjectStore } from '@/store/projectStore';

import type {
  ModularSpriteCommitRequest,
  ModularSpriteCommitResult,
  RgbaImageData,
} from '@/features/modular-sprite';
import { imageToCanvas } from '@/features/modular-sprite';

import { uid } from '@/lib/uid';

import { computeAlphaContours, computeImageBounds } from './imageUtils.js';

import type {
  CanvasSceneGateway,
  CanvasTextureCache,
  MutableRef,
} from './canvasApplicationTypes.js';

interface UseModularSpriteImportArgs {
  projectRef: MutableRef<ProjectDocument>;
  updateProject: ProjectStore['updateProject'];
  centerView: (width: number, height: number) => void;
  sceneGatewayRef: MutableRef<CanvasSceneGateway | null>;
  textureCache: CanvasTextureCache;
  markDirty: () => void;
  resourceOwnerRef: MutableRef<ProjectResourceOwner>;
}

function pngFileName(value: string): string {
  const base = value.replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '');
  return `${base || 'modular-sprite'}.png`;
}

function toImageData(image: RgbaImageData): ImageData {
  return new ImageData(new Uint8ClampedArray(image.data), image.width, image.height);
}

export function useModularSpriteImport({
  projectRef,
  updateProject,
  centerView,
  sceneGatewayRef,
  textureCache,
  markDirty,
  resourceOwnerRef,
}: UseModularSpriteImportArgs): (request: ModularSpriteCommitRequest) => Promise<ModularSpriteCommitResult> {
  return useCallback((request: ModularSpriteCommitRequest): Promise<ModularSpriteCommitResult> => {
    const currentProject = projectRef.current;
    const existing = request.existingId
      ? currentProject.modularSprites.find(candidate => candidate.id === request.existingId)
      : undefined;
    if (request.existingId && !existing) throw new Error('The modular sprite no longer exists in this project');
    if (request.parts.length === 0) throw new Error('Assign at least one modular sprite part');

    const oldPartsByKey = new Map(existing?.parts.map(part => [part.partKey, part]) ?? []);
    const modularSpriteId = existing?.id ?? toModularSpriteId(uid());
    const sourceAssetId = existing?.sourceAssetId ?? toAssetId(uid());
    const partAssetIds = new Map(request.parts.map(part => [
      part.draft.partKey,
      oldPartsByKey.get(part.draft.partKey)?.assetId ?? toAssetId(uid()),
    ]));

    if (existing) {
      for (const part of request.parts) {
        const oldPart = oldPartsByKey.get(part.draft.partKey);
        if (!oldPart) continue;
        const expectedWidth = Math.ceil((oldPart.extractionFrame.x + oldPart.extractionFrame.width) * existing.source.width)
          - Math.floor(oldPart.extractionFrame.x * existing.source.width);
        const expectedHeight = Math.ceil((oldPart.extractionFrame.y + oldPart.extractionFrame.height) * existing.source.height)
          - Math.floor(oldPart.extractionFrame.y * existing.source.height);
        if (part.image.width !== expectedWidth || part.image.height !== expectedHeight) {
          throw new Error(`Part "${part.draft.name}" changed its stable extraction frame; save it as a new modular sprite`);
        }
      }
    }

    const stagedResources = createProjectResourceOwner();
    const sourceUrl = URL.createObjectURL(request.sourceBlob);
    stagedResources.track(sourceUrl);
    const partUrls = new Map<string, string>();
    for (const part of request.parts) {
      const url = URL.createObjectURL(part.blob);
      stagedResources.track(url);
      partUrls.set(part.draft.partKey, url);
    }

    const wasEmpty = currentProject.nodes.length === 0;
    const folderId = currentProject.assetPlacements.find(placement => placement.assetId === sourceAssetId)?.folderId
      ?? uid();
    const createdNodeIds: string[] = [];
    let layoutGroupId: ReturnType<typeof toNodeId> | null = null;
    const imageDataByKey = new Map(request.parts.map(part => [part.draft.partKey, toImageData(part.image)]));

    try {
      updateProject((projectDraft, versionControl) => {
        const sourceTexture = projectDraft.textures.find(texture => texture.id === sourceAssetId);
        if (sourceTexture) {
          sourceTexture.source = sourceUrl;
          sourceTexture.name = `${request.name} Source`;
          sourceTexture.fileName = pngFileName(request.sourceFileName);
          sourceTexture.fileSize = request.sourceBlob.size;
        } else {
          projectDraft.textures.push({
            id: sourceAssetId,
            source: sourceUrl,
            name: `${request.name} Source`,
            fileName: pngFileName(request.sourceFileName),
            fileSize: request.sourceBlob.size,
          });
        }

        if (!projectDraft.libraryFolders.some(folder => folder.id === folderId)) {
          projectDraft.libraryFolders.push({
            id: folderId,
            name: request.name,
            parentId: null,
            sourceFileName: request.sourceFileName,
            origin: 'import',
          });
        }
        const ensurePlacement = (assetId: string): void => {
          const placement = projectDraft.assetPlacements.find(candidate => candidate.assetId === assetId);
          if (placement) placement.folderId = folderId;
          else projectDraft.assetPlacements.push({ assetId, folderId });
        };
        ensurePlacement(sourceAssetId);

        for (const part of request.parts) {
          const assetId = partAssetIds.get(part.draft.partKey)!;
          const url = partUrls.get(part.draft.partKey)!;
          const texture = projectDraft.textures.find(candidate => candidate.id === assetId);
          if (texture) {
            texture.source = url;
            texture.name = part.draft.name;
            texture.fileName = pngFileName(part.draft.partKey);
            texture.fileSize = part.blob.size;
          } else {
            projectDraft.textures.push({
              id: assetId,
              source: url,
              name: part.draft.name,
              fileName: pngFileName(part.draft.partKey),
              fileSize: part.blob.size,
            });
          }
          ensurePlacement(assetId);
        }

        const nextDocument = {
          id: modularSpriteId,
          schemaVersion: 1 as const,
          name: request.name,
          sourceAssetId,
          source: { width: request.sourceImage.width, height: request.sourceImage.height },
          processorVersion: 1 as const,
          recipe: structuredClone(request.recipe),
          parts: request.parts.map(part => ({
            partKey: part.draft.partKey,
            assetId: partAssetIds.get(part.draft.partKey)!,
            name: part.draft.name,
            role: part.draft.role,
            side: part.draft.side,
            required: part.draft.required,
            order: part.draft.order,
            extractionFrame: structuredClone(part.draft.extractionFrame),
            contentBounds: structuredClone(part.contentBounds),
            componentSeeds: structuredClone(part.componentSeeds),
          })),
        };
        const existingIndex = projectDraft.modularSprites.findIndex(candidate => candidate.id === modularSpriteId);
        if (existingIndex >= 0) projectDraft.modularSprites[existingIndex] = nextDocument;
        else projectDraft.modularSprites.push(nextDocument);

        if (!existing && request.addToCanvas) {
          if (wasEmpty) {
            projectDraft.canvas.width = request.sourceImage.width;
            projectDraft.canvas.height = request.sourceImage.height;
            projectDraft.canvas.presetId = 'custom';
            projectDraft.canvas.fitSource = null;
          }
          const groupX = projectDraft.canvas.x + (projectDraft.canvas.width - request.sourceImage.width) / 2;
          const groupY = projectDraft.canvas.y + (projectDraft.canvas.height - request.sourceImage.height) / 2;
          const newGroupId = toNodeId(uid());
          layoutGroupId = newGroupId;
          createdNodeIds.push(newGroupId);
          projectDraft.nodes.push({
            id: newGroupId,
            type: 'group',
            name: request.name,
            parent: null,
            opacity: 1,
            visible: true,
            transform: { x: groupX, y: groupY, rotation: 0, scaleX: 1, scaleY: 1, pivotX: 0, pivotY: 0 },
          });
          const baseDrawOrder = Math.max(-1, ...projectDraft.nodes
            .filter(node => node.type === 'part')
            .map(node => node.draw_order)) + 1;
          for (const part of [...request.parts].sort((left, right) => left.draft.order - right.draft.order)) {
            const nodeId = toNodeId(uid());
            createdNodeIds.push(nodeId);
            const frameX = Math.floor(part.draft.extractionFrame.x * request.sourceImage.width);
            const frameY = Math.floor(part.draft.extractionFrame.y * request.sourceImage.height);
            const imageData = imageDataByKey.get(part.draft.partKey)!;
            projectDraft.nodes.push({
              id: nodeId,
              type: 'part',
              name: part.draft.name,
              parent: newGroupId,
              textureId: partAssetIds.get(part.draft.partKey)!,
              draw_order: baseDrawOrder + part.draft.order,
              opacity: 1,
              visible: true,
              clip_mask: null,
              transform: {
                x: frameX,
                y: frameY,
                rotation: 0,
                scaleX: 1,
                scaleY: 1,
                pivotX: part.image.width / 2,
                pivotY: part.image.height / 2,
              },
              meshOpts: null,
              mesh: null,
              imageWidth: part.image.width,
              imageHeight: part.image.height,
              imageBounds: computeImageBounds(imageData) ?? { minX: 0, minY: 0, maxX: part.image.width, maxY: part.image.height },
              alphaContours: computeAlphaContours(imageData),
            });
          }
        }

        for (const part of request.parts) {
          const assetId = partAssetIds.get(part.draft.partKey)!;
          const imageData = imageDataByKey.get(part.draft.partKey)!;
          for (const node of projectDraft.nodes) {
            if (node.type !== 'part' || node.textureId !== assetId) continue;
            node.imageWidth = part.image.width;
            node.imageHeight = part.image.height;
            node.imageBounds = computeImageBounds(imageData) ?? { minX: 0, minY: 0, maxX: part.image.width, maxY: part.image.height };
            node.alphaContours = computeAlphaContours(imageData);
          }
        }
        versionControl.textureVersion += 1;
        versionControl.geometryVersion += 1;
        if (createdNodeIds.length > 0) versionControl.transformVersion += 1;
      });
    } catch (error) {
      stagedResources.dispose();
      throw error;
    }

    for (const url of stagedResources.transferOut()) resourceOwnerRef.current.track(url);
    const gateway = sceneGatewayRef.current;
    for (const part of request.parts) {
      const assetId = partAssetIds.get(part.draft.partKey)!;
      const imageData = imageDataByKey.get(part.draft.partKey)!;
      textureCache.__internal.imageDataByPartId.set(assetId, imageData);
      const canvas = imageToCanvas(part.image);
      const referencingNodes = useProjectStore.getState().project.nodes
        .filter(node => node.type === 'part' && node.textureId === assetId);
      for (const node of referencingNodes) {
        textureCache.__internal.imageDataByPartId.set(node.id, imageData);
        gateway?.uploadTexture(node.id, canvas);
        if (node.type === 'part' && !node.mesh) {
          gateway?.uploadQuadFallback(node.id, part.image.width, part.image.height);
        }
      }
    }
    if (layoutGroupId) useEditorStore.getState().setSelection([layoutGroupId]);
    if (wasEmpty && request.addToCanvas) centerView(request.sourceImage.width, request.sourceImage.height);
    markDirty();
    return Promise.resolve({
      modularSpriteId,
      createdAssetIds: [sourceAssetId, ...partAssetIds.values()],
      createdNodeIds,
    });
  }, [centerView, markDirty, projectRef, resourceOwnerRef, sceneGatewayRef, textureCache, updateProject]);
}
