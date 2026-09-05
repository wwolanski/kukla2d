import { Merge, MousePointer2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

import { PartThumbnail } from '../preview/PartThumbnail.js';

import type { ModularSpriteDraftPart, ProcessedModularSprite } from '../../domain/contracts.js';
import type { RegionGrouping } from '../../domain/partGrouping.js';

const UiButton = Button as React.ComponentType<React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: string; size?: string }>;
const UiInput = Input as React.ComponentType<React.InputHTMLAttributes<HTMLInputElement>>;
const PART_COLORS = ['#38bdf8', '#f472b6', '#a3e635', '#fbbf24', '#c084fc', '#fb7185', '#4ade80', '#fb923c', '#2dd4bf', '#e879f9'];

function partColor(parts: readonly ModularSpriteDraftPart[], partKey: string): string {
  const index = parts.findIndex(part => part.partKey === partKey);
  return PART_COLORS[(index < 0 ? 0 : index) % PART_COLORS.length]!;
}

export function RegionGroupingStep({
  result,
  grouping,
  resultRef,
  resultVersion,
  selectedRegionIds,
  assignmentPartKey,
  onToolSelect,
  onAssignmentPartKeyChange,
  onAssign,
  onMerge,
  onExclude,
  onSelectRegion,
  onUpdatePart,
}: {
  result: ProcessedModularSprite;
  grouping: RegionGrouping;
  resultRef: React.RefObject<ProcessedModularSprite | null>;
  resultVersion: number;
  selectedRegionIds: ReadonlySet<number>;
  assignmentPartKey: string;
  onToolSelect: () => void;
  onAssignmentPartKeyChange: (value: string) => void;
  onAssign: () => void;
  onMerge: () => void;
  onExclude: () => void;
  onSelectRegion: (regionId: number, additive: boolean) => void;
  onUpdatePart: (index: number, change: Partial<ModularSpriteDraftPart>) => void;
}): React.ReactElement {
  const assigned = new Set(grouping.parts.flatMap(part => part.regionIds));
  const excluded = result.regions.filter(region => !assigned.has(region.id));
  return (
    <aside className="space-y-4 overflow-auto rounded-lg border p-4">
      <p className="text-xs text-muted-foreground">Group detected regions into the images that should be imported as parts. Part names come from detection or schema matching; correct them directly in the tree when needed. Anatomical roles are reviewed in the next step. Shift-click selects several regions.</p>
      <UiButton className="w-full" size="sm" variant="default" onClick={onToolSelect}><MousePointer2 className="mr-1 h-4 w-4" />Select</UiButton>
      <label className="grid gap-1 text-xs text-muted-foreground">Existing target part<select className="h-9 w-full rounded-md border bg-background px-2 text-xs" value={assignmentPartKey} onChange={event => onAssignmentPartKeyChange(event.target.value)}>
        <option value="">Choose an existing part…</option>
        {grouping.parts.map(part => <option key={part.partKey} value={part.partKey}>{part.name}</option>)}
      </select></label>
      <UiButton className="w-full" size="sm" variant="outline" disabled={!assignmentPartKey || selectedRegionIds.size === 0} onClick={onAssign}>Move selection to target part</UiButton>
      <UiButton className="w-full" size="sm" variant="outline" disabled={selectedRegionIds.size < 2} onClick={onMerge}><Merge className="mr-1 h-4 w-4" />Create new part from selection</UiButton>
      <UiButton className="w-full" size="sm" variant="outline" disabled={selectedRegionIds.size === 0} onClick={onExclude}>Exclude selection from import</UiButton>
      <p className="text-[11px] text-muted-foreground">Excluded regions stay visible in muted gray so you can select them and move them back into a part. They will not be imported.</p>
      <div className="space-y-2 border-t pt-3">
        <div className="text-xs font-medium">Parts and regions</div>
        {grouping.parts.map((part, partIndex) => {
          const color = partColor(grouping.parts, part.partKey);
          return (
            <div key={part.partKey} className="overflow-hidden rounded-md border bg-muted/10">
              <div className="flex items-center gap-2 border-b px-2 py-1.5 text-xs font-semibold">
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: color }} />
                <span className="shrink-0 text-muted-foreground">Part</span>
                <UiInput className="h-7 min-w-0 flex-1 px-2 text-xs font-medium" aria-label={`Name of part ${partIndex + 1}`} value={part.name} onChange={event => onUpdatePart(partIndex, { name: event.target.value })} />
                <span className="ml-auto font-normal text-muted-foreground">{part.regionIds.length} {part.regionIds.length === 1 ? 'region' : 'regions'}</span>
              </div>
              <ul className="ml-4 space-y-1 border-l py-1 pl-2 pr-1">
                {part.regionIds.map(regionId => {
                  const region = result.regions.find(item => item.id === regionId);
                  if (!region) return null;
                  const isSelected = selectedRegionIds.has(region.id);
                  return <li key={region.id}><button type="button" className={`flex min-h-10 w-full items-center gap-2 rounded border px-1.5 py-1 text-left text-xs ${isSelected ? 'border-primary bg-primary/10' : 'border-transparent hover:border-border hover:bg-muted/50'}`} onClick={event => onSelectRegion(region.id, event.shiftKey)}><span className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded border bg-black/30"><PartThumbnail resultRef={resultRef} resultVersion={resultVersion} regionIds={[region.id]} maxSize={30} /></span><span className="truncate">Region {region.id}</span></button></li>;
                })}
              </ul>
            </div>
          );
        })}
        {excluded.length > 0 && <div className="overflow-hidden rounded-md border border-slate-500/70 bg-slate-500/20 text-muted-foreground">
          <div className="flex items-center gap-2 border-b border-slate-500/50 px-2 py-1.5 text-xs font-semibold"><span className="h-2.5 w-2.5 shrink-0 rounded-full bg-slate-500" /><span>Excluded</span><span className="ml-auto font-normal">{excluded.length}</span></div>
          <ul className="ml-4 space-y-1 border-l border-slate-500/50 py-1 pl-2 pr-1">
            {excluded.map(region => { const isSelected = selectedRegionIds.has(region.id); return <li key={region.id}><button type="button" className={`flex min-h-10 w-full items-center gap-2 rounded border px-1.5 py-1 text-left text-xs ${isSelected ? 'border-primary bg-primary/10' : 'border-transparent hover:border-slate-500 hover:bg-slate-500/30'}`} onClick={event => onSelectRegion(region.id, event.shiftKey)}><span className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded border border-slate-500/60 bg-slate-700/40 opacity-70 grayscale"><PartThumbnail resultRef={resultRef} resultVersion={resultVersion} regionIds={[region.id]} maxSize={30} /></span><span className="truncate">Region {region.id}</span></button></li>; })}
          </ul>
        </div>}
      </div>
    </aside>
  );
}

