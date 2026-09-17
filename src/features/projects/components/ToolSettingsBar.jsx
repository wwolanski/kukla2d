import { SlidersHorizontal } from 'lucide-react';
import { useMemo } from 'react';

import { useEditorStore } from '@/store/editorStore.js';
import { useProjectStore } from '@/store/projectStore.js';

import { useWorkflowSelector, WEIGHT_PAINT_MODES } from '@/features/canvas/index.js';

import { cn } from '@/lib/utils.js';

import { Button } from '@/components/ui/button.jsx';
import { Label } from '@/components/ui/label.jsx';
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from '@/components/ui/select.jsx';
import { Slider } from '@/components/ui/slider.jsx';
import { Switch } from '@/components/ui/switch.jsx';




function CompactSlider({ label, value, min, max, step = 1, onChange, width = 'w-28' }) {
  return (
    <label className="flex items-center gap-2 text-[11px] text-muted-foreground">
      <span className="whitespace-nowrap">{label}</span>
      <Slider
        min={min}
        max={max}
        step={step}
        value={[value]}
        onValueChange={([next]) => onChange(next)}
        className={width}
      />
      <span className="min-w-7 text-right tabular-nums text-foreground">{value}</span>
    </label>
  );
}

export function ToolSettingsBar() {
  const activeTool = useWorkflowSelector(s => s.context.activeTool);
  const meshEditMode = useWorkflowSelector(s => s.context.meshEditMode);
  const meshSubMode = useWorkflowSelector(s => s.context.meshSubMode);
  const selection = useEditorStore(s => s.selection);
  const brushSize = useEditorStore(s => s.brushSize);
  const brushHardness = useEditorStore(s => s.brushHardness);
  const weightPaintBoneId = useEditorStore(s => s.weightPaintBoneId);
  const weightPaintBrushMode = useEditorStore(s => s.weightPaintBrushMode);
  const weightPaintStrength = useEditorStore(s => s.weightPaintStrength);
  const weightPaintTargetValue = useEditorStore(s => s.weightPaintTargetValue);
  const setBrush = useEditorStore(s => s.setBrush);
  const setWeightPaintBoneId = useEditorStore(s => s.setWeightPaintBoneId);
  const setWeightPaintBrushMode = useEditorStore(s => s.setWeightPaintBrushMode);
  const setWeightPaintStrength = useEditorStore(s => s.setWeightPaintStrength);
  const setWeightPaintTargetValue = useEditorStore(s => s.setWeightPaintTargetValue);
  const drawBoneChainMode = useEditorStore(s => s.drawBoneChainMode);
  const drawBoneAutoAssign = useEditorStore(s => s.drawBoneAutoAssign);
  const drawBoneAutoAssignMode = useEditorStore(s => s.drawBoneAutoAssignMode);
  const setDrawBoneChainMode = useEditorStore(s => s.setDrawBoneChainMode);
  const setDrawBoneAutoAssign = useEditorStore(s => s.setDrawBoneAutoAssign);
  const setDrawBoneAutoAssignMode = useEditorStore(s => s.setDrawBoneAutoAssignMode);
  const editorMode = useEditorStore(s => s.editorMode);
  const skeletonEditMode = useEditorStore(s => s.skeletonEditMode);
  const setSkeletonEditMode = useEditorStore(s => s.setSkeletonEditMode);
  const nodes = useProjectStore(s => s.project.nodes ?? []);
  const bones = useProjectStore(s => s.project.bones ?? []);

  const selectedPart = useMemo(
    () => nodes.find(node => node.id === selection?.[0] && node.type === 'part'),
    [nodes, selection],
  );
  const hasMesh = !!selectedPart?.mesh?.vertices?.length;
  const showWeightPaint = activeTool === 'weightPaint' && hasMesh;
  const showMeshBrush = activeTool === 'meshDeform' && meshEditMode && meshSubMode === 'deform' && hasMesh;
  const showDrawBone = activeTool === 'drawBone';

  if (!showWeightPaint && !showMeshBrush && !showDrawBone) return null;

  return (
    <div className="absolute left-1/2 top-3 z-50 flex min-h-9 max-w-[calc(100%-7rem)] -translate-x-1/2 items-center gap-2 rounded-md border border-border/70 bg-background/95 px-2 py-1 shadow-xl backdrop-blur">
      <SlidersHorizontal className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />

      {showWeightPaint && (
        <>
          <select
            aria-label="Weight paint bone"
            value={weightPaintBoneId ?? ''}
            onChange={(event) => setWeightPaintBoneId(event.target.value || null)}
            className="h-7 max-w-36 rounded border border-border bg-background px-2 text-xs text-foreground outline-none focus:ring-1 focus:ring-ring"
          >
            <option value="">{bones.length === 0 ? 'No bones' : 'Bone'}</option>
            {bones.map(bone => (
              <option key={bone.id} value={bone.id}>{bone.name ?? bone.id}</option>
            ))}
          </select>

          <div className="flex items-center gap-1">
            {WEIGHT_PAINT_MODES.map(mode => (
              <Button
                key={mode}
                type="button"
                size="sm"
                variant={weightPaintBrushMode === mode ? 'default' : 'outline'}
                className={cn('h-7 px-2 text-[11px] capitalize')}
                onClick={() => setWeightPaintBrushMode(mode)}
              >
                {mode}
              </Button>
            ))}
          </div>
        </>
      )}

      {showDrawBone && (
        <>
          {editorMode === 'staging' && (
            <Label className="flex items-center gap-2 text-[11px]" htmlFor="edit-joints">
              <span>Edit joints</span>
              <Switch id="edit-joints" checked={skeletonEditMode} onCheckedChange={setSkeletonEditMode} />
            </Label>
          )}
          <Label className="flex items-center gap-2 text-[11px]" htmlFor="chain-mode">
            <span>Chain</span>
            <Switch id="chain-mode" checked={drawBoneChainMode} onCheckedChange={setDrawBoneChainMode} />
          </Label>
          <Label className="flex items-center gap-2 text-[11px]" htmlFor="auto-assign">
            <span>Auto-assign</span>
            <Switch id="auto-assign" checked={drawBoneAutoAssign} onCheckedChange={setDrawBoneAutoAssign} />
          </Label>
          <div className="flex items-center gap-2 text-[11px]">
            <span className="text-muted-foreground">Mode</span>
            <Select
              value={drawBoneAutoAssignMode}
              onValueChange={setDrawBoneAutoAssignMode}
              disabled={!drawBoneAutoAssign}
            >
              <SelectTrigger className="h-7 w-24 px-2 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="smart">Smart</SelectItem>
                <SelectItem value="classic">Classic</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </>
      )}

      {(showWeightPaint || showMeshBrush) && (
        <>
          <CompactSlider
            label="Size"
            value={brushSize ?? 30}
            min={5}
            max={300}
            onChange={(value) => setBrush({ brushSize: value })}
          />
          <CompactSlider
            label="Hard"
            value={Math.round((brushHardness ?? 0) * 100)}
            min={0}
            max={100}
            onChange={(value) => setBrush({ brushHardness: value / 100 })}
            width="w-24"
          />
        </>
      )}

      {showWeightPaint && (
        <CompactSlider
          label="Strength"
          value={Math.round((weightPaintStrength ?? 0) * 100)}
          min={0}
          max={100}
          onChange={(value) => setWeightPaintStrength(value / 100)}
        />
      )}

      {showWeightPaint && weightPaintBrushMode === 'replace' && (
        <CompactSlider
          label="Target"
          value={Math.round((weightPaintTargetValue ?? 0) * 100)}
          min={0}
          max={100}
          onChange={(value) => setWeightPaintTargetValue(value / 100)}
          width="w-24"
        />
      )}
    </div>
  );
}
