import { PHASER_ATLAS_OPTIONS, PHASER_ATLAS_PAGE_SIZES } from '@/features/export/domain/phaserAtlasContract.js';

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
import { Switch } from '@/components/ui/switch.jsx';



export function PhaserAtlasExportOptions({ frame, animations }) {
  return (
    <>
      <div className="rounded border border-blue-200 bg-blue-50 p-3 text-xs text-blue-900 dark:border-blue-800 dark:bg-blue-950/30 dark:text-blue-100">
        <div className="font-medium">Phaser 4.2.1 — Texture Atlas (Baked)</div>
        <p className="mt-1 text-[11px] opacity-80">
          Bones, deformations, physics and modifiers are baked into frame pixels.
          No Phaser plugin required.
        </p>
      </div>

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
              min={PHASER_ATLAS_OPTIONS.fps.min}
              max={PHASER_ATLAS_OPTIONS.fps.max}
              onChange={event => frame.setExportFps(
                Math.min(PHASER_ATLAS_OPTIONS.fps.max, Math.max(PHASER_ATLAS_OPTIONS.fps.min, Number(event.target.value))),
              )}
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

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Output scale (%)</Label>
            <Input
              type="number"
              className="h-8 text-xs"
              value={frame.outputScale}
              min={PHASER_ATLAS_OPTIONS.scale.min}
              max={PHASER_ATLAS_OPTIONS.scale.max}
              onChange={event => frame.setOutputScale(
                Math.min(PHASER_ATLAS_OPTIONS.scale.max, Math.max(PHASER_ATLAS_OPTIONS.scale.min, Number(event.target.value))),
              )}
              disabled={frame.isExporting}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Padding (px)</Label>
            <Input
              type="number"
              className="h-8 text-xs"
              value={frame.padding}
              min={PHASER_ATLAS_OPTIONS.padding.min}
              max={PHASER_ATLAS_OPTIONS.padding.max}
              onChange={event => frame.setPadding(
                Math.min(PHASER_ATLAS_OPTIONS.padding.max, Math.max(PHASER_ATLAS_OPTIONS.padding.min, Math.floor(Number(event.target.value)))),
              )}
              disabled={frame.isExporting}
            />
          </div>
        </div>
      </div>

      <Separator />

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label className="text-xs text-muted-foreground">Trim transparent pixels</Label>
          <Switch
            checked={frame.trim}
            onCheckedChange={frame.setTrim}
            disabled={frame.isExporting}
          />
        </div>

        <div className="flex items-center justify-between">
          <Label className="text-xs text-muted-foreground">Loop animation</Label>
          <Switch
            checked={frame.loop}
            onCheckedChange={frame.setLoop}
            disabled={frame.isExporting}
          />
        </div>

        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Max page size</Label>
          <Select
            value={String(frame.maxPageSize)}
            onValueChange={value => frame.setMaxPageSize(Number(value))}
            disabled={frame.isExporting}
          >
            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              {PHASER_ATLAS_PAGE_SIZES.map(size => (
                <SelectItem key={size} value={String(size)}>{size}×{size}</SelectItem>
              ))}
            </SelectContent>
          </Select>
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
          <Destination value="zip" label="ZIP file" disabled={frame.isExporting} />
          <Destination
            value="folder"
            label={frame.hasFolderSupport ? 'Folder' : 'Folder (not supported)'}
            disabled={!frame.hasFolderSupport || frame.isExporting}
          />
        </RadioGroup>
        <p className="text-[11px] text-muted-foreground">
          {frame.totalFrameCount > 0 ? 'Multi-file package' : 'No frames to export'}
        </p>
      </div>
    </>
  );
}

function Destination({ value, label, disabled }) {
  const id = `phaser-dest-${value}`;
  return (
    <div className="flex items-center gap-1.5">
      <RadioGroupItem value={value} id={id} disabled={disabled} />
      <Label htmlFor={id} className={cn('text-xs cursor-pointer', disabled && 'opacity-40 cursor-not-allowed')}>
        {label}
      </Label>
    </div>
  );
}
