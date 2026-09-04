// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { SchemaComparisonResult } from '@kukla2d/modular-sprite-schema';

import { SchemaAnalysisDetailsDialog } from './SchemaAnalysisDetailsDialog.js';

vi.stubGlobal('ResizeObserver', class {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
});

const roots: ReturnType<typeof createRoot>[] = [];

afterEach(() => {
  act(() => { for (const root of roots.splice(0)) root.unmount(); });
  document.body.innerHTML = '';
});

describe('SchemaAnalysisDetailsDialog', () => {
  it('explains analyzers and renders expected and actual raw values', () => {
    const match: SchemaComparisonResult = {
      schemaId: 'schema', schemaRevision: 2, similarityBp: 9700, confidence: 'high', verdict: 'match', missingRequiredSlots: [], missingOptionalSlots: [], unmatchedComponentIds: [], assignments: [{ slotKey: 'left-foot', componentIds: [6], scoreBp: 9800 }],
      analyzers: [{ analyzerId: 'relations.size-ratio', analyzerVersion: 1, status: 'scored', scoreBp: 9700, passed: true, weightBp: 1000, diagnostics: [], checks: [{ id: 'left-right-foot', label: 'left-foot / right-foot', expected: { metric: 'foreground-area', left: .02, right: .02, ratio: 1 }, actual: { metric: 'foreground-area', left: .0194, right: .02, ratio: .97 }, tolerance: .12, scoreBp: 9700, passed: true }] }],
    };
    const host = document.createElement('div'); document.body.appendChild(host);
    const root = createRoot(host); roots.push(root);
    act(() => root.render(<SchemaAnalysisDetailsDialog match={match} onClose={() => {}} />));
    expect(document.body.textContent).toContain('Size relations between parts');
    expect(document.body.textContent).toContain('left-foot / right-foot');
    expect(document.body.textContent).toContain('0.97');
    expect(document.body.textContent).toContain('0.12');
    expect(document.body.textContent).toContain('Regions: 6');
  });
});
