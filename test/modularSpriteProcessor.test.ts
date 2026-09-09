import { describe, expect, it } from "vitest";
import {
  assertValidModularSpriteRecipe,
  DEFAULT_MODULAR_SPRITE_RECIPE,
  type ModularSpriteEnclosedChromaMode,
} from "@kukla2d/contracts";
import {
  extractModularSpriteParts,
  matchRegionsToTemplate,
  processModularSprite,
  processModularSpriteAsync,
} from "@/features/modular-sprite";
import { handleModularSpriteTask } from "@/features/modular-sprite/infrastructure/workerTaskHandler";
import {
  blendEnclosedChromaMask,
  blendProtectedInteriorMask,
} from "@/features/modular-sprite/components/preview/ModularSpritePreviewCanvas";
import { detectEnclosedChroma } from "@/features/modular-sprite/domain/processing/enclosedChroma";

import type { ModularSpriteTaskRuntime } from "@/features/modular-sprite/infrastructure/workerTaskHandler.types";
import type {
  ModularSpriteDraftPart,
  ProcessedModularSprite,
  RgbaImageData,
} from "@/features/modular-sprite";

type ModularSpriteWarmCache = NonNullable<
  ModularSpriteTaskRuntime["warmCache"]
>;

function image(
  width: number,
  height: number,
  fill = [0, 0, 0, 0],
): RgbaImageData {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let index = 0; index < width * height; index += 1)
    data.set(fill, index * 4);
  return { width, height, data };
}

function paint(
  input: RgbaImageData,
  x: number,
  y: number,
  width: number,
  height: number,
  rgba: number[],
): void {
  for (let py = y; py < y + height; py += 1) {
    for (let px = x; px < x + width; px += 1)
      input.data.set(rgba, (py * input.width + px) * 4);
  }
}

function alphaRecipe() {
  const recipe = structuredClone(DEFAULT_MODULAR_SPRITE_RECIPE);
  recipe.background.mode = "alpha";
  recipe.detection.alphaThreshold = 1;
  recipe.detection.minimumRegionAreaRatio = 0;
  recipe.detection.openingRadius = 0;
  recipe.detection.closingRadius = 0;
  return recipe;
}

function setEnclosedChroma(
  recipe: ReturnType<typeof alphaRecipe>,
  mode: ModularSpriteEnclosedChromaMode,
  seeds: { x: number; y: number }[] = [],
): void {
  recipe.background.enclosedChromaMode = mode;
  recipe.background.enclosedChromaSeeds = seeds;
}

function enclosedHoleSource(hole = [0, 255, 0, 255]): RgbaImageData {
  const source = image(11, 11, [0, 255, 0, 255]);
  paint(source, 2, 2, 7, 7, [220, 30, 20, 255]);
  paint(source, 4, 4, 3, 3, hole);
  return source;
}

function softConnectedEnclosedHoleSource(): RgbaImageData {
  const source = image(19, 19, [0, 255, 0, 255]);
  paint(source, 3, 3, 13, 13, [220, 30, 20, 255]);
  paint(source, 6, 6, 7, 7, [0, 255, 0, 255]);
  paint(source, 13, 6, 3, 7, [80, 200, 20, 255]);
  return source;
}

function chromaRecipe(): ReturnType<typeof alphaRecipe> {
  const recipe = structuredClone(DEFAULT_MODULAR_SPRITE_RECIPE);
  recipe.background.tolerance = 0.2;
  recipe.background.softness = 0.04;
  recipe.background.matteChoke = 0;
  recipe.background.edgeColorRecovery = 0;
  recipe.detection.minimumRegionAreaRatio = 0;
  recipe.detection.openingRadius = 0;
  recipe.detection.closingRadius = 0;
  return recipe;
}

function draft(
  partKey: string,
  regionIds: number[],
  extractionFrame = { x: 0, y: 0, width: 1, height: 1 },
): ModularSpriteDraftPart {
  return {
    partKey,
    name: partKey,
    role: "custom",
    side: "none",
    required: true,
    order: 0,
    extractionFrame,
    contentBounds: extractionFrame,
    regionIds,
  };
}

function createRuntime(
  isAborted: () => boolean = () => false,
  warmCache: ModularSpriteWarmCache | null = null,
): ModularSpriteTaskRuntime {
  return {
    warmCache,
    isAborted,
    reportProgress: () => {},
    checkpoint: () => Promise.resolve(),
  };
}

describe("modular sprite processor", () => {
  it("blends the protection overlay only into marked pixels", () => {
    const pixels = new Uint8ClampedArray([10, 20, 30, 255, 40, 50, 60, 128]);

    const blended = blendProtectedInteriorMask(
      pixels,
      new Uint8Array([1, 0]),
      [200, 100, 0],
      0.5,
    );

    expect(Array.from(blended)).toEqual([105, 60, 15, 255, 40, 50, 60, 128]);
    expect(Array.from(pixels)).toEqual([10, 20, 30, 255, 40, 50, 60, 128]);
  });

  it("makes an enclosed-chroma diagnostic visible over transparent result pixels", () => {
    const blended = blendEnclosedChromaMask(
      new Uint8ClampedArray([0, 0, 0, 0]),
      new Uint8Array([1]),
      [0, 200, 255],
      0.5,
    );

    expect(Array.from(blended)).toEqual([0, 100, 128, 255]);
  });

  it("makes a diagnostic overlay visible over transparent result pixels", () => {
    const blended = blendProtectedInteriorMask(
      new Uint8ClampedArray([0, 255, 0, 0]),
      new Uint8Array([1]),
      [34, 211, 238],
      0.5,
    );

    expect(blended[3]).toBe(255);
  });

  it("rejects recipe values outside the shared processing contract", () => {
    const recipe = structuredClone(DEFAULT_MODULAR_SPRITE_RECIPE);
    recipe.background.edgeSearchRadius = 13;

    expect(() => assertValidModularSpriteRecipe(recipe)).toThrow(
      "background.edgeSearchRadius",
    );
    expect(() =>
      processModularSprite({
        image: image(2, 2, () => [0, 255, 0, 255]),
        recipe,
      }),
    ).toThrow("background.edgeSearchRadius");
  });
  it("detects transparent regions in deterministic reading order", () => {
    const source = image(12, 8);
    paint(source, 7, 1, 3, 2, [255, 0, 0, 255]);
    paint(source, 1, 5, 2, 2, [0, 0, 255, 255]);
    const first = processModularSprite({
      image: source,
      recipe: alphaRecipe(),
    });
    const second = processModularSprite({
      image: source,
      recipe: alphaRecipe(),
    });
    expect(first.regions.map((region) => region.bounds)).toEqual([
      { x: 7, y: 1, width: 3, height: 2 },
      { x: 1, y: 5, width: 2, height: 2 },
    ]);
    expect(Array.from(first.labels)).toEqual(Array.from(second.labels));
    expect(first.observation.components).toHaveLength(2);
    expect(first.observation.components[0]?.shapeMask.data).toBeInstanceOf(
      Uint8Array,
    );
    expect(first.protectedInteriorMask.every((value) => value === 0)).toBe(
      true,
    );
  });

  it("keeps the synchronous and cooperative pipelines behaviorally aligned", async () => {
    const source = image(12, 8);
    paint(source, 7, 1, 3, 2, [255, 0, 0, 255]);
    paint(source, 1, 5, 2, 2, [0, 0, 255, 255]);
    const recipe = alphaRecipe();
    const sync = processModularSprite({ image: source, recipe });
    const asyncResult = await processModularSpriteAsync(
      { image: source, recipe },
      {
        throwIfAborted: () => {},
        checkpoint: () => Promise.resolve(),
        report: () => {},
      },
    );

    expect(Array.from(asyncResult.rgba)).toEqual(Array.from(sync.rgba));
    expect(Array.from(asyncResult.matte)).toEqual(Array.from(sync.matte));
    expect(Array.from(asyncResult.labels)).toEqual(Array.from(sync.labels));
    expect(asyncResult.regions).toEqual(sync.regions);
  });

  it("keeps concave contour points in perimeter order", () => {
    const source = image(12, 12);
    paint(source, 2, 2, 2, 8, [255, 255, 255, 255]);
    paint(source, 2, 8, 8, 2, [255, 255, 255, 255]);
    const result = processModularSprite({
      image: source,
      recipe: alphaRecipe(),
    });
    const contour = result.regions[0]?.contour ?? [];
    const pixels = contour.map((point) => ({
      x: point.x * source.width - 0.5,
      y: point.y * source.height - 0.5,
    }));

    expect(result.regions).toHaveLength(1);
    expect(pixels.length).toBeGreaterThan(3);
    for (let index = 0; index < pixels.length; index += 1) {
      const current = pixels[index]!;
      const next = pixels[(index + 1) % pixels.length]!;
      expect(
        Math.hypot(current.x - next.x, current.y - next.y),
      ).toBeLessThanOrEqual(Math.SQRT2);
    }
  });

  it("keys a controlled green background while retaining the foreground", () => {
    const source = image(7, 7, [0, 255, 0, 255]);
    paint(source, 2, 2, 3, 3, [220, 30, 20, 255]);
    const recipe = structuredClone(DEFAULT_MODULAR_SPRITE_RECIPE);
    recipe.background.color = { r: 0, g: 255, b: 0 };
    recipe.background.tolerance = 0.02;
    recipe.background.softness = 0.04;
    recipe.detection.minimumRegionAreaRatio = 0;
    recipe.detection.openingRadius = 0;
    recipe.detection.closingRadius = 0;
    const result = processModularSprite({ image: source, recipe });
    expect(result.matte[0]).toBe(0);
    expect(result.matte[3 * 7 + 3]).toBeGreaterThan(250);
    expect(result.regions).toHaveLength(1);
  });

  it("removes a fully keyed enclosed hole in the new default mode", () => {
    const source = image(9, 9, [0, 255, 0, 255]);
    paint(source, 2, 2, 5, 5, [220, 30, 20, 255]);
    paint(source, 4, 4, 1, 1, [0, 255, 0, 255]);
    const recipe = structuredClone(DEFAULT_MODULAR_SPRITE_RECIPE);
    recipe.background.tolerance = 0.02;
    recipe.background.softness = 0.04;
    recipe.background.matteChoke = 0;
    recipe.background.edgeColorRecovery = 0;
    recipe.detection.minimumRegionAreaRatio = 0;
    recipe.detection.openingRadius = 0;
    recipe.detection.closingRadius = 0;

    const defaultResult = processModularSprite({ image: source, recipe });
    recipe.background.protectIslandInteriors = false;
    const unprotectedResult = processModularSprite({ image: source, recipe });

    expect(defaultResult.matte[4 * 9 + 4]).toBe(0);
    expect(defaultResult.rgba[(4 * 9 + 4) * 4 + 3]).toBe(0);
    expect(defaultResult.protectedInteriorMask[4 * 9 + 4]).toBe(0);
    expect(defaultResult.enclosedChromaMask[4 * 9 + 4]).toBe(1);
    expect(unprotectedResult.matte[4 * 9 + 4]).toBe(0);
    expect(unprotectedResult.protectedInteriorMask[4 * 9 + 4]).toBe(0);
    expect(unprotectedResult.enclosedChromaMask[4 * 9 + 4]).toBe(0);
  });

  it("keeps island protection independent of detection closing", () => {
    const source = image(9, 9, [0, 255, 0, 255]);
    paint(source, 2, 2, 5, 5, [220, 30, 20, 255]);
    paint(source, 4, 4, 1, 1, [0, 255, 0, 255]);
    const withoutMorphology = structuredClone(DEFAULT_MODULAR_SPRITE_RECIPE);
    withoutMorphology.background.tolerance = 0.02;
    withoutMorphology.background.softness = 0.04;
    withoutMorphology.background.matteChoke = 0;
    withoutMorphology.background.edgeColorRecovery = 0;
    withoutMorphology.detection.minimumRegionAreaRatio = 0;
    withoutMorphology.detection.openingRadius = 0;
    withoutMorphology.detection.closingRadius = 0;
    const withMorphology = structuredClone(withoutMorphology);
    withMorphology.detection.closingRadius = 1;

    const baseline = processModularSprite({
      image: source,
      recipe: withoutMorphology,
    });
    const morphed = processModularSprite({
      image: source,
      recipe: withMorphology,
    });

    expect(Array.from(morphed.protectedInteriorMask)).toEqual(
      Array.from(baseline.protectedInteriorMask),
    );
    expect(morphed.matte[4 * 9 + 4]).toBe(0);
    expect(morphed.enclosedChromaMask[4 * 9 + 4]).toBe(1);
  });

  it("keeps an inconsistent green enclosed detail protected", () => {
    const source = enclosedHoleSource([100, 150, 50, 255]);
    for (const [x, y] of [
      [4, 4],
      [5, 4],
      [6, 4],
      [4, 5],
    ])
      paint(source, x, y, 1, 1, [0, 255, 0, 255]);
    const result = processModularSprite({
      image: source,
      recipe: chromaRecipe(),
    });
    const center = 5 * source.width + 5;

    expect(result.matte[center]).toBe(255);
    expect(result.rgba[center * 4 + 3]).toBe(255);
    expect(result.protectedInteriorMask[center]).toBe(1);
    expect(result.enclosedChromaMask[center]).toBe(0);
  });

  it("excludes foreground-colored pixels from a qualifying chroma component", () => {
    const source = image(9, 9, [220, 30, 20, 255]);
    const matte = new Uint8ClampedArray(9 * 9);
    matte.fill(255);
    for (let y = 2; y <= 6; y += 1) {
      for (let x = 2; x <= 6; x += 1) {
        paint(source, x, y, 1, 1, [0, 255, 0, 255]);
        matte[y * 9 + x] = 0;
      }
    }
    paint(source, 4, 4, 1, 1, [255, 220, 0, 255]);

    const detected = detectEnclosedChroma(
      source,
      matte,
      new Uint8Array(9 * 9).fill(1),
      10,
      { r: 0, g: 255, b: 0 },
      [],
      new Uint8Array(9 * 9),
      new Uint8Array(9 * 9),
    );

    expect(detected.mask[4 * 9 + 3]).toBe(1);
    expect(detected.mask[4 * 9 + 4]).toBe(0);
  });

  it("bounds soft-edge expansion instead of flooding across an object", () => {
    const source = image(15, 7, [220, 30, 20, 255]);
    const matte = new Uint8ClampedArray(15 * 7);
    matte.fill(255);
    paint(source, 4, 3, 9, 1, [0, 255, 0, 255]);
    matte[3 * 15 + 4] = 0;
    for (let x = 5; x <= 12; x += 1) matte[3 * 15 + x] = 128;

    const detected = detectEnclosedChroma(
      source,
      matte,
      new Uint8Array(15 * 7).fill(1),
      10,
      { r: 0, g: 255, b: 0 },
      [],
      new Uint8Array(15 * 7),
      new Uint8Array(15 * 7),
    );

    expect(detected.mask[3 * 15 + 6]).toBe(1);
    expect(detected.mask[3 * 15 + 7]).toBe(0);
  });

  it("requires a confident low-alpha core before classifying a hole", () => {
    const source = image(9, 9, [220, 30, 20, 255]);
    const matte = new Uint8ClampedArray(9 * 9);
    matte.fill(255);
    paint(source, 3, 3, 3, 3, [0, 255, 0, 255]);
    for (let y = 3; y <= 5; y += 1)
      for (let x = 3; x <= 5; x += 1) matte[y * 9 + x] = 48;

    const detected = detectEnclosedChroma(
      source,
      matte,
      new Uint8Array(9 * 9).fill(1),
      119,
      { r: 0, g: 255, b: 0 },
      [],
      new Uint8Array(9 * 9),
      new Uint8Array(9 * 9),
    );

    expect(detected.mask.some((value) => value !== 0)).toBe(false);
  });

  it("grows through dark key-colored fringe but stops at a neutral outline", () => {
    const source = image(13, 13, [220, 30, 20, 255]);
    const matte = new Uint8ClampedArray(13 * 13);
    matte.fill(255);
    paint(source, 3, 3, 7, 7, [8, 8, 8, 255]);
    paint(source, 4, 4, 5, 5, [1, 40, 1, 255]);
    paint(source, 5, 5, 3, 3, [0, 255, 0, 255]);
    for (let y = 4; y <= 8; y += 1)
      for (let x = 4; x <= 8; x += 1) matte[y * 13 + x] = 200;
    for (let y = 5; y <= 7; y += 1)
      for (let x = 5; x <= 7; x += 1) matte[y * 13 + x] = 0;

    const detected = detectEnclosedChroma(
      source,
      matte,
      new Uint8Array(13 * 13).fill(1),
      32,
      { r: 0, g: 255, b: 0 },
      [],
      new Uint8Array(13 * 13),
      new Uint8Array(13 * 13),
    );

    expect(detected.mask[4 * 13 + 6]).toBe(1);
    expect(detected.mask[3 * 13 + 6]).toBe(0);
  });

  it.each([
    ["transparent", 0, [0, 255, 0]],
    ["black", 255, [0, 0, 0]],
    ["desaturate", 255, [182, 182, 182]],
    ["preserve", 255, [0, 255, 0]],
  ] as const)("handles enclosed chroma in %s mode", (mode, alpha, rgb) => {
    const recipe = chromaRecipe();
    setEnclosedChroma(recipe, mode);
    const result = processModularSprite({
      image: enclosedHoleSource(),
      recipe,
    });
    const center = 5 * result.width + 5;
    const offset = center * 4;

    expect(result.matte[center]).toBe(alpha);
    expect(Array.from(result.rgba.slice(offset, offset + 3))).toEqual(rgb);
    expect(result.rgba[offset + 3]).toBe(alpha);
    expect(result.protectedInteriorMask[center]).toBe(0);
    expect(result.enclosedChromaMask[center]).toBe(1);
  });

  it("lets a manual seed force a whole inconsistent component transparent", () => {
    const source = enclosedHoleSource([100, 150, 50, 255]);
    for (const [x, y] of [
      [4, 4],
      [5, 4],
      [6, 4],
      [4, 5],
    ])
      paint(source, x, y, 1, 1, [0, 255, 0, 255]);
    const recipe = chromaRecipe();
    setEnclosedChroma(recipe, "black", [{ x: 0.5, y: 0.5 }]);
    const result = processModularSprite({ image: source, recipe });

    for (let y = 4; y <= 6; y += 1) {
      for (let x = 4; x <= 6; x += 1) {
        const pixelIndex = y * source.width + x;
        expect(result.matte[pixelIndex]).toBeLessThanOrEqual(1);
        expect(result.rgba[pixelIndex * 4 + 3]).toBe(result.matte[pixelIndex]);
        expect(result.protectedInteriorMask[pixelIndex]).toBe(0);
        expect(result.enclosedChromaMask[pixelIndex]).toBe(1);
      }
    }
  });

  it("ignores a manual seed on the outer background", () => {
    const source = enclosedHoleSource([100, 150, 50, 255]);
    for (const [x, y] of [
      [4, 4],
      [5, 4],
      [6, 4],
      [4, 5],
    ])
      paint(source, x, y, 1, 1, [0, 255, 0, 255]);
    const recipe = chromaRecipe();
    setEnclosedChroma(recipe, "transparent", [{ x: 0, y: 0 }]);
    const result = processModularSprite({ image: source, recipe });
    const center = 5 * source.width + 5;

    expect(result.matte[center]).toBe(255);
    expect(result.protectedInteriorMask[center]).toBe(1);
    expect(result.enclosedChromaMask[center]).toBe(0);
  });

  it("keeps background strokes above enclosed chroma and foreground strokes intact", () => {
    const backgroundStrokeRecipe = chromaRecipe();
    setEnclosedChroma(backgroundStrokeRecipe, "preserve");
    backgroundStrokeRecipe.strokes.push({
      kind: "background",
      radius: 0.01,
      points: [{ x: 0.5, y: 0.5 }],
    });
    const backgroundStrokeResult = processModularSprite({
      image: enclosedHoleSource(),
      recipe: backgroundStrokeRecipe,
    });
    const center = 5 * 11 + 5;
    expect(backgroundStrokeResult.matte[center]).toBe(0);
    expect(backgroundStrokeResult.rgba[center * 4 + 3]).toBe(0);
    expect(backgroundStrokeResult.protectedInteriorMask[center]).toBe(0);

    const foregroundStrokeRecipe = chromaRecipe();
    setEnclosedChroma(foregroundStrokeRecipe, "transparent");
    foregroundStrokeRecipe.strokes.push({
      kind: "foreground",
      radius: 0.01,
      points: [{ x: 0.5, y: 0.5 }],
    });
    const foregroundStrokeResult = processModularSprite({
      image: enclosedHoleSource(),
      recipe: foregroundStrokeRecipe,
    });
    expect(foregroundStrokeResult.matte[center]).toBe(255);
    expect(foregroundStrokeResult.rgba[center * 4 + 3]).toBe(255);
    expect(foregroundStrokeResult.enclosedChromaMask[center]).toBe(0);
  });

  it("detects a diagonal-only background connection as a closed core", () => {
    const source = image(7, 7, [0, 255, 0, 255]);
    for (let y = 1; y < 6; y += 1) {
      for (let x = 1; x < 6; x += 1) {
        if ((x === 1 || x === 5 || y === 1 || y === 5) && !(x === 1 && y === 1))
          paint(source, x, y, 1, 1, [20, 20, 20, 255]);
      }
    }
    const recipe = structuredClone(DEFAULT_MODULAR_SPRITE_RECIPE);
    recipe.background.tolerance = 0.02;
    recipe.background.softness = 0.04;
    recipe.background.interiorProtectionInset = 1;
    recipe.background.matteChoke = 0;
    recipe.background.edgeColorRecovery = 0;
    recipe.detection.minimumRegionAreaRatio = 0;
    recipe.detection.openingRadius = 0;
    recipe.detection.closingRadius = 0;

    const result = processModularSprite({ image: source, recipe });

    expect(result.matte[3 * 7 + 3]).toBe(0);
    expect(result.protectedInteriorMask[3 * 7 + 3]).toBe(0);
    expect(result.enclosedChromaMask[3 * 7 + 3]).toBe(1);
  });

  it("keeps a closed soft-edge hole separate from the outer soft background", () => {
    const transparentRecipe = chromaRecipe();
    transparentRecipe.background.color = { r: 0, g: 255, b: 0 };
    transparentRecipe.background.tolerance = 0.02;
    transparentRecipe.background.softness = 0.08;
    transparentRecipe.background.interiorProtectionInset = 1;
    setEnclosedChroma(transparentRecipe, "transparent");
    const preserveRecipe = structuredClone(transparentRecipe);
    setEnclosedChroma(preserveRecipe, "preserve");

    const transparent = processModularSprite({
      image: softConnectedEnclosedHoleSource(),
      recipe: transparentRecipe,
    });
    const preserve = processModularSprite({
      image: softConnectedEnclosedHoleSource(),
      recipe: preserveRecipe,
    });
    const center = 9 * transparent.width + 9;
    const innerSoftEdge = 9 * transparent.width + 14;
    const outerSoftBackground = 9 * transparent.width + 15;

    expect(transparent.enclosedChromaMask[center]).toBe(1);
    expect(transparent.enclosedChromaMask[innerSoftEdge]).toBe(1);
    expect(transparent.enclosedChromaMask[outerSoftBackground]).toBe(0);
    expect(transparent.matte[center]).toBe(0);
    expect(preserve.matte[center]).toBe(255);
    expect(preserve.matte[innerSoftEdge]).toBe(255);
    expect(Array.from(preserve.rgba)).not.toEqual(Array.from(transparent.rgba));
  });

  it("does not protect enclosed pixels with zero source alpha", () => {
    const source = image(9, 9, [0, 255, 0, 255]);
    paint(source, 2, 2, 5, 5, [220, 30, 20, 255]);
    paint(source, 4, 4, 1, 1, [0, 255, 0, 0]);
    const recipe = structuredClone(DEFAULT_MODULAR_SPRITE_RECIPE);
    recipe.background.tolerance = 0.02;
    recipe.background.softness = 0.04;
    recipe.background.matteChoke = 0;
    recipe.background.edgeColorRecovery = 0;
    recipe.detection.minimumRegionAreaRatio = 0;
    recipe.detection.openingRadius = 0;
    recipe.detection.closingRadius = 0;

    const result = processModularSprite({ image: source, recipe });
    const center = 4 * 9 + 4;

    expect(result.matte[center]).toBe(0);
    expect(result.rgba[center * 4 + 3]).toBe(0);
    expect(result.protectedInteriorMask[center]).toBe(0);
  });

  it("does not protect keyed space connected to the canvas border", () => {
    const source = image(7, 7, [0, 255, 0, 255]);
    paint(source, 1, 1, 2, 1, [20, 20, 20, 255]);
    paint(source, 4, 1, 2, 1, [20, 20, 20, 255]);
    paint(source, 1, 5, 5, 1, [20, 20, 20, 255]);
    paint(source, 1, 1, 1, 5, [20, 20, 20, 255]);
    paint(source, 5, 1, 1, 5, [20, 20, 20, 255]);
    const recipe = structuredClone(DEFAULT_MODULAR_SPRITE_RECIPE);
    recipe.background.matteChoke = 0;
    recipe.background.edgeColorRecovery = 0;
    recipe.detection.minimumRegionAreaRatio = 0;
    recipe.detection.openingRadius = 0;
    recipe.detection.closingRadius = 0;

    const result = processModularSprite({ image: source, recipe });

    expect(result.matte[3 * 7 + 3]).toBe(0);
    expect(result.protectedInteriorMask[3 * 7 + 3]).toBe(0);
  });

  it("does not let island protection undo a manual erase stroke", () => {
    const source = image(9, 9, [0, 255, 0, 255]);
    paint(source, 2, 2, 5, 5, [220, 30, 20, 255]);
    const recipe = structuredClone(DEFAULT_MODULAR_SPRITE_RECIPE);
    recipe.background.matteChoke = 0;
    recipe.background.edgeColorRecovery = 0;
    recipe.detection.minimumRegionAreaRatio = 0;
    recipe.detection.openingRadius = 0;
    recipe.detection.closingRadius = 0;
    recipe.strokes.push({
      kind: "background",
      radius: 0.05,
      points: [{ x: 0.5, y: 0.5 }],
    });

    const result = processModularSprite({ image: source, recipe });

    expect(result.matte[4 * 9 + 4]).toBe(0);
    expect(result.protectedInteriorMask[4 * 9 + 4]).toBe(0);
  });

  it("reconstructs contaminated edge RGB from nearby solid foreground", () => {
    const source = image(7, 7, [0, 255, 0, 255]);
    paint(source, 1, 1, 5, 5, [0, 220, 0, 255]);
    paint(source, 2, 2, 3, 3, [0, 0, 0, 255]);
    const recipe = structuredClone(DEFAULT_MODULAR_SPRITE_RECIPE);
    recipe.background.tolerance = 0.02;
    recipe.background.softness = 0.08;
    recipe.background.despill = 0;
    recipe.background.protectIslandInteriors = false;
    recipe.background.matteChoke = 0;
    recipe.background.edgeSearchRadius = 2;
    recipe.detection.minimumRegionAreaRatio = 0;
    recipe.detection.openingRadius = 0;
    recipe.detection.closingRadius = 0;

    recipe.background.edgeColorRecovery = 0;
    const raw = processModularSprite({ image: source, recipe });
    recipe.background.edgeColorRecovery = 1;
    const recovered = processModularSprite({ image: source, recipe });
    const edgeGreen = (1 * 7 + 3) * 4 + 1;

    expect(raw.matte[1 * 7 + 3]).toBeGreaterThan(0);
    expect(raw.matte[1 * 7 + 3]).toBeLessThan(250);
    expect(recovered.rgba[edgeGreen]).toBeLessThan(raw.rgba[edgeGreen]! / 2);
  });

  it("keeps chroma refinement identical in the CLI and browser pipelines", async () => {
    const source = image(9, 9, [0, 255, 0, 255]);
    paint(source, 1, 1, 7, 7, [0, 220, 0, 255]);
    paint(source, 2, 2, 5, 5, [20, 20, 20, 255]);
    paint(source, 3, 3, 3, 3, [0, 255, 0, 255]);
    const recipe = structuredClone(DEFAULT_MODULAR_SPRITE_RECIPE);
    recipe.detection.minimumRegionAreaRatio = 0;
    recipe.detection.openingRadius = 0;
    recipe.detection.closingRadius = 0;

    const synchronous = processModularSprite({ image: source, recipe });
    const cooperative = await processModularSpriteAsync(
      { image: source, recipe },
      {
        throwIfAborted: () => {},
        checkpoint: () => Promise.resolve(),
        report: () => {},
      },
    );

    expect(Array.from(cooperative.rgba)).toEqual(Array.from(synchronous.rgba));
    expect(Array.from(cooperative.matte)).toEqual(
      Array.from(synchronous.matte),
    );
    expect(Array.from(cooperative.labels)).toEqual(
      Array.from(synchronous.labels),
    );
    expect(Array.from(cooperative.protectedInteriorMask)).toEqual(
      Array.from(synchronous.protectedInteriorMask),
    );
    expect(Array.from(cooperative.enclosedChromaMask)).toEqual(
      Array.from(synchronous.enclosedChromaMask),
    );
  });

  it("caps noisy detections before they can overwhelm the UI", () => {
    const source = image(768, 768);
    for (let y = 0; y < source.height; y += 2) {
      for (let x = 0; x < source.width; x += 2)
        paint(source, x, y, 1, 1, [255, 255, 255, 255]);
    }
    const result = processModularSprite({
      image: source,
      recipe: alphaRecipe(),
    });
    expect(result.regions).toHaveLength(256);
    expect(
      result.warnings.some((warning) =>
        warning.includes("smaller regions were ignored"),
      ),
    ).toBe(true);
  });

  it("keeps the largest regions when noisy detections are capped", () => {
    const source = image(60, 60);
    for (let y = 0; y < source.height; y += 3) {
      for (let x = 0; x < source.width; x += 3)
        paint(source, x, y, 1, 1, [255, 255, 255, 255]);
    }
    paint(source, 45, 45, 10, 10, [255, 255, 255, 255]);
    const result = processModularSprite({
      image: source,
      recipe: alphaRecipe(),
    });
    expect(result.regions.some((region) => region.area === 100)).toBe(true);
  });

  it("bounds contour payload size for large regions", () => {
    const source = image(100, 100, [255, 255, 255, 255]);
    const result = processModularSprite({
      image: source,
      recipe: alphaRecipe(),
    });
    expect(result.regions[0]?.contour.length).toBeLessThanOrEqual(256);
  });

  it("splits detection without removing source alpha pixels", () => {
    const source = image(11, 7);
    paint(source, 1, 2, 9, 3, [200, 100, 50, 255]);
    const recipe = alphaRecipe();
    recipe.strokes.push({
      kind: "split",
      radius: 0.04,
      points: [
        { x: 0.5, y: 0.15 },
        { x: 0.5, y: 0.85 },
      ],
    });
    const result = processModularSprite({ image: source, recipe });
    expect(result.regions).toHaveLength(2);
    const extracted = extractModularSpriteParts(result, [
      draft("left", [1]),
      draft("right", [2]),
    ]);
    const exportedAlpha = extracted.reduce(
      (count, part) =>
        count +
        part.image.data.filter(
          (_, index) => index % 4 === 3 && part.image.data[index]! > 0,
        ).length,
      0,
    );
    expect(exportedAlpha).toBe(27);
  });

  it("masks foreign components inside a merged extraction frame", () => {
    const source = image(12, 8);
    paint(source, 1, 1, 2, 6, [255, 0, 0, 255]);
    paint(source, 7, 2, 2, 2, [0, 0, 255, 255]);
    const result = processModularSprite({
      image: source,
      recipe: alphaRecipe(),
    });
    const [part] = extractModularSpriteParts(result, [draft("outer", [1])]);
    expect(part!.image.data[(2 * 12 + 7) * 4 + 3]).toBe(0);
  });

  it("matches template parts globally one-to-one", () => {
    const source = image(20, 10);
    paint(source, 1, 2, 3, 3, [255, 255, 255, 255]);
    paint(source, 15, 2, 3, 3, [255, 255, 255, 255]);
    const regions = processModularSprite({
      image: source,
      recipe: alphaRecipe(),
    }).regions;
    const matches = matchRegionsToTemplate(
      [
        {
          partKey: "right",
          required: true,
          contentBounds: { x: 0.7, y: 0.1, width: 0.25, height: 0.5 },
        },
        {
          partKey: "left",
          required: true,
          contentBounds: { x: 0, y: 0.1, width: 0.3, height: 0.5 },
        },
      ],
      regions,
    );
    expect(matches.map((match) => match.regionId)).toEqual([2, 1]);
  });

  it("returns transferable result buffers from the worker protocol", async () => {
    const source = image(3, 3);
    paint(source, 1, 1, 1, 1, [255, 255, 255, 255]);
    const task = await handleModularSpriteTask(
      {
        type: "modular-sprite.process",
        requestId: "request-1",
        image: source,
        recipe: alphaRecipe(),
      },
      createRuntime(),
    );
    expect(task.response.type).toBe("result");
    expect(task.transferables).toHaveLength(5);
    if (task.response.type !== "result") throw new Error("Expected result");
    const processed = task.response.data.result as ProcessedModularSprite;
    expect(task.transferables).toContain(
      processed.protectedInteriorMask.buffer,
    );
    expect(task.transferables).toContain(processed.enclosedChromaMask.buffer);
  });

  it("processes from the warm cache and reuses the precomputed color space", async () => {
    const source = image(7, 7, [0, 255, 0, 255]);
    paint(source, 2, 2, 3, 3, [220, 30, 20, 255]);
    const runtime = createRuntime();
    const warm = await handleModularSpriteTask(
      { type: "modular-sprite.warm", requestId: "warm-1", image: source },
      runtime,
    );
    expect(warm.response.type).toBe("result");
    const recipe = structuredClone(DEFAULT_MODULAR_SPRITE_RECIPE);
    recipe.background.tolerance = 0.02;
    recipe.background.softness = 0.04;
    recipe.detection.minimumRegionAreaRatio = 0;
    recipe.detection.openingRadius = 0;
    recipe.detection.closingRadius = 0;
    const task = await handleModularSpriteTask(
      { type: "modular-sprite.process", requestId: "request-2", recipe },
      runtime,
    );
    expect(task.response.type).toBe("result");
    if (task.response.type !== "result")
      throw new Error("Expected a result response");
    const processed = task.response.data.result as ProcessedModularSprite;
    expect(processed.matte[0]).toBe(0);
    expect(processed.matte[3 * 7 + 3]).toBeGreaterThan(250);
    expect(processed.regions).toHaveLength(1);
    expect(runtime.warmCache?.oklab).not.toBeNull();
  });

  it("aborts cooperatively when the runtime reports the request as aborted", async () => {
    const source = image(3, 3);
    const outcome = await handleModularSpriteTask(
      {
        type: "modular-sprite.process",
        requestId: "request-3",
        image: source,
        recipe: alphaRecipe(),
      },
      createRuntime(() => true),
    ).then(
      () => null,
      (error: unknown) => error,
    );
    expect(outcome).toBeInstanceOf(DOMException);
    expect((outcome as DOMException).name).toBe("AbortError");
  });

  it("reports a warm cache error when processing without a warmed preview", async () => {
    const task = await handleModularSpriteTask(
      {
        type: "modular-sprite.process",
        requestId: "request-4",
        recipe: alphaRecipe(),
      },
      createRuntime(),
    );
    expect(task.response.type).toBe("error");
  });
});
