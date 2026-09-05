import type { ModularSpriteDraftPart } from '../../domain/contracts.js';

const PART_COLORS = ['#38bdf8', '#f472b6', '#a3e635', '#fbbf24', '#c084fc', '#fb7185', '#4ade80', '#fb923c', '#2dd4bf', '#e879f9'];

function partColor(parts: readonly ModularSpriteDraftPart[], partKey: string): string {
  const index = parts.findIndex(part => part.partKey === partKey);
  return PART_COLORS[(index < 0 ? 0 : index) % PART_COLORS.length]!;
}

export function ReviewStep({
  name,
  addToCanvas,
  parts,
  sourceType,
  onNameChange,
  onAddToCanvasChange,
}: {
  name: string;
  addToCanvas: boolean;
  parts: readonly ModularSpriteDraftPart[];
  sourceType?: string;
  onNameChange: (name: string) => void;
  onAddToCanvasChange: (value: boolean) => void;
}): React.ReactElement {
  return (
    <div className="mx-auto grid max-w-2xl gap-5">
      <label className="grid gap-1 text-xs text-muted-foreground">Set and folder name<input className="h-10 rounded-md border bg-background px-3 text-sm" value={name} onChange={event => onNameChange(event.target.value)} /></label>
      <label className="flex items-center gap-3 rounded-lg border p-4 text-sm"><input type="checkbox" checked={addToCanvas} onChange={event => onAddToCanvasChange(event.target.checked)} />Add arranged parts to canvas</label>
      <div className="rounded-lg border p-4"><div className="font-medium">{parts.length} parts ready</div><ul className="mt-2 grid grid-cols-2 gap-1 text-sm text-muted-foreground">{[...parts].sort((left, right) => left.order - right.order).map(part => <li key={part.partKey}><span className="mr-1 inline-block h-2 w-2 rounded-full align-middle" style={{ backgroundColor: partColor(parts, part.partKey) }} />{part.name} · {part.role} · {part.side}</li>)}</ul></div>
      {sourceType === 'image/jpeg' && <p className="rounded bg-amber-500/10 p-3 text-sm text-amber-500">JPEG compression can leave a colored halo around extracted parts.</p>}
    </div>
  );
}

