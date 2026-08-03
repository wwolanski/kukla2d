import { useCallback, useRef } from 'react';

import type { AssetId, NodeId, PartNode, ProjectDocument, ProjectResourceOwner } from '@kukla2d/contracts';

import { applyHistoricalClipToPartId } from '@/io/psdOrganizer.js';

import { useImportSettingsStore } from '@/store/importSettingsStore';
import type { ProjectStore } from '@/store/project/projectStoreTypes';

import { buildUniqueTextureNameMap, createUniqueName } from '@/domain/libraryAssetNames.js';

import { uid } from '@/lib/uid.js';

import { basename, computeAlphaContours, computeImageBounds } from './imageUtils.js';

import type { CanvasSceneGateway, CanvasTextureCache, MutableRef } from './canvasApplicationTypes.js';

type PartAssetId = NodeId & AssetId;
type ImportedPartNode = Omit<PartNode, 'id'> & { id: PartAssetId };

interface PsdLayer {
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  imageData: ImageData;
  opacity: number;
  visible: boolean;
}

interface CanvasAssetImportArgs {
  projectRef: MutableRef<ProjectDocument>;
  updateProject: ProjectStore['updateProject'];
  centerView: (width: number, height: number) => void;
  sceneGatewayRef: MutableRef<CanvasSceneGateway | null>;
  textureCache: CanvasTextureCache;
  markDirty: () => void;
  resourceOwnerRef: MutableRef<ProjectResourceOwner>;
  notifyError: (title: string, error: unknown) => void;
}

function createPartAssetId(): PartAssetId {
  return uid() as PartAssetId;
}

export function useCanvasAssetImport({
  projectRef,
  updateProject,
  centerView,
  sceneGatewayRef,
  textureCache,
  markDirty,
  resourceOwnerRef,
  notifyError,
}: CanvasAssetImportArgs): {
  importPng: (file: File) => Promise<void>;
  processPsdFile: (file: File, libraryOnly?: boolean) => Promise<void>;
} {
  const imageDataMapRef = useRef<Map<string, ImageData> | null>(null);
  if (!imageDataMapRef.current) imageDataMapRef.current = textureCache.__internal.imageDataByPartId;

  const importPng = useCallback((file: File): Promise<void> => new Promise((resolve, reject) => {
    const autoAddToCanvas = useImportSettingsStore.getState().autoAddToCanvas;
    const shouldCenterAfterImport = autoAddToCanvas && projectRef.current.nodes.length === 0;
    const url = URL.createObjectURL(file);
    resourceOwnerRef.current?.track(url);
    const image = new Image();
    image.onload = () => {
      const partId = createPartAssetId();
      const canvas = document.createElement('canvas');
      canvas.width = image.width;
      canvas.height = image.height;
      const context = canvas.getContext('2d');
      if (!context) {
        reject(new Error('Failed to create 2D context for PNG import'));
        return;
      }
      context.drawImage(image, 0, 0);
      const imageData = context.getImageData(0, 0, image.width, image.height);
      imageDataMapRef.current?.set(partId, imageData);
      const imageBounds = computeImageBounds(imageData);
      const alphaContours = computeAlphaContours(imageData);
      updateProject((projectDraft, versionControl) => {
        const displayName = createUniqueName(
          basename(file.name),
          buildUniqueTextureNameMap(projectDraft.textures, projectDraft.nodes).values(),
        );
        if (autoAddToCanvas && projectDraft.nodes.length === 0) {
          projectDraft.canvas.width = image.width;
          projectDraft.canvas.height = image.height;
          projectDraft.canvas.presetId = 'custom';
          projectDraft.canvas.fitSource = null;
        }
        projectDraft.textures.push({ id: partId, source: url, name: displayName, fileName: file.name, fileSize: file.size });
        if (!projectDraft.assetPlacements) projectDraft.assetPlacements = [];
        projectDraft.assetPlacements.push({ assetId: partId, folderId: null });
        if (autoAddToCanvas) {
          projectDraft.nodes.push({
            id: partId, type: 'part', name: displayName, parent: null,
            draw_order: projectDraft.nodes.filter(node => node.type === 'part').length,
            opacity: 1, visible: true, clip_mask: null,
            transform: { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1, pivotX: image.width / 2, pivotY: image.height / 2 },
            meshOpts: null, mesh: null, imageWidth: image.width, imageHeight: image.height,
            imageBounds: imageBounds || { minX: 0, minY: 0, maxX: image.width, maxY: image.height },
            alphaContours,
          });
        }
        versionControl.textureVersion++;
      });
      if (shouldCenterAfterImport) centerView(image.width, image.height);
      const gateway = sceneGatewayRef.current;
      if (autoAddToCanvas && gateway) {
        gateway.uploadTexture(partId, image);
        gateway.uploadQuadFallback(partId, image.width, image.height);
        markDirty();
      }
      resolve();
    };
    image.onerror = () => reject(new Error(`Failed to decode image: ${file.name}`));
    image.src = url;
  }), [centerView, markDirty, projectRef, resourceOwnerRef, sceneGatewayRef, updateProject]);

  const finalizePsdImport = useCallback((
    width: number,
    height: number,
    layers: PsdLayer[],
    partIds: PartAssetId[],
    fileName: string,
    libraryOnly = false,
  ) => {
    const autoAddToCanvas = !libraryOnly && useImportSettingsStore.getState().autoAddToCanvas;
    updateProject((projectDraft, versionControl) => {
      if (autoAddToCanvas) {
        projectDraft.canvas.width = width;
        projectDraft.canvas.height = height;
        projectDraft.canvas.presetId = 'custom';
        projectDraft.canvas.fitSource = null;
      }
      const folderId = fileName ? uid() : null;
      if (folderId) {
        if (!projectDraft.libraryFolders) projectDraft.libraryFolders = [];
        projectDraft.libraryFolders.push({ id: folderId, name: fileName.replace(/\.[^.]+$/, ''), parentId: null, sourceFileName: fileName, origin: 'import' });
      }
      if (!projectDraft.assetPlacements) projectDraft.assetPlacements = [];
      const reservedNames = [...buildUniqueTextureNameMap(projectDraft.textures, projectDraft.nodes).values()];
      const layerDisplayNames = layers.map(layer => {
        const name = createUniqueName(layer.name, reservedNames);
        reservedNames.push(name);
        return name;
      });
      const sourceFileNames = new Map(partIds.map((partId, index) => [
        partId,
        `${layers[index]?.name || partId}.png`,
      ]));
      const nodes: ImportedPartNode[] = layers.map((layer, index) => {
        const partId = partIds[index];
        if (!partId) throw new Error(`Missing generated part id for PSD layer ${index}`);
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext('2d');
        const layerCanvas = document.createElement('canvas');
        layerCanvas.width = layer.width;
        layerCanvas.height = layer.height;
        const layerContext = layerCanvas.getContext('2d');
        if (!context || !layerContext) throw new Error('Failed to create 2D context for PSD import');
        layerContext.putImageData(layer.imageData, 0, 0);
        context.drawImage(layerCanvas, layer.x, layer.y);
        const imageData = context.getImageData(0, 0, width, height);
        imageDataMapRef.current?.set(partId, imageData);
        const imageBounds = computeImageBounds(imageData);
        const alphaContours = computeAlphaContours(imageData);
        canvas.toBlob((blob) => {
          if (!blob) return;
          const url = URL.createObjectURL(blob);
          resourceOwnerRef.current?.track(url);
          updateProject(project => {
            const texture = project.textures.find(candidate => candidate.id === partId);
            if (texture) { texture.source = url; texture.fileSize = blob.size; }
          });
          const image = new Image();
          image.onload = () => {
            const gateway = autoAddToCanvas ? sceneGatewayRef.current : null;
            if (!gateway) return;
            gateway.uploadTexture(partId, image);
            gateway.uploadQuadFallback(partId, width, height);
            markDirty();
          };
          image.src = url;
        }, 'image/png');
        return {
          id: partId, type: 'part', name: layerDisplayNames[index] ?? layer.name, parent: null, draw_order: layers.length - 1 - index,
          opacity: layer.opacity, visible: layer.visible, clip_mask: null,
          transform: { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1, pivotX: width / 2, pivotY: height / 2 },
          meshOpts: null, mesh: null, imageWidth: width, imageHeight: height,
          imageBounds: imageBounds || { minX: 0, minY: 0, maxX: width, maxY: height }, alphaContours,
        };
      });
      for (const node of applyHistoricalClipToPartId(nodes)) {
        projectDraft.textures.push({
          id: node.id,
          source: '',
          name: node.name || node.id,
          fileName: sourceFileNames.get(node.id) ?? `${node.name || node.id}.png`,
          fileSize: null,
        });
        projectDraft.assetPlacements.push({ assetId: node.id, folderId });
        if (autoAddToCanvas) projectDraft.nodes.push(node);
      }
      versionControl.textureVersion++;
    });
    if (autoAddToCanvas) centerView(width, height);
  }, [centerView, markDirty, resourceOwnerRef, sceneGatewayRef, updateProject]);

  const processPsdFile = useCallback(async (file: File, libraryOnly = false): Promise<void> => {
    try {
      const { importPsd } = await import('@/io/psd');
      const parsed = await importPsd(await file.arrayBuffer());
      if (parsed.layers.length > 0) {
        finalizePsdImport(
          parsed.width,
          parsed.height,
          parsed.layers,
          parsed.layers.map(createPartAssetId),
          file.name,
          libraryOnly,
        );
      }
    } catch (error) {
      console.error('[PSD Import]', error);
      notifyError('PSD import failed', error);
    }
  }, [finalizePsdImport, notifyError]);

  return { importPng, processPsdFile };
}
