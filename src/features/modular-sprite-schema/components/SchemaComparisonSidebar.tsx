import { Info } from 'lucide-react';
import { useState } from 'react';

import type { ModularSpriteSchema, SchemaComparisonResult } from '@kukla2d/modular-sprite-schema';

import { SchemaAnalysisDetailsDialog } from './SchemaAnalysisDetailsDialog.js';

const percent = (basisPoints: number): string => `${(basisPoints / 100).toFixed(2)}%`;

export function SchemaComparisonSidebar({ enabled, onEnabledChange, analyzing, progress, matches, schemas, appliedSchemaId, onApply }: { enabled: boolean; onEnabledChange: (value: boolean) => void; analyzing: boolean; progress: { completed: number; total: number }; matches: readonly SchemaComparisonResult[]; schemas: readonly ModularSpriteSchema[]; appliedSchemaId?: string; onApply: (match: SchemaComparisonResult) => void }): React.ReactElement {
  const [detailsMatch, setDetailsMatch] = useState<SchemaComparisonResult | null>(null);
  const byId = new Map(schemas.map(item => [item.schemaId, item]));
  const detailsSchema = detailsMatch ? byId.get(detailsMatch.schemaId) : undefined;

  return <>
    <aside className="space-y-3 overflow-auto rounded-lg border p-3">
      <label className="flex items-center justify-between gap-2 text-xs font-medium"><span>Auto-match schema</span><input type="checkbox" checked={enabled} onChange={event => onEnabledChange(event.target.checked)} /></label>
      {analyzing && <p className="text-xs text-muted-foreground">Analyzing… {progress.completed} / {progress.total} schemas</p>}
      {!analyzing && enabled && !matches.length && <p className="text-xs text-muted-foreground">No schemas compared yet.</p>}
      <div className="space-y-2">{matches.map(match => (
        <details key={`${match.schemaId}@${match.schemaRevision}`} className="rounded border p-2" open={match === matches[0]}>
          <summary className="cursor-pointer text-xs"><span className="font-medium">{byId.get(match.schemaId)?.name ?? match.schemaId}</span><span className="float-right">{percent(match.similarityBp)}</span><div className="mt-1 text-muted-foreground capitalize">{match.confidence} confidence · {match.verdict.replace('-', ' ')}</div></summary>
          <div className="mt-2 space-y-1 border-t pt-2">
            {match.analyzers.map(item => <div key={item.analyzerId} className="flex justify-between text-[11px]"><span>{item.analyzerId}</span><span>{item.status === 'scored' ? percent(item.scoreBp) : item.status}</span></div>)}
            {!!match.missingRequiredSlots.length && <p className="text-[11px] text-amber-500">Missing: {match.missingRequiredSlots.join(', ')}</p>}
            {!!match.unmatchedComponentIds.length && <p className="text-[11px] text-muted-foreground">Extra islands: {match.unmatchedComponentIds.join(', ')}</p>}
            <div className="mt-2 grid grid-cols-[36px_1fr] gap-2">
              <button type="button" className="flex h-8 items-center justify-center rounded border hover:bg-muted" title="Open detailed comparison report" aria-label={`Show details for ${byId.get(match.schemaId)?.name ?? match.schemaId}`} onClick={() => setDetailsMatch(match)}><Info className="h-4 w-4" /></button>
              <button type="button" className="h-8 rounded bg-primary px-2 text-xs text-primary-foreground disabled:opacity-50" disabled={appliedSchemaId === match.schemaId} onClick={() => onApply(match)}>{appliedSchemaId === match.schemaId ? 'Applied' : 'Apply schema'}</button>
            </div>
          </div>
        </details>
      ))}</div>
    </aside>
    <SchemaAnalysisDetailsDialog match={detailsMatch} {...(detailsSchema ? { schema: detailsSchema } : {})} onClose={() => setDetailsMatch(null)} />
  </>;
}
