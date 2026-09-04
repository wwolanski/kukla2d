import { describe, expect, it } from 'vitest';
import { createActor } from 'xstate';

import {
  DEFAULT_MODULAR_SPRITE_RECIPE,
  extractModularSpriteParts,
  matchRegionsToTemplate,
  processModularSprite,
} from '@/features/modular-sprite';
import { handleModularSpriteTask } from '@/features/modular-sprite/infrastructure/workerProtocol';
import { modularSpriteWizardMachine } from '@/features/modular-sprite/application/modularSpriteWizardMachine';

import type { ModularSpriteDraftPart, RgbaImageData } from '@/features/modular-sprite';

function image(width: number, height: number, fill = [0, 0, 0, 0]): RgbaImageData {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let index = 0; index < width * height; index += 1) data.set(fill, index * 4);
  return { width, height, data };
}

function paint(input: RgbaImageData, x: number, y: number, width: number, height: number, rgba: number[]): void {
  for (let py = y; py < y + height; py += 1) {
    for (let px = x; px < x + width; px += 1) input.data.set(rgba, (py * input.width + px) * 4);
  }
}

function alphaRecipe() {
  const recipe = structuredClone(DEFAULT_MODULAR_SPRITE_RECIPE);
  recipe.background.mode = 'alpha';
  recipe.detection.alphaThreshold = 1;
  recipe.detection.minimumRegionAreaRatio = 0;
  recipe.detection.openingRadius = 0;
  recipe.detection.closingRadius = 0;
  return recipe;
}

function draft(partKey: string, regionIds: number[], extractionFrame = { x: 0, y: 0, width: 1, height: 1 }): ModularSpriteDraftPart {
  return {
    partKey,
    name: partKey,
    role: 'custom',
    side: 'none',
    required: true,
    order: 0,
    extractionFrame,
    contentBounds: extractionFrame,
    regionIds,
  };
}

describe('modular sprite processor', () => {
  it('detects transparent regions in deterministic reading order', () => {
    const source = image(12, 8);
    paint(source, 7, 1, 3, 2, [255, 0, 0, 255]);
    paint(source, 1, 5, 2, 2, [0, 0, 255, 255]);
    const first = processModularSprite({ image: source, recipe: alphaRecipe() });
    const second = processModularSprite({ image: source, recipe: alphaRecipe() });
    expect(first.regions.map(region => region.bounds)).toEqual([
      { x: 7, y: 1, width: 3, height: 2 },
      { x: 1, y: 5, width: 2, height: 2 },
    ]);
    expect(Array.from(first.labels)).toEqual(Array.from(second.labels));
  });

  it('keys a controlled green background while retaining the foreground', () => {
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

  it('caps noisy detections before they can overwhelm the UI', () => {
    const source = image(768, 768);
    for (let y = 0; y < source.height; y += 2) {
      for (let x = 0; x < source.width; x += 2) paint(source, x, y, 1, 1, [255, 255, 255, 255]);
    }
    const result = processModularSprite({ image: source, recipe: alphaRecipe() });
    expect(result.regions).toHaveLength(256);
    expect(result.warnings.some(warning => warning.includes('smaller regions were ignored'))).toBe(true);
  });

  it('keeps the largest regions when noisy detections are capped', () => {
    const source = image(60, 60);
    for (let y = 0; y < source.height; y += 3) {
      for (let x = 0; x < source.width; x += 3) paint(source, x, y, 1, 1, [255, 255, 255, 255]);
    }
    paint(source, 45, 45, 10, 10, [255, 255, 255, 255]);
    const result = processModularSprite({ image: source, recipe: alphaRecipe() });
    expect(result.regions.some(region => region.area === 100)).toBe(true);
  });

  it('bounds contour payload size for large regions', () => {
    const source = image(100, 100, [255, 255, 255, 255]);
    const result = processModularSprite({ image: source, recipe: alphaRecipe() });
    expect(result.regions[0]?.contour.length).toBeLessThanOrEqual(256);
  });

  it('splits detection without removing source alpha pixels', () => {
    const source = image(11, 7);
    paint(source, 1, 2, 9, 3, [200, 100, 50, 255]);
    const recipe = alphaRecipe();
    recipe.strokes.push({
      kind: 'split',
      radius: 0.04,
      points: [{ x: 0.5, y: 0.15 }, { x: 0.5, y: 0.85 }],
    });
    const result = processModularSprite({ image: source, recipe });
    expect(result.regions).toHaveLength(2);
    const extracted = extractModularSpriteParts(result, [
      draft('left', [1]),
      draft('right', [2]),
    ]);
    const exportedAlpha = extracted.reduce((count, part) => count + part.image.data
      .filter((_, index) => index % 4 === 3 && part.image.data[index]! > 0).length, 0);
    expect(exportedAlpha).toBe(27);
  });

  it('masks foreign components inside a merged extraction frame', () => {
    const source = image(12, 8);
    paint(source, 1, 1, 2, 6, [255, 0, 0, 255]);
    paint(source, 7, 2, 2, 2, [0, 0, 255, 255]);
    const result = processModularSprite({ image: source, recipe: alphaRecipe() });
    const [part] = extractModularSpriteParts(result, [draft('outer', [1])]);
    expect(part!.image.data[(2 * 12 + 7) * 4 + 3]).toBe(0);
  });

  it('matches template parts globally one-to-one', () => {
    const source = image(20, 10);
    paint(source, 1, 2, 3, 3, [255, 255, 255, 255]);
    paint(source, 15, 2, 3, 3, [255, 255, 255, 255]);
    const regions = processModularSprite({ image: source, recipe: alphaRecipe() }).regions;
    const matches = matchRegionsToTemplate([
      { partKey: 'right', required: true, contentBounds: { x: 0.7, y: 0.1, width: 0.25, height: 0.5 } },
      { partKey: 'left', required: true, contentBounds: { x: 0, y: 0.1, width: 0.3, height: 0.5 } },
    ], regions);
    expect(matches.map(match => match.regionId)).toEqual([2, 1]);
  });

  it('returns transferable result buffers from the worker protocol', () => {
    const source = image(3, 3);
    paint(source, 1, 1, 1, 1, [255, 255, 255, 255]);
    const task = handleModularSpriteTask({
      requestId: 'request-1',
      kind: 'modular-sprite.process',
      payload: { image: source, recipe: alphaRecipe() },
    });
    expect(task.response.type).toBe('result');
    expect(task.transferables).toHaveLength(3);
  });
});

describe('modular sprite wizard machine', () => {
  it('guards incomplete steps and tracks dirty edits', () => {
    const actor = createActor(modularSpriteWizardMachine).start();
    actor.send({ type: 'SOURCE_SELECTED' });
    actor.send({ type: 'DECODED' });
    actor.send({ type: 'NEXT' });
    expect(actor.getSnapshot().value).toBe('background');
    actor.send({ type: 'SET_READY', step: 'background', ready: true });
    actor.send({ type: 'CHANGE' });
    actor.send({ type: 'NEXT' });
    expect(actor.getSnapshot().value).toBe('regions');
    expect(actor.getSnapshot().context.dirty).toBe(true);
    actor.stop();
  });
});
