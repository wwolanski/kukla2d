import {
  CircleOff,
  Eraser,
  MousePointer2,
  Paintbrush,
  Scissors,
  SlidersHorizontal,
  Trash2,
} from "lucide-react";
import { useState } from "react";

import { MODULAR_SPRITE_PROCESSING_CONFIG } from "@kukla2d/contracts";

import { cn } from "@/lib/utils";

import { Slider } from "@/components/ui/slider";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

import type { EditorTool } from "../preview/ModularSpritePreviewCanvas.types.js";

const UiSlider = Slider as React.ComponentType<{
  min?: number;
  max?: number;
  step?: number;
  value: number[];
  onValueChange: (value: number[]) => void;
  "aria-label"?: string;
  className?: string;
}>;
const UiTooltipContent = TooltipContent as React.ComponentType<{
  children: React.ReactNode;
  side?: string;
}>;

const TOUCHUP_TOOLS = [
  {
    tool: "select",
    label: "Select regions",
    description: "Select a detected region in the preview.",
    icon: MousePointer2,
  },
  {
    tool: "foreground",
    label: "Keep foreground",
    description: "Paint pixels that should remain part of the foreground.",
    icon: Paintbrush,
  },
  {
    tool: "background",
    label: "Erase background",
    description: "Paint pixels that should be removed from the foreground.",
    icon: Eraser,
  },
  {
    tool: "split",
    label: "Split regions",
    description: "Paint a separation through touching regions.",
    icon: Scissors,
  },
  {
    tool: "enclosed-fill",
    label: "Remove enclosed area",
    description: "Mark an enclosed key-colored pocket for removal.",
    icon: CircleOff,
  },
] as const satisfies ReadonlyArray<{
  tool: EditorTool;
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
}>;

export function TouchupToolbar({
  tool,
  brushRadius,
  enclosedChromaSeedCount,
  onToolChange,
  onBrushRadiusChange,
  onClearEnclosedAreas,
}: {
  tool: EditorTool;
  brushRadius: number;
  enclosedChromaSeedCount: number;
  onToolChange: (tool: EditorTool) => void;
  onBrushRadiusChange: (value: number) => void;
  onClearEnclosedAreas: () => void;
}): React.ReactElement {
  const [showBrushSettings, setShowBrushSettings] = useState(false);
  const brushParameter = MODULAR_SPRITE_PROCESSING_CONFIG.strokes.editorRadius;

  return (
    <TooltipProvider delayDuration={250}>
      <div
        className="flex flex-col items-center gap-1 rounded-md border border-border/70 bg-background/95 p-1 shadow-xl backdrop-blur"
        data-testid="modular-sprite-touchup-toolbar"
      >
        {TOUCHUP_TOOLS.map((item) => {
          const Icon = item.icon;
          const active = tool === item.tool;
          return (
            <Tooltip key={item.tool}>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  aria-label={item.label}
                  aria-pressed={active}
                  title={item.description}
                  onClick={() => onToolChange(item.tool)}
                  className={cn(
                    "flex h-8 w-8 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
                    active &&
                      "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground",
                  )}
                >
                  <Icon className="h-4 w-4" aria-hidden />
                </button>
              </TooltipTrigger>
              <UiTooltipContent side="right">
                <div className="grid gap-0.5">
                  <span>{item.label}</span>
                  <span className="text-xs text-muted-foreground">
                    {item.description}
                  </span>
                </div>
              </UiTooltipContent>
            </Tooltip>
          );
        })}

        <div className="my-1 h-px w-6 bg-border/70" />

        <div className="relative">
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                aria-label="Brush radius"
                aria-expanded={showBrushSettings}
                title="Brush radius"
                onClick={() => setShowBrushSettings((visible) => !visible)}
                className={cn(
                  "flex h-8 w-8 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
                  showBrushSettings && "bg-primary/15 text-primary",
                )}
              >
                <SlidersHorizontal className="h-4 w-4" aria-hidden />
              </button>
            </TooltipTrigger>
            <UiTooltipContent side="right">
              Brush radius: {(brushRadius * 100).toFixed(1)}%
            </UiTooltipContent>
          </Tooltip>
          {showBrushSettings && (
            <div className="absolute left-full top-0 z-30 ml-2 w-52 rounded-md border border-border/70 bg-background/95 p-3 shadow-xl backdrop-blur">
              <div className="mb-2 flex items-center justify-between gap-2 text-xs">
                <span className="text-muted-foreground">Brush radius</span>
                <span className="font-medium tabular-nums">
                  {(brushRadius * 100).toFixed(1)}%
                </span>
              </div>
              <UiSlider
                aria-label="Brush radius"
                min={brushParameter.min}
                max={brushParameter.max}
                step={brushParameter.step}
                value={[brushRadius]}
                onValueChange={(nextValue) =>
                  onBrushRadiusChange(nextValue[0] ?? brushRadius)
                }
              />
            </div>
          )}
        </div>

        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              aria-label="Clear manual enclosed areas"
              disabled={enclosedChromaSeedCount === 0}
              title="Clear manual enclosed areas"
              onClick={onClearEnclosedAreas}
              className="flex h-8 w-8 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-muted-foreground"
            >
              <Trash2 className="h-4 w-4" aria-hidden />
            </button>
          </TooltipTrigger>
          <UiTooltipContent side="right">
            Clear manual areas
            {enclosedChromaSeedCount > 0
              ? " (" + enclosedChromaSeedCount + ")"
              : ""}
          </UiTooltipContent>
        </Tooltip>
      </div>
    </TooltipProvider>
  );
}
