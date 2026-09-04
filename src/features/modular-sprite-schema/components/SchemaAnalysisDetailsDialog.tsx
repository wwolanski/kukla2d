import type { AnalyzerResult, MetricValue, ModularSpriteSchema, SchemaComparisonResult } from '@kukla2d/modular-sprite-schema';

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';

const UiDialog = Dialog as React.ComponentType<{ open: boolean; onOpenChange: (open: boolean) => void; children: React.ReactNode }>;
const UiDialogContent = DialogContent as React.ComponentType<{ className?: string; children: React.ReactNode }>;
const UiDialogDescription = DialogDescription as React.ComponentType<{ children: React.ReactNode }>;
const UiDialogHeader = DialogHeader as React.ComponentType<{ className?: string; children: React.ReactNode }>;
const UiDialogTitle = DialogTitle as React.ComponentType<{ children: React.ReactNode }>;

const ANALYZER_INFO: Record<string, { name: string; description: string }> = {
  'canvas.aspect-ratio': { name: 'Canvas proportions', description: 'Compares the width-to-height ratio of the complete uploaded image with the reference image.' },
  'islands.count': { name: 'Detected island count', description: 'Compares how many disconnected foreground regions were detected and expected.' },
  'parts.component-count': { name: 'Islands per part', description: 'Checks how many detected islands were assigned to each semantic part.' },
  'parts.position': { name: 'Part positions', description: 'Compares normalized component centroids. X and Y range from 0 at the top-left to 1 at the bottom-right.' },
  'parts.bounds-overlap': { name: 'Part bounds overlap', description: 'Compares expected and actual bounding rectangles using intersection over union (IoU).' },
  'parts.absolute-size': { name: 'Part sizes', description: 'Compares foreground area relative to the complete canvas, independently of image resolution.' },
  'parts.aspect-ratio': { name: 'Part proportions', description: 'Compares the width-to-height ratio of each assigned part.' },
  'parts.shape': { name: 'Part shapes', description: 'Compares normalized 32×32 binary silhouettes. Color and texture are ignored.' },
  'relations.size-ratio': { name: 'Size relations between parts', description: 'Compares ratios such as left foot / right foot or head / torso. A value of 1 means equal size.' },
  'assignment.coverage': { name: 'Assignment coverage', description: 'Reports missing required or optional slots and foreground islands not assigned to the schema.' },
};

const percent = (basisPoints: number): string => `${(basisPoints / 100).toFixed(2)}%`;

function formatNumber(value: number): string {
  if (Number.isInteger(value)) return String(value);
  return value.toFixed(8).replace(/0+$/, '').replace(/\.$/, '');
}

function formatValue(value: MetricValue | undefined): string {
  if (value === undefined) return '—';
  if (typeof value === 'number') return formatNumber(value);
  if (typeof value === 'string' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) return value.map(formatNumber).join(', ');
  return Object.entries(value).map(([key, item]) => `${key}: ${typeof item === 'number' ? formatNumber(item) : String(item)}`).join(', ');
}

function AnalyzerDetails({ analyzer }: { analyzer: AnalyzerResult }): React.ReactElement {
  const info = ANALYZER_INFO[analyzer.analyzerId] ?? { name: analyzer.analyzerId, description: 'No additional description is available for this analyzer.' };
  return (
    <details className="rounded-lg border" open>
      <summary className="cursor-pointer px-4 py-3">
        <span className="font-medium">{info.name}</span>
        <span className="ml-2 text-xs text-muted-foreground">{analyzer.analyzerId} · v{analyzer.analyzerVersion}</span>
        <span className="float-right font-mono text-sm">{analyzer.status === 'scored' ? percent(analyzer.scoreBp) : analyzer.status}</span>
      </summary>
      <div className="space-y-3 border-t px-4 py-3">
        <p className="text-sm text-muted-foreground">{info.description}</p>
        <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted-foreground">
          <span>Weight: {analyzer.weightBp} bp</span>
          <span>Threshold result: {analyzer.passed ? 'passed' : 'failed'}</span>
          <span>Status: {analyzer.status}</span>
        </div>
        {analyzer.checks.length > 0 ? (
          <div className="overflow-x-auto rounded border">
            <table className="w-full min-w-[760px] border-collapse text-left text-xs">
              <thead className="bg-muted/60"><tr><th className="p-2">Check</th><th className="p-2">Expected</th><th className="p-2">Actual</th><th className="p-2">Tolerance</th><th className="p-2 text-right">Score</th><th className="p-2">Result</th></tr></thead>
              <tbody>{analyzer.checks.map(check => (
                <tr key={check.id} className="border-t align-top">
                  <td className="p-2"><div className="font-medium">{check.label}</div><div className="font-mono text-[10px] text-muted-foreground">{check.id}</div></td>
                  <td className="max-w-52 p-2 font-mono">{formatValue(check.expected)}</td>
                  <td className="max-w-52 p-2 font-mono">{formatValue(check.actual)}</td>
                  <td className="max-w-40 p-2 font-mono">{formatValue(check.tolerance)}</td>
                  <td className="p-2 text-right font-mono">{percent(check.scoreBp)}</td>
                  <td className={`p-2 font-medium ${check.passed ? 'text-emerald-500' : 'text-amber-500'}`}>{check.passed ? 'Pass' : 'Fail'}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        ) : <p className="text-xs text-muted-foreground">This analyzer did not produce individual checks.</p>}
        {analyzer.diagnostics.map(diagnostic => <p key={`${diagnostic.code}-${diagnostic.message}`} className="rounded bg-muted p-2 text-xs"><span className="font-mono">{diagnostic.code}</span>: {diagnostic.message}</p>)}
      </div>
    </details>
  );
}

export function SchemaAnalysisDetailsDialog({ match, schema, onClose }: { match: SchemaComparisonResult | null; schema?: ModularSpriteSchema; onClose: () => void }): React.ReactElement {
  return (
    <UiDialog open={match !== null} onOpenChange={open => { if (!open) onClose(); }}>
      <UiDialogContent className="flex max-h-[90vh] w-[min(1100px,95vw)] max-w-none flex-col overflow-hidden">
        <UiDialogHeader>
          <UiDialogTitle>Schema comparison details</UiDialogTitle>
          <UiDialogDescription>Raw measurements and explanations for {schema?.name ?? match?.schemaId ?? 'the selected schema'}.</UiDialogDescription>
        </UiDialogHeader>
        {match && <div className="min-h-0 space-y-4 overflow-auto pr-1">
          <section className="grid grid-cols-2 gap-3 rounded-lg border p-4 text-sm sm:grid-cols-4">
            <div><div className="text-xs text-muted-foreground">Similarity</div><div className="font-mono text-lg">{percent(match.similarityBp)}</div></div>
            <div><div className="text-xs text-muted-foreground">Confidence</div><div className="capitalize">{match.confidence}</div></div>
            <div><div className="text-xs text-muted-foreground">Verdict</div><div className="capitalize">{match.verdict.replace('-', ' ')}</div></div>
            <div><div className="text-xs text-muted-foreground">Schema revision</div><div className="font-mono">{match.schemaRevision}</div></div>
          </section>
          <section className="rounded-lg border p-4">
            <h3 className="font-medium">Slot assignment</h3>
            <p className="mt-1 text-xs text-muted-foreground">Component IDs correspond to the numbered region outlines shown in the preview.</p>
            <div className="mt-3 grid gap-1">{match.assignments.map(assignment => <div key={assignment.slotKey} className="grid grid-cols-[1fr_1fr_auto] gap-3 border-t py-2 text-xs first:border-0"><span>{schema?.slots.find(slot => slot.slotKey === assignment.slotKey)?.label ?? assignment.slotKey}</span><span className="font-mono">Regions: {assignment.componentIds.join(', ') || 'none'}</span><span className="font-mono">{percent(assignment.scoreBp)}</span></div>)}</div>
          </section>
          {match.analyzers.map(analyzer => <AnalyzerDetails key={analyzer.analyzerId} analyzer={analyzer} />)}
        </div>}
      </UiDialogContent>
    </UiDialog>
  );
}
