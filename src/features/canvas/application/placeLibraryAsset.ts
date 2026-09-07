import type {
  AssetId,
  NodeId,
  PartNode,
  ProjectDocument,
  Texture,
} from "@kukla2d/contracts";

import { useEditorStore } from "@/store/editorStore";
import type { ProjectStore } from "@/store/project/projectStoreTypes.types.js";

import {
  buildUniqueTextureNameMap,
  createUniqueName,
} from "@/domain/libraryAssetNames.js";

import { clientToCanvasSpace } from "@/features/canvas/domain/coordinates.js";

import { uid } from "@/lib/uid.js";

import { computeAlphaContours, computeImageBounds } from "./imageUtils.js";

import type {
  CanvasEditorSnapshot,
  CanvasSceneGateway,
  CanvasTextureCache,
  MutableRef,
} from "./canvasApplication.types.js";
import type { CanvasDropEvent } from "./handleCanvasDrop.types.js";

type PlacedFields = "id" | "parent" | "textureId" | "draw_order";
type PlaceablePartNode = Omit<PartNode, PlacedFields> &
  Partial<Pick<PartNode, PlacedFields>>;
type CachedImage = ImageData | HTMLImageElement;

interface PlaceLibraryAssetArgs {
  assetId: AssetId | string;
  event: CanvasDropEvent;
  projectRef: MutableRef<ProjectDocument>;
  canvasRef: MutableRef<HTMLCanvasElement | null>;
  editorRef: MutableRef<CanvasEditorSnapshot>;
  updateProject: ProjectStore["updateProject"];
  markDirty?: () => void;
  sceneGatewayRef?: MutableRef<CanvasSceneGateway | null>;
  textureCache?: CanvasTextureCache;
}

export function placeLibraryAsset({
  assetId,
  event,
  projectRef,
  canvasRef,
  editorRef,
  updateProject,
  markDirty,
  sceneGatewayRef,
  textureCache,
}: PlaceLibraryAssetArgs): Promise<boolean> {
  const sourceNode = projectRef.current.nodes.find(
    (node): node is PartNode =>
      node.type === "part" &&
      (node.id === assetId || node.textureId === assetId),
  );
  const sourceTexture = projectRef.current.textures.find(
    (texture) => texture.id === assetId,
  );
  const sourceDisplayName = buildUniqueTextureNameMap(
    projectRef.current.textures,
    projectRef.current.nodes,
  ).get(assetId);
  const canvas = canvasRef.current;
  if (!sourceTexture || !canvas) return Promise.resolve(false);

  const [x, y] = clientToCanvasSpace(
    canvas,
    event.clientX,
    event.clientY,
    editorRef.current.view,
  );
  const addNode = (
    node: PlaceablePartNode,
    image: HTMLImageElement | null = null,
  ): boolean => {
    const newId = uid() as NodeId;
    const placedNode: PartNode = {
      ...node,
      id: newId,
      name: createUniqueName(
        node.name || sourceDisplayName || "Library asset",
        projectRef.current.nodes.map((candidate) => candidate.name),
      ),
      parent: null,
      textureId: assetId,
      draw_order:
        Math.max(
          -1,
          ...projectRef.current.nodes
            .filter((candidate) => candidate.type === "part")
            .map((candidate) => candidate.draw_order ?? -1),
        ) + 1,
      transform: { ...node.transform, x, y },
    };
    updateProject((projectDraft) => {
      projectDraft.nodes.push(placedNode);
    });
    primeGpuPart({
      gateway: sceneGatewayRef?.current,
      textureCache,
      sourceTexture,
      sourceId: assetId,
      partId: newId,
      node: placedNode,
      image,
    });
    useEditorStore.getState().setSelection([newId]);
    markDirty?.();
    return true;
  };

  if (sourceNode)
    return Promise.resolve(
      addNode({
        ...structuredClone(sourceNode),
        name: `${sourceNode.name} Copy`,
      }),
    );

  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => {
      const sourceImageData =
        textureCache?.__internal.imageDataByPartId.get(assetId) ??
        readImageData(image);
      if (sourceImageData)
        textureCache?.__internal.imageDataByPartId.set(
          assetId,
          sourceImageData,
        );
      resolve(
        addNode(
          {
            type: "part",
            name:
              sourceDisplayName ??
              sourceTexture.fileName?.replace(/\.[^.]+$/, "") ??
              "Library asset",
            opacity: 1,
            visible: true,
            clip_mask: null,
            transform: {
              x: 0,
              y: 0,
              rotation: 0,
              scaleX: 1,
              scaleY: 1,
              pivotX: image.width / 2,
              pivotY: image.height / 2,
            },
            meshOpts: null,
            mesh: null,
            imageWidth: image.width,
            imageHeight: image.height,
            imageBounds: sourceImageData
              ? (computeImageBounds(sourceImageData) ?? {
                  minX: 0,
                  minY: 0,
                  maxX: image.width,
                  maxY: image.height,
                })
              : { minX: 0, minY: 0, maxX: image.width, maxY: image.height },
            alphaContours: sourceImageData
              ? computeAlphaContours(sourceImageData)
              : [],
          },
          image,
        ),
      );
    };
    image.onerror = () => resolve(false);
    image.src = sourceTexture.source;
  });
}

interface PrimeGpuPartArgs {
  gateway: CanvasSceneGateway | null | undefined;
  textureCache: CanvasTextureCache | undefined;
  sourceTexture: Texture;
  sourceId: string;
  partId: string;
  node: PartNode;
  image: HTMLImageElement | null;
}

function primeGpuPart({
  gateway,
  textureCache,
  sourceTexture,
  sourceId,
  partId,
  node,
  image,
}: PrimeGpuPartArgs): void {
  const imageDataByPartId = textureCache?.__internal.imageDataByPartId;
  const sourceImageData =
    imageDataByPartId?.get(sourceId) ?? (image ? readImageData(image) : null);
  if (sourceImageData) imageDataByPartId?.set(partId, sourceImageData);

  if (!gateway) return;
  const cachedImage = image ?? sourceImageData;
  if (!cachedImage) return;

  gateway.uploadTexture(partId, toCanvasSource(cachedImage));
  if (node.mesh) gateway.uploadMesh(partId, node.mesh);
  else if (node.imageWidth && node.imageHeight)
    gateway.uploadQuadFallback(partId, node.imageWidth, node.imageHeight);

  textureCache?.__internal.lastUploadedSources.set(
    partId,
    sourceTexture.source,
  );
}

function readImageData(image: HTMLImageElement): ImageData | null {
  try {
    const canvas = document.createElement("canvas");
    canvas.width = image.naturalWidth || image.width;
    canvas.height = image.naturalHeight || image.height;
    const context = canvas.getContext("2d");
    if (!context || canvas.width <= 0 || canvas.height <= 0) return null;
    context.drawImage(image, 0, 0);
    return context.getImageData(0, 0, canvas.width, canvas.height);
  } catch {
    return null;
  }
}

function isImageData(image: CachedImage): image is ImageData {
  return "data" in image && image.data instanceof Uint8ClampedArray;
}

function toCanvasSource(
  image: CachedImage,
): HTMLImageElement | HTMLCanvasElement {
  if (isImageData(image)) {
    const canvas = document.createElement("canvas");
    canvas.width = image.width;
    canvas.height = image.height;
    const context = canvas.getContext("2d");
    if (!context)
      throw new Error("Failed to create 2D context for cached library asset");
    context.putImageData(image, 0, 0);
    return canvas;
  }
  return image;
}
