import { describe, expect, it } from "vitest";

import type { ModularSpriteCommitRequest } from "@/features/modular-sprite";
import {
  normalizedPixelFrame,
  pixelRect,
} from "@/features/modular-sprite";
import { generateModularSprite } from "@/features/modular-sprite-generator/application/generateModularSprite.js";
import { createEmptyProject } from "@/core/createEmptyProject";

const pixel = (width: number, height: number) => ({
  width,
  height,
  data: new Uint8ClampedArray(width * height * 4).fill(255),
});

function expectedStableSize(
  frame: { x: number; y: number; width: number; height: number },
  source: { width: number; height: number },
) {
  return {
    width:
      Math.ceil((frame.x + frame.width) * source.width) -
      Math.floor(frame.x * source.width),
    height:
      Math.ceil((frame.y + frame.height) * source.height) -
      Math.floor(frame.y * source.height),
  };
}

function applyGeneratedPackage(
  project: ReturnType<typeof createEmptyProject>,
  request: ModularSpriteCommitRequest,
): void {
  const existing = project.modularSprites[0];
  if (!existing) throw new Error("The test package is missing");

  for (const part of request.parts) {
    const oldPart = existing.parts.find(
      (candidate) => candidate.assetId === part.draft.assetId,
    );
    if (!oldPart) continue;
    expect(
      expectedStableSize(
        JSON.parse(JSON.stringify(oldPart.extractionFrame)),
        existing.source,
      ),
    ).toEqual({ width: part.image.width, height: part.image.height });
  }

  existing.source = {
    width: request.sourceImage.width,
    height: request.sourceImage.height,
  };
  existing.parts = request.parts.map((part) => ({
    partKey: part.draft.partKey,
    assetId: part.draft.assetId!,
    name: part.draft.name,
    role: part.draft.role,
    side: part.draft.side,
    required: part.draft.required,
    order: part.draft.order,
    extractionFrame: JSON.parse(
      JSON.stringify(part.draft.extractionFrame),
    ),
    contentBounds: part.contentBounds,
    componentSeeds: part.componentSeeds,
  }));
  for (const part of request.parts) {
    if (
      !project.textures.some(
        (texture) => texture.id === part.draft.assetId,
      )
    ) {
      project.textures.push({
        id: part.draft.assetId!,
        source: `blob:${part.draft.partKey}`,
        name: part.draft.name,
      });
    }
  }
}

describe("modular sprite generator regeneration", () => {
  it("keeps package part dimensions stable across two successive PNG additions", async () => {
    const project = createEmptyProject();
    project.textures.push({ id: "head", source: "blob:head", name: "Head" });
    project.modularSprites.push({
      id: "sprite-1",
      schemaVersion: 1,
      name: "Hero",
      sourceAssetId: "source",
      source: { width: 21, height: 21 },
      processorVersion: 1,
      recipe: structuredClone(requestRecipe()),
      parts: [
        {
          partKey: "head",
          assetId: "head",
          name: "Head",
          role: "head",
          side: "center",
          required: true,
          order: 0,
          extractionFrame: { x: 8 / 21, y: 8 / 21, width: 5 / 21, height: 5 / 21 },
          contentBounds: { x: 8 / 21, y: 8 / 21, width: 5 / 21, height: 5 / 21 },
          componentSeeds: [{ x: 0.5, y: 0.5 }],
        },
      ],
      schemaBinding: {
        schemaId: "managed-schema",
        schemaRevision: 2,
        compositionId: "managed-composition",
        relationship: "managed",
        syncState: "current",
        slotToPartKey: { head: "head" },
        snapshot: {
          formatVersion: 1,
          schemaId: "managed-schema",
          revision: 2,
          compositionId: "managed-composition",
          name: "Hero schema",
          slots: [],
        },
      },
    });

    const encode = async () => new Blob(["sheet"], { type: "image/png" });
    const firstRequest = await generateModularSprite(
      {
        project,
        name: "Hero",
        existingId: "sprite-1",
        assets: [
          { assetId: "head", image: pixel(5, 5), blob: new Blob(["head"]) },
          { assetId: "shirt", image: pixel(5, 33), blob: new Blob(["shirt"]) },
        ],
      },
      { encode },
    );
    expect(firstRequest.schemaBinding).toMatchObject({
      schemaId: "managed-schema",
      relationship: "managed",
      syncState: "dirty",
    });
    applyGeneratedPackage(project, firstRequest);

    const secondRequest = await generateModularSprite(
      {
        project,
        name: "Hero",
        existingId: "sprite-1",
        assets: [
          { assetId: "head", image: pixel(5, 5), blob: new Blob(["head"]) },
          { assetId: "shirt", image: pixel(5, 33), blob: new Blob(["shirt"]) },
          { assetId: "hair", image: pixel(37, 29), blob: new Blob(["hair"]) },
        ],
      },
      { encode },
    );

    expect(() => applyGeneratedPackage(project, secondRequest)).not.toThrow();
    const head = secondRequest.parts.find(
      (part) => part.draft.assetId === "head",
    );
    expect(head).toBeDefined();
    expect(
      pixelRect(
        JSON.parse(JSON.stringify(head!.draft.extractionFrame)),
        secondRequest.sourceImage.width,
        secondRequest.sourceImage.height,
      ),
    ).toEqual({ x: 8, y: 8, width: 5, height: 5 });
  });

  it("round-trips generated frames through JSON without changing pixel bounds", () => {
    const frame = normalizedPixelFrame(
      { x: 8, y: 8, width: 5, height: 5 },
      34,
      49,
    );

    expect(
      pixelRect(JSON.parse(JSON.stringify(frame)), 34, 49),
    ).toEqual({ x: 8, y: 8, width: 5, height: 5 });
    expect(expectedStableSize(JSON.parse(JSON.stringify(frame)), { width: 34, height: 49 })).toEqual({
      width: 5,
      height: 5,
    });
  });

  it("does not widen legacy normalized frames at floating-point edges", () => {
    const legacyFrame = {
      x: 8 / 49,
      y: 8 / 49,
      width: 5 / 49,
      height: 5 / 49,
    };

    expect(pixelRect(JSON.parse(JSON.stringify(legacyFrame)), 49, 49)).toEqual({
      x: 8,
      y: 8,
      width: 5,
      height: 5,
    });
  });
});

function requestRecipe() {
  return {
    background: {
      mode: "alpha" as const,
      color: { r: 0, g: 0, b: 0 },
      tolerance: 0,
      softness: 0.1,
      despill: 0,
    },
    detection: {
      alphaThreshold: 1,
      minimumRegionAreaRatio: 0,
      openingRadius: 0,
      closingRadius: 0,
      connectivity: 8 as const,
    },
    strokes: [],
  };
}
