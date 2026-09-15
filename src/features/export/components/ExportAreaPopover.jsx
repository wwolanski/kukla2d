import { Move, SquareChartGantt } from "lucide-react";
import { useCallback, useState, useEffect, useRef } from "react";

import { useAnimationStore } from "@/store/animationStore.js";
import { useEditorStore } from "@/store/editorStore.js";
import { useProjectStore } from "@/store/projectStore.js";

import { computeEvaluatedExportBounds } from "@/features/export/domain/computeEvaluatedExportBounds.js";
import { buildExportAreaFitFrameSpecs } from "@/features/export/domain/exportAreaFitFrameSpecs.js";
import {
  EXPORT_AREA_PRESETS,
  CUSTOM_PRESET_ID,
  matchExportAreaPreset,
  createExportAreaPresetPatch,
} from "@/features/export/domain/exportAreaPresets.js";

import { cn } from "@/lib/utils.js";

import { Button } from "@/components/ui/button.jsx";
import { Input } from "@/components/ui/input.jsx";
import { Label } from "@/components/ui/label.jsx";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover.jsx";
import {
  Select,
  SelectGroup,
  SelectValue,
  SelectTrigger,
  SelectContent,
  SelectLabel,
  SelectItem,
  SelectSeparator,
} from "@/components/ui/select.jsx";
import { Switch } from "@/components/ui/switch.jsx";
import { toast } from "@/components/ui/use-toast.js";

export function ExportAreaPopover() {
  const [open, setOpen] = useState(false);
  const showExportArea = useEditorStore((s) => s.showExportArea);
  const setShowExportArea = useEditorStore((s) => s.setShowExportArea);
  const exportAreaMoveMode = useEditorStore((s) => s.exportAreaMoveMode);
  const setExportAreaMoveMode = useEditorStore((s) => s.setExportAreaMoveMode);
  const popoverRequest = useEditorStore((s) => s.exportAreaPopoverRequest);
  const activeAnimationId = useAnimationStore((s) => s.activeAnimationId);
  const canvas = useProjectStore((s) => s.project.canvas);
  const updateCanvas = useProjectStore((s) => s.updateCanvas);
  const project = useProjectStore((s) => s.project);
  const lastPopoverRequestRef = useRef(popoverRequest);

  const [widthDraft, setWidthDraft] = useState(String(canvas.width));
  const [heightDraft, setHeightDraft] = useState(String(canvas.height));

  useEffect(() => {
    setWidthDraft(String(canvas.width));
    setHeightDraft(String(canvas.height));
  }, [canvas.width, canvas.height]);

  useEffect(() => {
    if (popoverRequest === lastPopoverRequestRef.current) return;
    lastPopoverRequestRef.current = popoverRequest;
    setOpen(true);
  }, [popoverRequest]);

  const currentPresetId = matchExportAreaPreset(canvas);
  const isCustom = currentPresetId === CUSTOM_PRESET_ID;
  const groups = [...new Set(EXPORT_AREA_PRESETS.map((p) => p.group))];
  const fitAnimation =
    canvas.fitSource?.kind === "animation"
      ? project.animations?.find(
          (animation) => animation.id === canvas.fitSource.animationId,
        )
      : null;
  const fitSourceLabel =
    canvas.fitSource?.kind === "animation"
      ? `Based on ${fitAnimation?.name ?? canvas.fitSource.animationName}`
      : canvas.fitSource?.kind === "staging"
        ? "Based on Staging composition"
        : null;
  const currentPresetLabel = isCustom
    ? `Custom${fitSourceLabel ? ` — ${fitSourceLabel}` : ""}`
    : EXPORT_AREA_PRESETS.find((preset) => preset.id === currentPresetId)
        ?.label;

  const commitWidth = useCallback(() => {
    const val = Number(widthDraft);
    if (Number.isInteger(val) && val >= 1) {
      updateCanvas({ width: val, presetId: CUSTOM_PRESET_ID, fitSource: null });
    } else {
      setWidthDraft(String(canvas.width));
    }
  }, [widthDraft, canvas.width, updateCanvas]);

  const commitHeight = useCallback(() => {
    const val = Number(heightDraft);
    if (Number.isInteger(val) && val >= 1) {
      updateCanvas({
        height: val,
        presetId: CUSTOM_PRESET_ID,
        fitSource: null,
      });
    } else {
      setHeightDraft(String(canvas.height));
    }
  }, [heightDraft, canvas.height, updateCanvas]);

  const handlePresetChange = useCallback(
    (value) => {
      if (value === CUSTOM_PRESET_ID) {
        updateCanvas({ presetId: CUSTOM_PRESET_ID, fitSource: null });
        return;
      }
      try {
        updateCanvas({
          ...createExportAreaPresetPatch(value),
          presetId: value,
          fitSource: null,
        });
      } catch (error) {
        console.error("[Export area] Failed to apply preset:", error);
        toast({
          title: "Export area not updated",
          description: "The selected preset could not be applied. Try again.",
          duration: 3000,
        });
      }
    },
    [updateCanvas],
  );

  const handleFit = useCallback(() => {
    const animations = Array.isArray(project.animations)
      ? project.animations
      : [];
    const animation =
      animations.find((item) => item?.id === activeAnimationId) ??
      animations.find(
        (item) => typeof item?.id === "string" && item.id.length > 0,
      ) ??
      null;
    const frameSpecs = animation
      ? buildExportAreaFitFrameSpecs(project, { animationId: animation.id })
      : buildExportAreaFitFrameSpecs({ ...project, animations: [] });
    const result = computeEvaluatedExportBounds({
      project,
      frameSpecs,
      padding: 20,
    });
    if (result.ok) {
      updateCanvas({
        ...result.area,
        presetId: CUSTOM_PRESET_ID,
        fitSource: animation
          ? {
              kind: "animation",
              animationId: animation.id,
              animationName: animation.name ?? animation.id,
            }
          : { kind: "staging" },
      });
    } else {
      toast({
        title: "No visible content",
        description:
          "Add visible parts with mesh to compute export area bounds.",
        duration: 3000,
      });
    }
  }, [activeAnimationId, project, updateCanvas]);

  const handleKeyDown = useCallback(
    (e, commit) => {
      if (e.key === "Enter") commit();
      if (e.key === "Escape") {
        setWidthDraft(String(canvas.width));
        setHeightDraft(String(canvas.height));
      }
    },
    [canvas],
  );

  const handleMove = useCallback(() => {
    const animation = useAnimationStore.getState();
    if (animation.isPlaying) animation.pause();
    setOpen(false);
    setExportAreaMoveMode(true);
  }, [setExportAreaMoveMode]);
  const handleOpenChange = useCallback(
    (nextOpen) => {
      if (nextOpen && exportAreaMoveMode) setExportAreaMoveMode(false);
      setOpen(nextOpen);
    },
    [exportAreaMoveMode, setExportAreaMoveMode],
  );

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-pressed={exportAreaMoveMode}
          className={cn(
            "h-full w-9 rounded-none border-l hover:bg-muted",
            exportAreaMoveMode &&
              "border-primary bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground",
          )}
          title="Export Area"
        >
          <SquareChartGantt className="h-4 w-4" />
        </Button>
      </PopoverTrigger>

      <PopoverContent className="w-64 p-4 space-y-3 shadow-2xl border-border/60">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Export Area
        </p>

        <p className="text-[10px] text-muted-foreground/70 font-mono">
          {canvas.width} x {canvas.height} px
        </p>

        <div className="flex items-center justify-between">
          <Label
            htmlFor="export-area-visibility"
            className="text-xs cursor-pointer"
          >
            Show export area
          </Label>
          <Switch
            id="export-area-visibility"
            checked={showExportArea}
            onCheckedChange={setShowExportArea}
          />
        </div>

        <div className="space-y-1">
          <Label
            htmlFor="export-area-size-preset"
            className="text-xs text-muted-foreground"
          >
            Size preset
          </Label>
          <Select value={currentPresetId} onValueChange={handlePresetChange}>
            <SelectTrigger
              id="export-area-size-preset"
              className="h-8 border-border/90 bg-muted/30 text-xs"
            >
              <SelectValue>{currentPresetLabel}</SelectValue>
            </SelectTrigger>
            <SelectContent className="border-border/90 shadow-xl">
              <SelectItem
                value={CUSTOM_PRESET_ID}
                className="py-2 text-xs font-medium"
              >
                {fitSourceLabel ? `Custom · ${fitSourceLabel}` : "Custom"}
              </SelectItem>
              <SelectSeparator className="my-1.5" />
              {groups.map((group) => (
                <SelectGroup key={group}>
                  <SelectLabel className="mt-1 bg-muted/60 py-1 pl-3 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                    {group}
                  </SelectLabel>
                  {EXPORT_AREA_PRESETS.filter((p) => p.group === group).map(
                    (preset) => (
                      <SelectItem
                        key={preset.id}
                        value={preset.id}
                        className="py-1.5 text-xs"
                      >
                        {preset.label}
                      </SelectItem>
                    ),
                  )}
                </SelectGroup>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <Label
              htmlFor="export-area-width"
              className="text-xs text-muted-foreground"
            >
              Width
            </Label>
            <Input
              id="export-area-width"
              type="number"
              className="h-7 text-xs"
              value={widthDraft}
              min={1}
              disabled={!isCustom}
              onChange={(e) => setWidthDraft(e.target.value)}
              onBlur={commitWidth}
              onKeyDown={(e) => handleKeyDown(e, commitWidth)}
            />
          </div>
          <div className="space-y-1">
            <Label
              htmlFor="export-area-height"
              className="text-xs text-muted-foreground"
            >
              Height
            </Label>
            <Input
              id="export-area-height"
              type="number"
              className="h-7 text-xs"
              value={heightDraft}
              min={1}
              disabled={!isCustom}
              onChange={(e) => setHeightDraft(e.target.value)}
              onBlur={commitHeight}
              onKeyDown={(e) => handleKeyDown(e, commitHeight)}
            />
          </div>
        </div>

        <Button
          variant="outline"
          size="sm"
          className="w-full gap-2 text-xs h-7"
          aria-pressed={exportAreaMoveMode}
          onClick={handleMove}
        >
          <Move className="h-3.5 w-3.5" />
          Move
        </Button>

        <div className="border-t border-border/50" />

        <Button
          variant="outline"
          size="sm"
          className="w-full text-xs h-7"
          onClick={handleFit}
        >
          Fit to minimum animation area
        </Button>
      </PopoverContent>
    </Popover>
  );
}
