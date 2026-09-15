import { cn } from '@/lib/utils.js';

import { Input } from '@/components/ui/input.jsx';
import { Label } from '@/components/ui/label.jsx';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group.jsx';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select.jsx';
import { Separator } from '@/components/ui/separator.jsx';


export function FrameExportOptions({ frame, animations }) {
  return (
    <>
      <Separator />

      <div className="space-y-3">
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Animation</Label>
          <Select value={frame.animTarget} onValueChange={frame.setAnimTarget} disabled={frame.isExporting}>
            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              {animations.length === 0 && <SelectItem value="staging">Staging</SelectItem>}
              {animations.map(animation => (
                <SelectItem key={animation.id} value={animation.id}>{animation.name}</SelectItem>
              ))}
              {animations.length > 1 && <SelectItem value="all">All animations</SelectItem>}
            </SelectContent>
          </Select>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">FPS</Label>
            <Input
              type="number"
              className="h-8 text-xs"
              value={frame.exportFps}
              min={1}
              max={120}
              onChange={event => frame.setExportFps(Math.min(120, Math.max(1, Number(event.target.value))))}
              disabled={frame.isExporting}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Frames</Label>
            <div className="h-8 rounded border border-input px-3 flex items-center text-xs text-muted-foreground">
              {frame.totalFrameCount}
            </div>
          </div>
        </div>

        {frame.type === 'spritesheet' && (
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Spritesheet layout</Label>
            <Select
              value={String(frame.spriteSheetColumns)}
              onValueChange={value => frame.setSpriteSheetColumns(Number(value))}
              disabled={frame.isExporting}
            >
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {frame.spriteSheetLayouts.map(layout => (
                  <SelectItem key={layout.columns} value={String(layout.columns)}>
                    {layout.columns} × {layout.rows}
                    {layout.recommended ? ' — Recommended' : ''}
                    {layout.capacity > frame.maxFrameCount ? ` (${layout.capacity - frame.maxFrameCount} empty)` : ''}
                    {` — ${layout.sheetWidth}×${layout.sheetHeight}px`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-[11px] text-muted-foreground">
              {frame.spriteSheetColumns * (frame.spriteSheetLayouts.find(item => item.columns === frame.spriteSheetColumns)?.rows ?? 1)} slots; layout adapts per animation.
            </p>
          </div>
        )}
      </div>

      <Separator />

      <div className="space-y-3">
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Output scale (%)</Label>
          <Input
            type="number"
            className="h-8 text-xs"
            value={frame.outputScale}
            min={1}
            max={400}
            onChange={event => frame.setOutputScale(Math.min(400, Math.max(1, Number(event.target.value))))}
            disabled={frame.isExporting}
          />
        </div>

        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Background</Label>
          <div className="flex items-center gap-2">
            <Select value={frame.bgMode} onValueChange={frame.setBgMode} disabled={frame.isExporting}>
              <SelectTrigger className="h-8 text-xs flex-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="transparent">Transparent</SelectItem>
                <SelectItem value="custom">Custom color</SelectItem>
              </SelectContent>
            </Select>
            {frame.bgMode === 'custom' && (
              <input
                type="color"
                value={frame.bgColor}
                className="h-8 w-10 rounded border border-input cursor-pointer p-0.5 bg-background"
                onChange={event => frame.setBgColor(event.target.value)}
                disabled={frame.isExporting}
              />
            )}
          </div>
        </div>
      </div>

      <Separator />

      <div className="space-y-2">
        <Label className="text-xs text-muted-foreground">Export to</Label>
        <RadioGroup
          value={frame.exportDest}
          onValueChange={frame.setExportDest}
          disabled={frame.isExporting}
          className="flex flex-wrap gap-4"
        >
          <Destination value="download" label="Single file" disabled={!frame.canDownloadSingleFile || frame.isExporting} />
          <Destination value="zip" label="ZIP file" disabled={frame.isExporting} />
          <Destination
            value="folder"
            label={frame.hasFolderSupport ? 'Folder' : 'Folder (not supported)'}
            disabled={!frame.hasFolderSupport || frame.isExporting}
          />
        </RadioGroup>
        <p className="text-[11px] text-muted-foreground">
          {frame.expectedArtifactCount} output {frame.expectedArtifactCount === 1 ? 'file' : 'files'}
        </p>
      </div>
    </>
  );
}

function Destination({ value, label, disabled }) {
  const id = `dest-${value}`;
  return (
    <div className="flex items-center gap-1.5">
      <RadioGroupItem value={value} id={id} disabled={disabled} />
      <Label htmlFor={id} className={cn('text-xs cursor-pointer', disabled && 'opacity-40 cursor-not-allowed')}>
        {label}
      </Label>
    </div>
  );
}
