import { describe, expect, it } from 'vitest';

import { finalizeModularSpriteImport } from '@/features/modular-sprite/application/finalizeModularSpriteImport';

import type { ModularSpriteProcessingPort, ModularSpriteSchemaPort } from '@/features/modular-sprite/application/finalizeModularSpriteImport';
import type { DetectedRegion, ProcessedModularSprite, RgbaImageData } from '@/features/modular-sprite/domain/contracts';
import type { RegionGrouping } from '@/features/modular-sprite/domain/partGrouping';

const image: RgbaImageData = { width: 2, height: 2, data: new Uint8ClampedArray(16) };

function region(id: number): DetectedRegion {
  return { id, area: 1, bounds: { x: 0, y: 0, width: 1, height: 1 }, normalizedBounds: { x: 0, y: 0, width: 0.5, height: 0.5 }, centroid: { x: 0.25, y: 0.25 }, suggestedRole: 'custom', contour: [] };
}

function processed(id: number): ProcessedModularSprite {
  return {
    width: 2,
    height: 2,
    rgba: new Uint8ClampedArray(16),
    matte: new Uint8ClampedArray(4),
    labels: new Int32Array(4),
    regions: [region(id)],
    background: { mode: 'alpha', color: { r: 0, g: 0, b: 0 }, confidence: 1 },
    warnings: [],
    observation: { observationVersion: 1, processorVersion: 1, canvas: { width: 2, height: 2, aspectRatio: 1 }, foregroundBounds: region(id).normalizedBounds, components: [], segmentationQualityBp: 0 },
  };
}

const grouping: RegionGrouping = {
  parts: [{ partKey: 'body', name: 'Body', role: 'torso', side: 'center', required: true, order: 0, extractionFrame: { x: 0, y: 0, width: 1, height: 1 }, contentBounds: { x: 0, y: 0, width: 0.5, height: 0.5 }, regionIds: [1] }],
  excludedRegionIds: [],
};

const schemaPort: ModularSpriteSchemaPort = {
  createSchema: () => { throw new Error('not used'); },
  saveAsset: () => Promise.resolve(),
  save: () => Promise.resolve(),
  portableSnapshot: () => ({ formatVersion: 1, schemaId: 'unused', revision: 1, compositionId: 'unused', name: 'unused', slots: [] }),
};

describe('finalizeModularSpriteImport', () => {
  it('validates, reconciles full-resolution IDs, extracts and builds a commit request', async () => {
    const full = processed(10);
    const extractedImage: RgbaImageData = { width: 2, height: 2, data: new Uint8ClampedArray(16) };
    let extractedParts: ReadonlyArray<{ partKey: string; regionIds: number[] }> = [];
    const processing: ModularSpriteProcessingPort = {
      process: () => Promise.resolve(full),
      extract: (_request, parts) => {
        extractedParts = parts.map(part => ({ partKey: part.partKey, regionIds: part.regionIds }));
        return Promise.resolve(parts.map(part => ({ partKey: part.partKey, image: extractedImage, contentBounds: part.contentBounds, componentSeeds: [{ x: 0.25, y: 0.25 }], overflow: false })));
      },
    };
    const outcome = await finalizeModularSpriteImport({
      existingId: null,
      source: { file: new File([], 'hero.png'), image, preview: image },
      recipe: { background: { mode: 'alpha', color: { r: 0, g: 0, b: 0 }, tolerance: 0, softness: 0.1, despill: 0 }, detection: { alphaThreshold: 1, minimumRegionAreaRatio: 0, openingRadius: 0, closingRadius: 0, connectivity: 8 }, strokes: [] },
      previewResult: processed(1),
      grouping,
      confirmedPartKeys: ['body'],
      name: 'Hero',
      addToCanvas: true,
      schema: { applied: null, addSchema: false, saveMode: 'new', metadata: { name: 'Hero schema', description: '', characterTypeIds: [], characterClassIds: [], tags: [] } },
    }, { processing, image: { encode: () => Promise.resolve(new Blob(['png'], { type: 'image/png' })) }, schema: schemaPort });

    expect(extractedParts).toEqual([{ partKey: 'body', regionIds: [10] }]);
    expect(outcome.request.name).toBe('Hero');
    expect(outcome.request.parts[0]?.draft.partKey).toBe('body');
    expect(outcome.request.parts[0]?.blob.type).toBe('image/png');
    expect(outcome.reconciliation.lostPreviousRegionIds).toEqual([]);
  });

  it('rejects an unconfirmed or empty part before invoking processing', async () => {
    let processedCall = false;
    const processing: ModularSpriteProcessingPort = { process: () => { processedCall = true; return Promise.resolve(processed(10)); }, extract: () => Promise.resolve([]) };
    await expect(finalizeModularSpriteImport({
      source: { file: new File([], 'hero.png'), image, preview: image },
      recipe: { background: { mode: 'alpha', color: { r: 0, g: 0, b: 0 }, tolerance: 0, softness: 0.1, despill: 0 }, detection: { alphaThreshold: 1, minimumRegionAreaRatio: 0, openingRadius: 0, closingRadius: 0, connectivity: 8 }, strokes: [] },
      previewResult: processed(1),
      grouping: { parts: [{ ...grouping.parts[0]!, regionIds: [] }], excludedRegionIds: [1] },
      confirmedPartKeys: [],
      name: 'Hero',
      addToCanvas: false,
      schema: { applied: null, addSchema: false, saveMode: 'new', metadata: { name: '', description: '', characterTypeIds: [], characterClassIds: [], tags: [] } },
    }, { processing, image: { encode: () => Promise.resolve(new Blob()) }, schema: schemaPort })).rejects.toThrow('assigned region');
    expect(processedCall).toBe(false);
  });
});
