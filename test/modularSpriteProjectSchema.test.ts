import { describe, expect, it } from "vitest";
import { MODULAR_SPRITE_PROCESSING_CONFIG } from "@kukla2d/contracts";

import { createEmptyProject } from "@/core/createEmptyProject";
import { removeLibraryAssets } from "@/features/layers/domain/removeLibraryAssets";
import { migrate_9_to_10 } from "@/schema/migrations/9-to-10";
import { validateProject } from "@/schema/projectSchema";

const recipe = {
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

function projectWithModularSprite() {
  const project = createEmptyProject();
  project.textures.push(
    { id: "source", name: "Source", source: "blob:source" },
    { id: "part", name: "Part", source: "blob:part" },
  );
  project.modularSprites.push({
    id: "modular-1",
    schemaVersion: 1,
    name: "Hero",
    sourceAssetId: "source",
    source: { width: 16, height: 16 },
    processorVersion: 1,
    recipe: structuredClone(recipe),
    parts: [
      {
        partKey: "head",
        assetId: "part",
        name: "Head",
        role: "head",
        side: "center",
        required: true,
        order: 0,
        extractionFrame: { x: 0, y: 0, width: 0.5, height: 0.5 },
        contentBounds: { x: 0.1, y: 0.1, width: 0.3, height: 0.3 },
        componentSeeds: [{ x: 0.2, y: 0.2 }],
      },
    ],
  });
  return project;
}

describe("modular sprite project schema", () => {
  it("migrates v9 documents with an empty profile list", () => {
    const migrated = migrate_9_to_10({ version: 9 });
    expect(migrated.version).toBe(10);
    expect(migrated.modularSprites).toEqual([]);
  });

  it("accepts a complete profile", () => {
    expect(validateProject(projectWithModularSprite()).success).toBe(true);
  });

  it("accepts enclosed chroma mode and normalized seeds", () => {
    const project = projectWithModularSprite();
    project.modularSprites[0]!.recipe.background.enclosedChromaMode =
      "desaturate";
    project.modularSprites[0]!.recipe.background.enclosedChromaSeeds = [
      { x: 0.25, y: 0.75 },
    ];
    project.modularSprites[0]!.recipe.background.enclosedChromaCoreAlphaMax =
      MODULAR_SPRITE_PROCESSING_CONFIG.background.enclosedChromaCoreAlphaMax.default;
    project.modularSprites[0]!.recipe.background.enclosedChromaCoreColorTolerance =
      MODULAR_SPRITE_PROCESSING_CONFIG.background.enclosedChromaCoreColorTolerance.default;
    project.modularSprites[0]!.recipe.background.enclosedChromaGrowthRadius =
      MODULAR_SPRITE_PROCESSING_CONFIG.background.enclosedChromaGrowthRadius.default;
    project.modularSprites[0]!.recipe.background.enclosedChromaGrowthAlphaMax =
      MODULAR_SPRITE_PROCESSING_CONFIG.background.enclosedChromaGrowthAlphaMax.default;
    project.modularSprites[0]!.recipe.background.enclosedChromaGrowthColorTolerance =
      MODULAR_SPRITE_PROCESSING_CONFIG.background.enclosedChromaGrowthColorTolerance.default;
    project.modularSprites[0]!.recipe.background.enclosedChromaGrowthChromaTolerance =
      MODULAR_SPRITE_PROCESSING_CONFIG.background.enclosedChromaGrowthChromaTolerance.default;
    project.modularSprites[0]!.recipe.background.enclosedChromaGrowthHueTolerance =
      MODULAR_SPRITE_PROCESSING_CONFIG.background.enclosedChromaGrowthHueTolerance.default;
    project.modularSprites[0]!.recipe.background.enclosedChromaGrowthMinChromaRatio =
      MODULAR_SPRITE_PROCESSING_CONFIG.background.enclosedChromaGrowthMinChromaRatio.default;
    expect(validateProject(project).success).toBe(true);
  });

  it("rejects invalid enclosed chroma mode and seeds", () => {
    const invalidMode = projectWithModularSprite();
    const invalidModeBackground = invalidMode.modularSprites[0]!.recipe
      .background as unknown as Record<string, unknown>;
    invalidModeBackground.enclosedChromaMode = "invalid";
    expect(validateProject(invalidMode).success).toBe(false);

    const invalidSeed = projectWithModularSprite();
    invalidSeed.modularSprites[0]!.recipe.background.enclosedChromaSeeds = [
      { x: 1.01, y: 0.5 },
    ];
    expect(validateProject(invalidSeed).success).toBe(false);
  });

  it("validates recipe values with the same limits used by processing and UI", () => {
    const project = projectWithModularSprite();
    project.modularSprites[0]!.recipe.background.tolerance =
      MODULAR_SPRITE_PROCESSING_CONFIG.background.tolerance.max +
      MODULAR_SPRITE_PROCESSING_CONFIG.background.tolerance.step;
    expect(validateProject(project).success).toBe(false);
  });

  it("rejects enclosed chroma values outside their configured ranges", () => {
    const fields = [
      "enclosedChromaCoreAlphaMax",
      "enclosedChromaCoreColorTolerance",
      "enclosedChromaGrowthRadius",
      "enclosedChromaGrowthAlphaMax",
      "enclosedChromaGrowthColorTolerance",
      "enclosedChromaGrowthChromaTolerance",
      "enclosedChromaGrowthHueTolerance",
      "enclosedChromaGrowthMinChromaRatio",
    ] as const;

    for (const field of fields) {
      const project = projectWithModularSprite();
      const parameter = MODULAR_SPRITE_PROCESSING_CONFIG.background[field];
      project.modularSprites[0]!.recipe.background[field] =
        parameter.min - parameter.step;
      expect(validateProject(project).success).toBe(false);
    }
  });

  it("rejects missing textures, duplicate part keys, and shared assets", () => {
    const project = projectWithModularSprite();
    project.modularSprites[0]!.parts.push({
      ...project.modularSprites[0]!.parts[0]!,
      assetId: "missing",
    });
    const validation = validateProject(project);
    expect(validation.success).toBe(false);
    if (!validation.success) {
      const messages = validation.error.issues
        .map((issue) => issue.message)
        .join(" ");
      expect(messages).toContain("does not match any texture");
      expect(messages).toContain("Duplicate modular sprite partKey");
    }
  });

  it("deletes a complete set and all part instances when its source is removed", () => {
    const project = projectWithModularSprite();
    project.nodes.push({
      id: "head-node",
      type: "part",
      name: "Head",
      parent: null,
      textureId: "part",
      draw_order: 0,
      opacity: 1,
      visible: true,
      transform: {
        x: 0,
        y: 0,
        rotation: 0,
        scaleX: 1,
        scaleY: 1,
        pivotX: 0,
        pivotY: 0,
      },
    });
    removeLibraryAssets(project, new Set(["source"]));
    expect(project.modularSprites).toEqual([]);
    expect(project.textures).toEqual([]);
    expect(project.nodes).toEqual([]);
  });

  it("detaches a removed part without deleting the protected source profile", () => {
    const project = projectWithModularSprite();
    removeLibraryAssets(project, new Set(["part"]));
    expect(project.modularSprites).toHaveLength(1);
    expect(project.modularSprites[0]!.parts).toEqual([]);
    expect(project.textures.map((texture) => texture.id)).toEqual(["source"]);
  });
});
