import {
  DEFAULT_MODULAR_SPRITE_RECIPE,
  type AssetId,
  type ModularSpriteDocument,
  type PartNode,
  type ProjectDocument,
} from "@kukla2d/contracts";

import type {
  ModularSpriteCommitRequest,
  ModularSpriteDraftPart,
  RgbaImageData,
} from "@/features/modular-sprite/index.js";
import { normalizedPixelFrame, slugPartKey } from "@/features/modular-sprite/index.js";
import type {
  GenerateModularSpriteInput,
  GeneratorAsset,
} from "@/features/modular-sprite-generator/application/generateModularSprite.types.js";

interface PackedAsset extends GeneratorAsset {
  x: number;
  y: number;
}

function preferredNode(
  project: ProjectDocument,
  assetId: AssetId,
): PartNode | undefined {
  return project.nodes
    .filter(
      (node): node is PartNode =>
        node.type === "part" && node.textureId === assetId,
    )
    .sort(
      (left, right) =>
        left.draw_order - right.draw_order ||
        left.transform.y - right.transform.y ||
        left.transform.x - right.transform.x,
    )[0];
}

function existingPart(
  project: ProjectDocument,
  assetId: AssetId,
): ModularSpriteDocument["parts"][number] | undefined {
  return project.modularSprites
    .flatMap((sprite) => sprite.parts)
    .find((part) => part.assetId === assetId);
}

function orderedAssets(
  project: ProjectDocument,
  assets: readonly GeneratorAsset[],
): GeneratorAsset[] {
  return [...assets].sort((left, right) => {
    const leftNode = preferredNode(project, left.assetId);
    const rightNode = preferredNode(project, right.assetId);
    if (leftNode && rightNode) {
      return (
        leftNode.transform.y - rightNode.transform.y ||
        leftNode.transform.x - rightNode.transform.x ||
        leftNode.draw_order - rightNode.draw_order
      );
    }
    if (leftNode) return -1;
    if (rightNode) return 1;
    const leftPart = existingPart(project, left.assetId);
    const rightPart = existingPart(project, right.assetId);
    return (leftPart?.order ?? Number.MAX_SAFE_INTEGER) -
      (rightPart?.order ?? Number.MAX_SAFE_INTEGER);
  });
}

function packAssets(
  project: ProjectDocument,
  assets: readonly GeneratorAsset[],
  padding: number,
): { width: number; height: number; assets: PackedAsset[] } {
  const ordered = orderedAssets(project, assets);
  const area = ordered.reduce(
    (sum, asset) =>
      sum + (asset.image.width + padding) * (asset.image.height + padding),
    0,
  );
  const widest = Math.max(...ordered.map((asset) => asset.image.width));
  const targetWidth = Math.max(
    widest + padding * 2,
    Math.ceil(Math.sqrt(area)) + padding * 2,
  );
  const packed: PackedAsset[] = [];
  let x = padding;
  let y = padding;
  let rowHeight = 0;
  let usedWidth = 0;
  for (const asset of ordered) {
    if (x > padding && x + asset.image.width + padding > targetWidth) {
      x = padding;
      y += rowHeight + padding;
      rowHeight = 0;
    }
    packed.push({ ...asset, x, y });
    usedWidth = Math.max(usedWidth, x + asset.image.width + padding);
    rowHeight = Math.max(rowHeight, asset.image.height);
    x += asset.image.width + padding;
  }
  return {
    width: Math.max(1, usedWidth),
    height: Math.max(1, y + rowHeight + padding),
    assets: packed,
  };
}

function composite(
  width: number,
  height: number,
  assets: readonly PackedAsset[],
): RgbaImageData {
  const data = new Uint8ClampedArray(width * height * 4);
  for (const asset of assets) {
    const source = asset.image;
    for (let sourceY = 0; sourceY < source.height; sourceY += 1) {
      const sourceOffset = sourceY * source.width * 4;
      const targetOffset = ((asset.y + sourceY) * width + asset.x) * 4;
      data.set(
        source.data.subarray(sourceOffset, sourceOffset + source.width * 4),
        targetOffset,
      );
    }
  }
  return { width, height, data };
}

function alphaBounds(image: RgbaImageData): {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
} {
  let minX = image.width;
  let minY = image.height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      if (image.data[(y * image.width + x) * 4 + 3] === 0) continue;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }
  return maxX < minX
    ? { minX: 0, minY: 0, maxX: image.width - 1, maxY: image.height - 1 }
    : { minX, minY, maxX, maxY };
}

function componentSeeds(
  asset: PackedAsset,
  sheetWidth: number,
  sheetHeight: number,
) {
  const { image } = asset;
  const visited = new Uint8Array(image.width * image.height);
  const seeds: { x: number; y: number }[] = [];
  const neighbors = [
    [-1, 0],
    [1, 0],
    [0, -1],
    [0, 1],
  ] as const;
  for (let start = 0; start < visited.length; start += 1) {
    if (visited[start] || image.data[start * 4 + 3] === 0) continue;
    const queue = [start];
    visited[start] = 1;
    let cursor = 0;
    let count = 0;
    let sumX = 0;
    let sumY = 0;
    while (cursor < queue.length) {
      const index = queue[cursor++]!;
      const x = index % image.width;
      const y = Math.floor(index / image.width);
      count += 1;
      sumX += x;
      sumY += y;
      for (const [dx, dy] of neighbors) {
        const nextX = x + dx;
        const nextY = y + dy;
        if (
          nextX < 0 ||
          nextY < 0 ||
          nextX >= image.width ||
          nextY >= image.height
        )
          continue;
        const next = nextY * image.width + nextX;
        if (visited[next] || image.data[next * 4 + 3] === 0) continue;
        visited[next] = 1;
        queue.push(next);
      }
    }
    seeds.push({
      x: (asset.x + sumX / count) / sheetWidth,
      y: (asset.y + sumY / count) / sheetHeight,
    });
  }
  return seeds.length > 0
    ? seeds
    : [
        {
          x: (asset.x + image.width / 2) / sheetWidth,
          y: (asset.y + image.height / 2) / sheetHeight,
        },
      ];
}

function uniquePartKey(base: string, used: Set<string>): string {
  let result = base;
  let suffix = 2;
  while (used.has(result)) result = `${base}-${suffix++}`;
  used.add(result);
  return result;
}

export async function generateModularSprite(
  input: GenerateModularSpriteInput,
  ports: { encode(image: RgbaImageData): Promise<Blob> },
): Promise<ModularSpriteCommitRequest> {
  if (input.assets.length === 0)
    throw new Error("Select at least one asset for the modular sprite");
  const existing = input.existingId
    ? input.project.modularSprites.find(
        (sprite) => sprite.id === input.existingId,
      )
    : undefined;
  const ids = new Set<string>();
  for (const asset of input.assets) {
    if (ids.has(asset.assetId))
      throw new Error(`Asset ${asset.assetId} was selected more than once`);
    ids.add(asset.assetId);
    if (
      asset.image.width <= 0 ||
      asset.image.height <= 0 ||
      asset.image.data.length !== asset.image.width * asset.image.height * 4
    )
      throw new Error(`Asset ${asset.assetId} has invalid image data`);
  }

  const padding = Math.max(1, Math.floor(input.padding ?? 8));
  const packed = packAssets(input.project, input.assets, padding);
  const sourceImage = composite(packed.width, packed.height, packed.assets);
  const sourceBlob = await ports.encode(sourceImage);
  const usedKeys = new Set<string>();
  const parts = packed.assets.map((asset, index) => {
    const previous = existingPart(input.project, asset.assetId);
    const texture = input.project.textures.find(
      (candidate) => candidate.id === asset.assetId,
    );
    const node = preferredNode(input.project, asset.assetId);
    const key = uniquePartKey(
      previous?.partKey ?? slugPartKey(texture?.name || `Part ${index + 1}`),
      usedKeys,
    );
    const bounds = alphaBounds(asset.image);
    const draft: ModularSpriteDraftPart = {
      partKey: key,
      assetId: asset.assetId,
      name: previous?.name ?? texture?.name ?? `Part ${index + 1}`,
      role: previous?.role ?? "custom",
      ...(previous?.semanticRoleId
        ? { semanticRoleId: previous.semanticRoleId }
        : {}),
      ...(previous?.qualifiers
        ? { qualifiers: structuredClone(previous.qualifiers) }
        : {}),
      side: previous?.side ?? "none",
      required: previous?.required ?? true,
      order: node?.draw_order ?? previous?.order ?? index,
      extractionFrame: normalizedPixelFrame(
        {
          x: asset.x,
          y: asset.y,
          width: asset.image.width,
          height: asset.image.height,
        },
        packed.width,
        packed.height,
      ),
      contentBounds: {
        x: (asset.x + bounds.minX) / packed.width,
        y: (asset.y + bounds.minY) / packed.height,
        width: (bounds.maxX - bounds.minX + 1) / packed.width,
        height: (bounds.maxY - bounds.minY + 1) / packed.height,
      },
      regionIds: [],
    };
    return {
      draft,
      image: asset.image,
      blob: asset.blob,
      contentBounds: draft.contentBounds,
      componentSeeds: componentSeeds(
        asset,
        packed.width,
        packed.height,
      ),
    };
  });

  return {
    ...(input.existingId ? { existingId: input.existingId } : {}),
    name: input.name.trim() || "Modular Sprite",
    sourceFileName: `${slugPartKey(input.name || "modular-sprite")}.png`,
    sourceImage,
    sourceBlob,
    recipe: structuredClone(DEFAULT_MODULAR_SPRITE_RECIPE),
    parts,
    addToCanvas: !input.existingId,
    ...(existing?.schemaBinding
      ? {
          schemaBinding: {
            ...structuredClone(existing.schemaBinding),
            syncState: "dirty" as const,
          },
        }
      : {}),
  };
}
