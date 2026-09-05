import { describe, expect, it } from 'vitest';

import {
  canContinue,
  createInitialWizardState,
  hasUnsavedChanges,
  wizardReducer,
} from '@/features/modular-sprite/application/wizardState';
import { createInitialGrouping } from '@/features/modular-sprite/domain/partGrouping';

import type { DetectedRegion, RgbaImageData } from '@/features/modular-sprite/domain/contracts';

const image: RgbaImageData = { width: 2, height: 2, data: new Uint8ClampedArray(16) };
const detected: DetectedRegion = {
  id: 1,
  area: 1,
  bounds: { x: 0, y: 0, width: 1, height: 1 },
  normalizedBounds: { x: 0, y: 0, width: 0.5, height: 0.5 },
  centroid: { x: 0.25, y: 0.25 },
  suggestedRole: 'custom',
  contour: [],
};

describe('modular sprite wizard reducer', () => {
  it('derives readiness and busy state from one state object', () => {
    let state = createInitialWizardState();
    expect(canContinue(state)).toBe(false);
    state = wizardReducer(state, { type: 'SOURCE_LOADED', source: { file: new File([], 'source.png'), image, preview: image }, recipe: state.recipe, name: 'Source' });
    expect(state.step).toBe('background');
    state = wizardReducer(state, { type: 'PROCESSING_SUCCEEDED', result: { width: 2, height: 2, rgba: new Uint8ClampedArray(16), matte: new Uint8ClampedArray(4), labels: new Int32Array(4), regions: [detected], background: { mode: 'alpha', color: { r: 0, g: 0, b: 0 }, confidence: 1 }, warnings: [], observation: { observationVersion: 1, processorVersion: 1, canvas: { width: 2, height: 2, aspectRatio: 1 }, foregroundBounds: detected.normalizedBounds, components: [], segmentationQualityBp: 0 } }, grouping: createInitialGrouping([detected]) });
    expect(canContinue(state)).toBe(true);
    state = wizardReducer(state, { type: 'NEXT' });
    expect(state.step).toBe('regions');
    state = wizardReducer(state, { type: 'BACK' });
    expect(state.step).toBe('background');
    state = wizardReducer(state, { type: 'PROCESSING_STARTED' });
    expect(state.status).toBe('processing');
    expect(canContinue(state)).toBe(false);
  });

  it('invalidates confirmations on grouping edits and supports undo/redo', () => {
    let state = createInitialWizardState();
    const grouping = createInitialGrouping([detected]);
    state = wizardReducer(state, { type: 'SOURCE_LOADED', source: { file: new File([], 'source.png'), image, preview: image }, recipe: state.recipe, name: 'Source' });
    state = wizardReducer(state, { type: 'PROCESSING_SUCCEEDED', result: { width: 2, height: 2, rgba: new Uint8ClampedArray(16), matte: new Uint8ClampedArray(4), labels: new Int32Array(4), regions: [detected], background: { mode: 'alpha', color: { r: 0, g: 0, b: 0 }, confidence: 1 }, warnings: [], observation: { observationVersion: 1, processorVersion: 1, canvas: { width: 2, height: 2, aspectRatio: 1 }, foregroundBounds: detected.normalizedBounds, components: [], segmentationQualityBp: 0 } }, grouping });
    const partKey = grouping.parts[0]!.partKey;
    state = wizardReducer(state, { type: 'CONFIRM_PART', partKey });
    state = wizardReducer(state, { type: 'GROUPING_CHANGED', grouping, affectedPartKeys: [partKey] });
    expect(state.confirmation.confirmedPartKeys).toEqual([]);
    expect(hasUnsavedChanges(state)).toBe(true);
    state = wizardReducer(state, { type: 'UNDO' });
    expect(state.confirmation.confirmedPartKeys).toEqual([partKey]);
    state = wizardReducer(state, { type: 'REDO' });
    expect(state.confirmation.confirmedPartKeys).toEqual([]);
  });
});
